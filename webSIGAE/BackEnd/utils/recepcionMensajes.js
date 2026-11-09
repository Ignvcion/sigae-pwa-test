// utils/recepcionMensajes.js
// RF54 / CU85, CU86: recepción de mensajes de apoderados.
//
// - usuario.Docente_Recepcion_Mensajes: recepción general del docente (CU85). Desactivada,
//   ningún apoderado puede responderle; puede seguir leyendo sus mensajes.
// - conversacion.Conversacion_Habilitada_Hasta: con la recepción general desactivada, el
//   docente puede habilitar que un apoderado responda en una conversación hasta una fecha y
//   hora (CU86). Al vencer, la recepción se cierra sola (se compara con NOW()).
// - conversacion.Conversacion_Habilitada_Citacion_Id: si se habilitó desde una citación y
//   esta se cancela, el período se cierra (CU86 Excepción 2); si se reprograma, el término
//   se mueve al final del nuevo tramo.
// - El docente siempre puede escribir; la restricción es solo para el apoderado.

const MENSAJE_SIN_RECEPCION = 'El docente no está recibiendo mensajes de apoderados en este momento. '
  + 'Puedes leer los mensajes, pero no responder.';

/** SQL: fecha y hora de término vigente ("YYYY-MM-DDTHH:MM") o NULL si no hay período abierto. */
const habilitadaHastaSQL = (c = 'c') => `CASE WHEN ${c}.Conversacion_Habilitada_Hasta > NOW()
    THEN DATE_FORMAT(${c}.Conversacion_Habilitada_Hasta, '%Y-%m-%dT%H:%i') ELSE NULL END`;

/** SQL (0/1): ¿puede responder el apoderado en la conversación `c` del docente `d`? */
const apoderadoPuedeResponderSQL = (c = 'c', d = 'docente') => `(${d}.Docente_Recepcion_Mensajes = 1
    OR (${c}.Conversacion_Habilitada_Hasta IS NOT NULL AND ${c}.Conversacion_Habilitada_Hasta > NOW()))`;

/** Campos de recepción de una fila de conversación, normalizados para el frontend. */
const camposRecepcion = (fila) => ({
  Recepcion_General: Number(fila.Recepcion_General) === 1,
  Habilitada_Hasta: fila.Habilitada_Hasta || null,
  Habilitada_Por_Citacion: fila.Habilitada_Citacion_Id ? Number(fila.Habilitada_Citacion_Id) : null,
  Apoderado_Puede_Responder: Number(fila.Apoderado_Puede_Responder) === 1,
});

/** Fin de una citación ("2026-11-12", "15:30 - 16:00") → "2026-11-12 16:00:00". null si el tramo no es válido. */
function finDeCitacion(fecha, tramo) {
  const m = /^\d{2}:\d{2} - (\d{2}:\d{2})$/.exec(String(tramo ?? ''));
  return m && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? `${fecha} ${m[1]}:00` : null;
}

/** CU86 Excepción 2: la citación se canceló, se cierra el período habilitado desde ella. */
async function cerrarPorCitacion(conn, citacionId) {
  await conn.query(
    `UPDATE conversacion
        SET Conversacion_Habilitada_Hasta = NULL, Conversacion_Habilitada_Citacion_Id = NULL
      WHERE Conversacion_Habilitada_Citacion_Id = ?`,
    [citacionId]
  );
}

/** La citación se reprogramó: el período habilitado desde ella termina con el nuevo tramo. */
async function moverPorCitacion(conn, citacionId, fecha, tramo) {
  const fin = finDeCitacion(fecha, tramo);
  if (!fin) return;
  await conn.query(
    'UPDATE conversacion SET Conversacion_Habilitada_Hasta = ? WHERE Conversacion_Habilitada_Citacion_Id = ?',
    [fin, citacionId]
  );
}

module.exports = {
  MENSAJE_SIN_RECEPCION,
  habilitadaHastaSQL,
  apoderadoPuedeResponderSQL,
  camposRecepcion,
  finDeCitacion,
  cerrarPorCitacion,
  moverPorCitacion,
};
