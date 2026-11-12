// utils/notificaciones.js
// CU101: notificaciones de mensajes y citaciones dentro de la plataforma, en la
// tabla `notificacion` (reservada desde el Incremento 4, sin cambios de esquema).
//
// Qué genera una notificación (y a quién):
//   - Mensaje nuevo                 → a la contraparte de la conversación.
//   - Citación nueva (docente)      → al apoderado citado.
//   - Solicitud de citación         → al docente (la pidió el apoderado).
//   - Citación confirmada, cancelada o reprogramada → a las partes de la
//     citación (docente y apoderado), menos quien hizo el cambio.
//
// Para no llenar la lista: mientras haya una notificación sin leer del mismo
// usuario sobre la misma citación (o la misma conversación), se actualiza esa
// (tipo, fecha y último mensaje) en vez de crear otra.
//
// La tabla no guarda textos: el título y el detalle se arman al listar, con los
// datos actuales del mensaje o la citación. Si el mensaje o la citación se
// eliminan, la notificación se borra en cascada (CU101, Excepción 1).
//
// Una notificación nunca hace fallar la acción que la origina: los errores se
// registran en la consola y la acción sigue.

const TIPOS = Object.freeze({
  MENSAJE: 'Mensaje',
  CITACION_NUEVA: 'Citación nueva',
  SOLICITUD_CITACION: 'Solicitud de citación',
  CITACION_CONFIRMADA: 'Citación confirmada',
  CITACION_CANCELADA: 'Citación cancelada',
  CITACION_REPROGRAMADA: 'Citación reprogramada',
});

const TITULOS = {
  [TIPOS.CITACION_NUEVA]: 'Nueva citación',
  [TIPOS.SOLICITUD_CITACION]: 'Solicitud de citación',
  [TIPOS.CITACION_CONFIRMADA]: 'Citación confirmada',
  [TIPOS.CITACION_CANCELADA]: 'Citación cancelada',
  [TIPOS.CITACION_REPROGRAMADA]: 'Citación reprogramada',
};

const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 100;

/** Destinatarios válidos, sin repetir y sin quien hizo la acción. */
function destinatarios(ids, excluirId) {
  return [...new Set((ids || []).map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0 && id !== Number(excluirId));
}

/**
 * Notifica una novedad de una citación. `usuarioIds`: posibles destinatarios
 * (docente y apoderado); `actorId`: quien hizo el cambio (no se notifica).
 */
async function notificarCitacion(db, { citacionId, tipo, usuarioIds, actorId }) {
  for (const usuarioId of destinatarios(usuarioIds, actorId)) {
    try {
      const [r] = await db.query(
        `UPDATE notificacion SET Notificacion_Tipo = ?, Notificacion_Fecha_Hora = NOW()
          WHERE Usuario_Id = ? AND Citacion_Id = ? AND Notificacion_Leida = 0`,
        [tipo, usuarioId, citacionId]
      );
      if (!r?.affectedRows) {
        await db.query(
          'INSERT INTO notificacion (Notificacion_Tipo, Usuario_Id, Citacion_Id) VALUES (?, ?, ?)',
          [tipo, usuarioId, citacionId]
        );
      }
    } catch (error) {
      console.error('notificarCitacion:', error.message);
    }
  }
}

/** Notifica un mensaje nuevo al destinatario (una notificación sin leer por conversación). */
async function notificarMensaje(db, { mensajeId, conversacionId, destinatarioId }) {
  const [usuarioId] = destinatarios([destinatarioId]);
  if (!usuarioId) return;
  try {
    const [r] = await db.query(
      `UPDATE notificacion n
         JOIN mensaje m ON m.Mensaje_Id = n.Mensaje_Id
          SET n.Mensaje_Id = ?, n.Notificacion_Fecha_Hora = NOW()
        WHERE n.Usuario_Id = ? AND n.Notificacion_Leida = 0 AND m.Conversacion_Id = ?`,
      [mensajeId, usuarioId, conversacionId]
    );
    if (!r?.affectedRows) {
      await db.query(
        'INSERT INTO notificacion (Notificacion_Tipo, Usuario_Id, Mensaje_Id) VALUES (?, ?, ?)',
        [TIPOS.MENSAJE, usuarioId, mensajeId]
      );
    }
  } catch (error) {
    console.error('notificarMensaje:', error.message);
  }
}

/** Marca como leídas las notificaciones del usuario sobre una conversación (al abrirla). */
async function marcarLeidasConversacion(db, { usuarioId, conversacionId }) {
  try {
    await db.query(
      `UPDATE notificacion n
         JOIN mensaje m ON m.Mensaje_Id = n.Mensaje_Id
          SET n.Notificacion_Leida = 1
        WHERE n.Usuario_Id = ? AND n.Notificacion_Leida = 0 AND m.Conversacion_Id = ?`,
      [usuarioId, conversacionId]
    );
  } catch (error) {
    console.error('marcarLeidasConversacion:', error.message);
  }
}

/** Marca como leídas las notificaciones del usuario sobre una citación (al ver su detalle). */
async function marcarLeidasCitacion(db, { usuarioId, citacionId }) {
  try {
    await db.query(
      'UPDATE notificacion SET Notificacion_Leida = 1 WHERE Usuario_Id = ? AND Citacion_Id = ? AND Notificacion_Leida = 0',
      [usuarioId, citacionId]
    );
  } catch (error) {
    console.error('marcarLeidasCitacion:', error.message);
  }
}

// Notificaciones del usuario con los datos para armar el texto. Rol_Destinatario:
// el perfil (Docente/Apoderado) con que el usuario participa en el mensaje o la citación.
const SQL_NOTIFICACIONES = `
  SELECT n.Notificacion_Id, n.Notificacion_Tipo, n.Notificacion_Fecha_Hora, n.Notificacion_Leida,
         n.Mensaje_Id, n.Citacion_Id,
         m.Conversacion_Id, LEFT(m.Mensaje_Contenido, 140) AS Mensaje_Extracto,
         c.Citacion_Fecha, c.Citacion_Tramo_Horario, c.Citacion_Estado,
         e.Estudiante_Nombre_Completo,
         CASE WHEN COALESCE(cv.Docente_Usuario_Id, c.Docente_Usuario_Id) = n.Usuario_Id
              THEN 'Docente' ELSE 'Apoderado' END AS Rol_Destinatario,
         CASE WHEN COALESCE(cv.Docente_Usuario_Id, c.Docente_Usuario_Id) = n.Usuario_Id
              THEN ua.Usuario_Nombre_Completo ELSE ud.Usuario_Nombre_Completo END AS Contraparte
    FROM notificacion n
    LEFT JOIN mensaje m       ON m.Mensaje_Id = n.Mensaje_Id
    LEFT JOIN conversacion cv ON cv.Conversacion_Id = m.Conversacion_Id
    LEFT JOIN citacion c      ON c.Citacion_Id = n.Citacion_Id
    LEFT JOIN estudiante e    ON e.Estudiante_Id = c.Estudiante_Id
    LEFT JOIN usuario ud      ON ud.Usuario_Id = COALESCE(cv.Docente_Usuario_Id, c.Docente_Usuario_Id)
    LEFT JOIN usuario ua      ON ua.Usuario_Id = COALESCE(cv.Apoderado_Usuario_Id, c.Apoderado_Usuario_Id)
   WHERE n.Usuario_Id = ?`;

const ROLES_FILTRO = ['Docente', 'Apoderado'];

/** "2026-11-12" → "12-11-2026" */
function fechaCorta(fecha) {
  if (!fecha) return '';
  const iso = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const [a, m, d] = iso.split('-');
  return `${d}-${m}-${a}`;
}

/** Título, detalle y enlace de una fila de SQL_NOTIFICACIONES. */
function describir(fila) {
  const base = {
    id: fila.Notificacion_Id,
    tipo: fila.Notificacion_Tipo,
    fecha: fila.Notificacion_Fecha_Hora,
    leida: Boolean(fila.Notificacion_Leida),
    rol: fila.Rol_Destinatario,
  };
  if (fila.Mensaje_Id) {
    return {
      ...base,
      titulo: `Nuevo mensaje${fila.Contraparte ? ` de ${fila.Contraparte}` : ''}`,
      detalle: fila.Mensaje_Extracto || '',
      enlace: `/mensajes?conversacion=${fila.Conversacion_Id}`,
    };
  }
  const partes = [
    fila.Estudiante_Nombre_Completo,
    [fechaCorta(fila.Citacion_Fecha), fila.Citacion_Tramo_Horario].filter(Boolean).join(' '),
    fila.Contraparte ? `con ${fila.Contraparte}` : null,
  ].filter(Boolean);
  return {
    ...base,
    titulo: TITULOS[fila.Notificacion_Tipo] || fila.Notificacion_Tipo,
    detalle: partes.join(' · '),
    enlace: `/citaciones?citacion=${fila.Citacion_Id}`,
  };
}

/**
 * Notificaciones del usuario (las más recientes primero) y cuántas hay sin leer.
 * `rol` (Docente/Apoderado) filtra las del perfil con que ingresó.
 */
async function listarNotificaciones(db, { usuarioId, rol = null, limite = LIMITE_POR_DEFECTO }) {
  const filtroRol = ROLES_FILTRO.includes(rol) ? rol : null;
  const tope = Math.min(Math.max(Number(limite) || LIMITE_POR_DEFECTO, 1), LIMITE_MAXIMO);
  const [filas] = await db.query(
    `SELECT * FROM (${SQL_NOTIFICACIONES}) x
      WHERE (? IS NULL OR x.Rol_Destinatario = ?)
      ORDER BY x.Notificacion_Fecha_Hora DESC, x.Notificacion_Id DESC
      LIMIT ?`,
    [usuarioId, filtroRol, filtroRol, tope]
  );
  const [[{ noLeidas }]] = await db.query(
    `SELECT COUNT(*) AS noLeidas FROM (${SQL_NOTIFICACIONES}) x
      WHERE x.Notificacion_Leida = 0 AND (? IS NULL OR x.Rol_Destinatario = ?)`,
    [usuarioId, filtroRol, filtroRol]
  );
  return { noLeidas: Number(noLeidas) || 0, notificaciones: filas.map(describir) };
}

/** Marca todas las notificaciones del usuario como leídas (opcionalmente solo las de un rol). */
async function marcarTodasLeidas(db, { usuarioId, rol = null }) {
  const filtroRol = ROLES_FILTRO.includes(rol) ? rol : null;
  // En dos pasos: MariaDB no permite actualizar una tabla leyéndola en la misma consulta
  const [filas] = await db.query(
    `SELECT x.Notificacion_Id FROM (${SQL_NOTIFICACIONES}) x
      WHERE x.Notificacion_Leida = 0 AND (? IS NULL OR x.Rol_Destinatario = ?)`,
    [usuarioId, filtroRol, filtroRol]
  );
  if (filas.length === 0) return 0;
  const [r] = await db.query(
    'UPDATE notificacion SET Notificacion_Leida = 1 WHERE Usuario_Id = ? AND Notificacion_Id IN (?)',
    [usuarioId, filas.map((f) => f.Notificacion_Id)]
  );
  return r?.affectedRows || 0;
}

module.exports = {
  TIPOS,
  notificarCitacion,
  notificarMensaje,
  marcarLeidasConversacion,
  marcarLeidasCitacion,
  listarNotificaciones,
  marcarTodasLeidas,
  describir,
};
