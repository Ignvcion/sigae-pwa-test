// Apoderados asociados a un estudiante (RF57 / CU90, CU91).
//
// Cada estudiante tiene un único apoderado titular (estudiante.Apoderado_Usuario_Id) y
// hasta MAX_SUPLENTES suplentes (tabla apoderado_suplente). Ambos son "apoderados
// asociados" para efectos de acceso a la información del estudiante (RNF04).

const MAX_SUPLENTES = 4;

/**
 * Condición SQL: el usuario es titular o suplente del estudiante con alias `e`.
 * Usa dos parámetros, ambos con el Usuario_Id del apoderado.
 */
const condicionApoderadoAsociado = (e = 'e') => `(
  ${e}.Apoderado_Usuario_Id = ?
  OR EXISTS (SELECT 1 FROM apoderado_suplente s_ap
              WHERE s_ap.Estudiante_Id = ${e}.Estudiante_Id AND s_ap.Suplente_Usuario_Id = ?)
)`;

/** Expresión SQL con el rol del usuario respecto del estudiante: 'Titular' o 'Suplente'. Un parámetro. */
const rolApoderadoSQL = (e = 'e') => `IF(${e}.Apoderado_Usuario_Id = ?, 'Titular', 'Suplente')`;

/** ¿El usuario es titular o suplente del estudiante (no eliminado)? */
async function esApoderadoDelEstudiante(conn, apoderadoId, estudianteId) {
  const [filas] = await conn.query(
    `SELECT 1 FROM estudiante e
      WHERE e.Estudiante_Id = ? AND e.Estudiante_Fecha_Eliminacion IS NULL
        AND ${condicionApoderadoAsociado('e')}
      LIMIT 1`,
    [estudianteId, apoderadoId, apoderadoId]
  );
  return filas.length > 0;
}

// Correo de contacto: el apoderado tiene correo personal; si además es docente o
// administrador puede tener solo el institucional.
const SELECT_CONTACTO = `
  u.Usuario_Id, u.Usuario_Nombre_Completo, u.Usuario_RUT, u.Usuario_Telefono,
  COALESCE(u.Apoderado_Correo_Natural, u.Docente_Correo_Institucional, u.Administrador_Correo_Institucional) AS Usuario_Correo,
  u.Usuario_Estado_Cuenta`;

/**
 * Titular y suplentes de un estudiante con sus datos de contacto (CU90, CU91).
 * Devuelve null si el estudiante no existe.
 */
async function obtenerApoderadosEstudiante(conn, estudianteId) {
  const [estudiantes] = await conn.query(
    `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Curso_Id, e.Apoderado_Usuario_Id, c.Curso_Nombre
       FROM estudiante e
       LEFT JOIN curso c ON c.Curso_Id = e.Curso_Id
      WHERE e.Estudiante_Id = ?`,
    [estudianteId]
  );
  if (estudiantes.length === 0) return null;
  const { Apoderado_Usuario_Id: titularId, ...estudiante } = estudiantes[0];

  let titular = null;
  if (titularId) {
    const [filas] = await conn.query(`SELECT ${SELECT_CONTACTO} FROM usuario u WHERE u.Usuario_Id = ?`, [titularId]);
    titular = filas[0] || null;
  }
  const [suplentes] = await conn.query(
    `SELECT ${SELECT_CONTACTO}
       FROM apoderado_suplente s
       JOIN usuario u ON u.Usuario_Id = s.Suplente_Usuario_Id
      WHERE s.Estudiante_Id = ?
      ORDER BY s.Apoderado_Suplente_Id`,
    [estudianteId]
  );
  return { estudiante, titular, suplentes };
}

module.exports = {
  MAX_SUPLENTES,
  condicionApoderadoAsociado,
  rolApoderadoSQL,
  esApoderadoDelEstudiante,
  obtenerApoderadosEstudiante,
};
