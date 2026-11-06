// utils/limpiezaPeriodo.js
// Limpieza al "Iniciar nuevo período" (docs/decisiones-rf60-rf61-periodos.txt, punto 6).
//
// Al pasar del período V al V+1:
//   1. Se eliminan los cursos de períodos < V (los de dos cambios atrás) con sus
//      estudiantes (egresados, en práctica, retirados) y todo lo asociado:
//      historial, citaciones, situaciones finales, evaluaciones, horarios y
//      asignaturas del curso. Los suplentes se borran en cascada.
//   2. Apoderados sin asociaciones (ni titular ni suplente de un estudiante vigente):
//      - con otro rol (docente/administrador): se les quita el rol de apoderado;
//      - solo apoderados, ya marcados en un cambio anterior: se eliminan, con sus
//        conversaciones, mensajes, citaciones e historial;
//      - solo apoderados, sin marca: quedan inactivos y marcados con V+1.
// Antes de ejecutar, el super administrador descarga el respaldo (Excel) con todo
// lo que se va a eliminar o desactivar, para subirlo al Drive de respaldos.

const lista = (ids) => (ids.length ? ids : [0]); // IN (?) con lista vacía no es SQL válido
const columna = (filas, campo) => (Array.isArray(filas) ? filas.map((f) => Number(f[campo])) : []);

/** Ids de todo lo que se eliminaría o modificaría al pasar a un nuevo período. */
async function calcularLimpieza(conn, vigente) {
  const [cursos] = await conn.query(
    'SELECT Curso_Id FROM curso WHERE Curso_Periodo_Lectivo < ?', [vigente]
  );
  const cursoIds = columna(cursos, 'Curso_Id');
  const [estudiantes] = await conn.query(
    'SELECT Estudiante_Id FROM estudiante WHERE Curso_Id IN (?)', [lista(cursoIds)]
  );
  const estudianteIds = columna(estudiantes, 'Estudiante_Id');
  const [horarios] = await conn.query(
    'SELECT Horario_Asignatura_Id FROM horario_asignatura WHERE Curso_Id IN (?)', [lista(cursoIds)]
  );
  const horarioIds = columna(horarios, 'Horario_Asignatura_Id');

  // Apoderados sin asociación con estudiantes que sigan en el sistema
  const sinAsociaciones = `
    u.Es_Apoderado = 1
    AND NOT EXISTS (SELECT 1 FROM estudiante e
                     WHERE e.Apoderado_Usuario_Id = u.Usuario_Id AND e.Estudiante_Fecha_Eliminacion IS NULL
                       AND e.Estudiante_Id NOT IN (?))
    AND NOT EXISTS (SELECT 1 FROM apoderado_suplente s JOIN estudiante e2 ON e2.Estudiante_Id = s.Estudiante_Id
                     WHERE s.Suplente_Usuario_Id = u.Usuario_Id AND e2.Estudiante_Fecha_Eliminacion IS NULL
                       AND s.Estudiante_Id NOT IN (?))`;
  const p = [lista(estudianteIds), lista(estudianteIds)];
  const [quitarRol] = await conn.query(
    `SELECT u.Usuario_Id FROM usuario u WHERE ${sinAsociaciones} AND (u.Es_Docente = 1 OR u.Es_Administrador = 1)`, p
  );
  const [eliminar] = await conn.query(
    `SELECT u.Usuario_Id FROM usuario u WHERE ${sinAsociaciones}
        AND u.Es_Docente = 0 AND u.Es_Administrador = 0 AND u.Apoderado_Sin_Asociaciones_Desde IS NOT NULL`, p
  );
  const [desactivar] = await conn.query(
    `SELECT u.Usuario_Id FROM usuario u WHERE ${sinAsociaciones}
        AND u.Es_Docente = 0 AND u.Es_Administrador = 0 AND u.Apoderado_Sin_Asociaciones_Desde IS NULL`, p
  );
  const apoderadosEliminar = columna(eliminar, 'Usuario_Id');

  const [citaciones] = await conn.query(
    'SELECT Citacion_Id FROM citacion WHERE Estudiante_Id IN (?) OR Apoderado_Usuario_Id IN (?)',
    [lista(estudianteIds), lista(apoderadosEliminar)]
  );

  return {
    cursoIds,
    estudianteIds,
    horarioIds,
    citacionIds: columna(citaciones, 'Citacion_Id'),
    apoderados: {
      eliminar: apoderadosEliminar,
      desactivar: columna(desactivar, 'Usuario_Id'),
      quitarRol: columna(quitarRol, 'Usuario_Id'),
    },
  };
}

const conteo = (l) => ({
  cursos: l.cursoIds.length,
  estudiantes: l.estudianteIds.length,
  horarios: l.horarioIds.length,
  citaciones: l.citacionIds.length,
  apoderadosEliminar: l.apoderados.eliminar.length,
  apoderadosDesactivar: l.apoderados.desactivar.length,
  apoderadosQuitarRol: l.apoderados.quitarRol.length,
});

/** Filas de cada tabla afectada, para el respaldo Excel. */
async function datosRespaldo(conn, l) {
  const q = async (sql, params) => {
    const [filas] = await conn.query(sql, params);
    return Array.isArray(filas) ? filas : [];
  };
  const usuariosAfectados = [...l.apoderados.eliminar, ...l.apoderados.desactivar, ...l.apoderados.quitarRol];
  return {
    Cursos: await q(
      `SELECT c.Curso_Id, c.Curso_Nombre, c.Curso_Periodo_Lectivo, n.Nivel_Educativo_Nombre, c.Curso_Profesor_Jefe_Usuario_Id
         FROM curso c JOIN nivel_educativo n ON n.Nivel_Educativo_Id = c.Nivel_Educativo_Id WHERE c.Curso_Id IN (?)`,
      [lista(l.cursoIds)]
    ),
    Estudiantes: await q('SELECT * FROM estudiante WHERE Estudiante_Id IN (?)', [lista(l.estudianteIds)]),
    Suplentes: await q('SELECT * FROM apoderado_suplente WHERE Estudiante_Id IN (?) OR Suplente_Usuario_Id IN (?)',
      [lista(l.estudianteIds), lista(l.apoderados.eliminar)]),
    'Situaciones finales': await q('SELECT * FROM situacion_final WHERE Estudiante_Id IN (?) OR Curso_Id IN (?)',
      [lista(l.estudianteIds), lista(l.cursoIds)]),
    Historial: await q(
      `SELECT * FROM historial WHERE Estudiante_Id IN (?) OR Citacion_Id IN (?) OR Horario_Asignatura_Id IN (?)
          OR Usuario_Id IN (?) OR Usuario_Responsable_Id IN (?)`,
      [lista(l.estudianteIds), lista(l.citacionIds), lista(l.horarioIds), lista(l.apoderados.eliminar), lista(l.apoderados.eliminar)]
    ),
    Citaciones: await q('SELECT * FROM citacion WHERE Citacion_Id IN (?)', [lista(l.citacionIds)]),
    Evaluaciones: await q('SELECT * FROM evaluacion WHERE Curso_Id IN (?)', [lista(l.cursoIds)]),
    Horarios: await q('SELECT * FROM horario_asignatura WHERE Horario_Asignatura_Id IN (?)', [lista(l.horarioIds)]),
    'Asignaturas de curso': await q('SELECT * FROM tieneasig WHERE Curso_Id IN (?)', [lista(l.cursoIds)]),
    Apoderados: (await q(
      `SELECT Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo, Usuario_Telefono, Apoderado_Correo_Natural,
              Es_Docente, Es_Administrador, Usuario_Estado_Cuenta, Apoderado_Sin_Asociaciones_Desde
         FROM usuario WHERE Usuario_Id IN (?)`,
      [lista(usuariosAfectados)]
    )).map((u) => ({
      Accion: l.apoderados.eliminar.includes(Number(u.Usuario_Id)) ? 'Eliminar'
        : l.apoderados.desactivar.includes(Number(u.Usuario_Id)) ? 'Desactivar' : 'Quitar rol de apoderado',
      ...u,
    })),
    Conversaciones: await q(
      `SELECT c.*, (SELECT COUNT(*) FROM mensaje m WHERE m.Conversacion_Id = c.Conversacion_Id) AS Total_Mensajes
         FROM conversacion c WHERE c.Apoderado_Usuario_Id IN (?)`,
      [lista(l.apoderados.eliminar)]
    ),
    Mensajes: await q(
      `SELECT m.* FROM mensaje m JOIN conversacion c ON c.Conversacion_Id = m.Conversacion_Id
        WHERE c.Apoderado_Usuario_Id IN (?)`,
      [lista(l.apoderados.eliminar)]
    ),
  };
}

/** Ejecuta la limpieza dentro de la transacción del cambio de período. */
async function ejecutarLimpieza(conn, l, nuevoVigente) {
  const e = lista(l.estudianteIds);
  const c = lista(l.cursoIds);
  const ap = lista(l.apoderados.eliminar);
  const run = (sql, params) => conn.query(sql, params);

  // Orden por las llaves foráneas (RESTRICT): primero lo que referencia, después lo referenciado
  await run(
    `DELETE FROM historial WHERE Estudiante_Id IN (?) OR Citacion_Id IN (?) OR Horario_Asignatura_Id IN (?)
        OR Usuario_Id IN (?) OR Usuario_Responsable_Id IN (?)`,
    [e, lista(l.citacionIds), lista(l.horarioIds), ap, ap]
  );
  await run('DELETE FROM citacion WHERE Citacion_Id IN (?)', [lista(l.citacionIds)]); // notificaciones: CASCADE
  await run('DELETE FROM situacion_final WHERE Estudiante_Id IN (?) OR Curso_Id IN (?)', [e, c]);
  await run('DELETE FROM evaluacion WHERE Curso_Id IN (?)', [c]);
  await run('DELETE FROM horario_asignatura WHERE Curso_Id IN (?)', [c]);
  await run('DELETE FROM tieneasig WHERE Curso_Id IN (?)', [c]);
  await run('DELETE FROM estudiante WHERE Estudiante_Id IN (?)', [e]); // apoderado_suplente: CASCADE
  await run('DELETE FROM curso WHERE Curso_Id IN (?)', [c]);

  // Apoderados
  await run('DELETE FROM apoderado_suplente WHERE Suplente_Usuario_Id IN (?)', [ap]);
  // Un estudiante eliminado lógicamente puede seguir apuntando al apoderado como titular
  await run('UPDATE estudiante SET Apoderado_Usuario_Id = NULL WHERE Apoderado_Usuario_Id IN (?)', [ap]);
  await run('DELETE FROM conversacion WHERE Apoderado_Usuario_Id IN (?)', [ap]); // mensajes: CASCADE
  await run('DELETE FROM usuario WHERE Usuario_Id IN (?)', [ap]); // sesiones, notificaciones, recuperación: CASCADE
  await run(
    `UPDATE usuario SET Usuario_Estado_Cuenta = 0, Apoderado_Sin_Asociaciones_Desde = ?
      WHERE Usuario_Id IN (?)`,
    [nuevoVigente, lista(l.apoderados.desactivar)]
  );
  await run(
    'UPDATE sesion SET Sesion_Estado = 0, Sesion_Fecha_Expiracion = NOW() WHERE Usuario_Id IN (?) AND Sesion_Estado = 1',
    [lista(l.apoderados.desactivar)]
  );
  await run('UPDATE usuario SET Es_Apoderado = 0 WHERE Usuario_Id IN (?)', [lista(l.apoderados.quitarRol)]);

  // CU107: la disponibilidad laboral es por período; la de períodos ya cerrados no se usa más
  await run('DELETE FROM disponibilidad_docente WHERE Disponibilidad_Docente_Periodo_Lectivo < ?', [nuevoVigente]);
}

module.exports = { calcularLimpieza, conteo, datosRespaldo, ejecutarLimpieza };
