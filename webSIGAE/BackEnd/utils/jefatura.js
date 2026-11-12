// utils/jefatura.js
// Profesor jefe de curso (RF60; docs/decisiones-rf60-rf61-periodos.txt, punto 3).
//
// - Cada curso tiene un único profesor jefe (curso.Curso_Profesor_Jefe_Usuario_Id).
// - Un docente puede ser jefe de hasta MAX_JEFATURAS cursos POR PERÍODO: durante
//   el cierre puede tener 2 en el vigente y 2 en el siguiente.
// - Lo usan la designación manual (CU95/CU96) y la herencia al promover (RF61).
const { registrarHistorial, refPersona } = require('./historial');
const { columnaEsperaPrimerIngreso } = require('./primerIngreso');
const { claseVigente } = require('./clasesEliminadas');

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

/** Docente para la jefatura (con Espera_Primer_Ingreso: ver utils/primerIngreso.js). */
async function obtenerDocente(conn, docenteId, { bloquear = false } = {}) {
  const [filas] = await conn.query(
    `SELECT Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo, Es_Docente, Usuario_Estado_Cuenta,
            ${columnaEsperaPrimerIngreso('usuario')}
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

/**
 * RNF04: el docente está vinculado al curso si le hace clases (clase no eliminada) o es su
 * profesor jefe. Lo usan las consultas de datos de estudiantes, como los contactos (CU91).
 */
async function esDocenteVinculadoAlCurso(conn, docenteId, cursoId) {
  const [filas] = await conn.query(
    `SELECT 1 FROM curso c
      WHERE c.Curso_Id = ?
        AND (c.Curso_Profesor_Jefe_Usuario_Id = ?
             OR EXISTS (SELECT 1 FROM horario_asignatura ha
                         WHERE ha.Usuario_Id = ? AND ha.Curso_Id = c.Curso_Id AND ${claseVigente('ha')}))
      LIMIT 1`,
    [cursoId, docenteId, docenteId]
  );
  return Array.isArray(filas) && filas.length > 0;
}

module.exports = {
  MAX_JEFATURAS, jefaturasDelDocente, obtenerDocente, asignarJefatura, mensajeTope, nombreCurso, esDocenteVinculadoAlCurso,
};
