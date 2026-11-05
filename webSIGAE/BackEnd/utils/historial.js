// utils/historial.js
// Registro de auditoría en la tabla `historial` (ver docs/tabla-historial.md).
// Se llama con la MISMA conexión de la transacción que hace el cambio, para
// que el cambio y su registro se confirmen o se reviertan juntos.
//
// Las columnas de valor son NOT NULL: un valor vacío (p. ej. "sin apoderado")
// se guarda como el texto SIN_VALOR.
const SIN_VALOR = 'NULL';

const comoTexto = (valor) => (valor === null || valor === undefined ? SIN_VALOR : String(valor));

async function registrarHistorial(conn, {
  atributo,
  anterior,
  nuevo,
  descripcion,
  responsableId,
  usuarioId = null,
  estudianteId = null,
  citacionId = null,
  horarioAsignaturaId = null,
}) {
  await conn.query(
    `INSERT INTO historial (
       Historial_Valor_Anterior, Historial_Hora_Registro, Historial_Descripcion_Cambio,
       Historial_Atributo_Modificado, Historial_Valor_Nuevo, Historial_Fecha_Registro,
       Usuario_Id, Estudiante_Id, Citacion_Id, Horario_Asignatura_Id, Usuario_Responsable_Id
     ) VALUES (?, CURTIME(), ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?)`,
    [
      comoTexto(anterior), descripcion, atributo, comoTexto(nuevo),
      usuarioId, estudianteId, citacionId, horarioAsignaturaId, responsableId,
    ]
  );
}

module.exports = { registrarHistorial, SIN_VALOR };
