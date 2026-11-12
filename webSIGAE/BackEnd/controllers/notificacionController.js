// CU101: notificaciones de mensajes y citaciones (reglas en utils/notificaciones.js)
const pool = require('../config/db');
const { listarNotificaciones, marcarTodasLeidas } = require('../utils/notificaciones');

// GET /api/notificaciones?rol=Docente|Apoderado&limite=20
const getNotificaciones = async (req, res) => {
  try {
    const datos = await listarNotificaciones(pool, {
      usuarioId: req.user.id,
      rol: req.query.rol,
      limite: req.query.limite,
    });
    return res.json(datos);
  } catch (error) {
    console.error('getNotificaciones:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar las notificaciones' });
  }
};

// PATCH /api/notificaciones/:id/leida
const marcarLeida = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ mensaje: 'Notificación no válida' });
  try {
    const [r] = await pool.query(
      'UPDATE notificacion SET Notificacion_Leida = 1 WHERE Notificacion_Id = ? AND Usuario_Id = ?',
      [id, req.user.id]
    );
    if (!r.affectedRows) return res.status(404).json({ mensaje: 'La notificación no existe' });
    return res.json({ mensaje: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('marcarLeida:', error);
    return res.status(500).json({ mensaje: 'No fue posible actualizar la notificación' });
  }
};

// PATCH /api/notificaciones/leidas   Body: { rol? }
const marcarLeidas = async (req, res) => {
  try {
    const actualizadas = await marcarTodasLeidas(pool, { usuarioId: req.user.id, rol: req.body?.rol });
    return res.json({ mensaje: 'Notificaciones marcadas como leídas', actualizadas });
  } catch (error) {
    console.error('marcarLeidas:', error);
    return res.status(500).json({ mensaje: 'No fue posible actualizar las notificaciones' });
  }
};

module.exports = { getNotificaciones, marcarLeida, marcarLeidas };
