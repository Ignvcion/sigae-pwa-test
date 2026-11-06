// utils/jefatura.js
// Profesor jefe de curso (RF60; docs/decisiones-rf60-rf61-periodos.txt, punto 3).
//
// - Cada curso tiene un único profesor jefe (curso.Curso_Profesor_Jefe_Usuario_Id).
// - Un docente puede ser jefe de hasta MAX_JEFATURAS cursos POR PERÍODO: durante
//   el cierre puede tener 2 en el vigente y 2 en el siguiente.
// - Lo usan la designación manual (CU95/CU96) y la herencia al promover (RF61).
const { registrarHistorial, refPersona } = require('./historial');

const MAX_JEFATURAS = 2;

/**
 * Cursos de los que el docente es jefe en un período (opcionalmente excluyendo uno).
 * Bloquea las filas si se usa dentro de una transacción con `bloquear`.
 */
async function jefaturasDelDocente(conn, docenteId, periodo, { excluirCursoId = null, bloquear = false } = {}) {
  const [filas] = await conn.query(
    `SELECT Curso_Id, Curso_Nombre FROM curso
      WHERE Curso_Profesor_Jefe_Usuario_Id = ? AND Curso_Periodo_Lectivo = ?
        AND (? IS NULL OR Curso_Id <> ?)${bloquear ? ' FOR UPDATE' : ''}`,
    [docenteId, periodo, excluirCursoId, excluirCursoId]
  );
  return Array.isArray(filas) ? filas : [];
}

/** Docente apto para la jefatura: existe, tiene rol docente y la cuenta activa. */
async function obtenerDocente(conn, docenteId, { bloquear = false } = {}) {
  const [filas] = await conn.query(
    `SELECT Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo, Es_Docente, Usuario_Estado_Cuenta
       FROM usuario WHERE Usuario_Id = ?${bloquear ? ' FOR UPDATE' : ''}`,
    [docenteId]
  );
  return Array.isArray(filas) ? filas[0] || null : null;
}

const nombreCurso = (curso) => `${curso.Curso_Nombre} (${curso.Curso_Periodo_Lectivo})`;

/**
 * Deja al docente como profesor jefe del curso y lo registra en el historial.
 * Debe llamarse dentro de una transacción. Valida el tope de jefaturas del
 * período: devuelve { ok: true } o { ok: false, motivo, cursos }.
 * `curso` = fila de curso (Curso_Id, Curso_Nombre, Curso_Periodo_Lectivo,
 * Curso_Profesor_Jefe_Usuario_Id); `docente` = fila de usuario.
 */
async function asignarJefatura(conn, { curso, docente, jefeAnterior = null, responsableId, descripcion }) {
  // Bloquea al docente: dos asignaciones simultáneas no pueden pasar el tope
  await obtenerDocente(conn, docente.Usuario_Id, { bloquear: true });
  const otras = await jefaturasDelDocente(conn, docente.Usuario_Id, curso.Curso_Periodo_Lectivo, {
    excluirCursoId: curso.Curso_Id,
    bloquear: true,
  });
  if (otras.length >= MAX_JEFATURAS) {
    return { ok: false, motivo: 'TOPE', cursos: otras.map((c) => c.Curso_Nombre) };
  }

  await conn.query('UPDATE curso SET Curso_Profesor_Jefe_Usuario_Id = ? WHERE Curso_Id = ?', [
    docente.Usuario_Id,
    curso.Curso_Id,
  ]);
  await registrarHistorial(conn, {
    atributo: 'Curso_Profesor_Jefe_Usuario_Id',
    anterior: jefeAnterior ? refPersona(jefeAnterior) : null,
    nuevo: refPersona(docente),
    descripcion: `${descripcion}: ${nombreCurso(curso)}`,
    usuarioId: docente.Usuario_Id,
    responsableId,
  });
  return { ok: true };
}

const mensajeTope = (docente, cursos) =>
  `${docente.Usuario_Nombre_Completo} ya es profesor jefe de ${MAX_JEFATURAS} cursos en este período `
  + `(${cursos.join(', ')}). Un docente puede tener como máximo ${MAX_JEFATURAS} jefaturas.`;

module.exports = { MAX_JEFATURAS, jefaturasDelDocente, obtenerDocente, asignarJefatura, mensajeTope, nombreCurso };
