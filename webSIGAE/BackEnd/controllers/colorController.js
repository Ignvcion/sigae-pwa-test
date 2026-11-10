// controllers/colorController.js
// Colores que identifican a cada asignatura y a cada docente (utils/colores.js).
//   GET /api/colores                     Mapas id → color (cualquier usuario autenticado:
//                                        los horarios de docentes y apoderados los usan)
//   PUT /api/colores/asignaturas/:id     { color }  Administración
//   PUT /api/colores/docentes/:id        { color }  Administración
const pool = require('../config/db');
const { normalizarColor, colorPorDefecto, MENSAJE_COLOR_INVALIDO } = require('../utils/colores');

const getColores = async (req, res) => {
  try {
    const [asignaturas] = await pool.query('SELECT Asignatura_Id AS id, Asignatura_Color AS color FROM asignatura');
    const [docentes] = await pool.query('SELECT Usuario_Id AS id, Docente_Color AS color FROM usuario WHERE Es_Docente = 1');
    const mapa = (filas) => Object.fromEntries(filas.map((f) => [f.id, normalizarColor(f.color) || colorPorDefecto(f.id)]));
    res.json({ asignaturas: mapa(asignaturas), docentes: mapa(docentes) });
  } catch (error) {
    console.error('getColores:', error);
    res.status(500).json({ error: 'No fue posible obtener los colores' });
  }
};

const cambiarColorAsignatura = async (req, res) => {
  const color = normalizarColor(req.body?.color);
  if (!color) return res.status(400).json({ error: MENSAJE_COLOR_INVALIDO });
  try {
    const [r] = await pool.query('UPDATE asignatura SET Asignatura_Color = ? WHERE Asignatura_Id = ?', [color, req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Asignatura no encontrada' });
    res.json({ mensaje: 'Color de la asignatura actualizado', color });
  } catch (error) {
    console.error('cambiarColorAsignatura:', error);
    res.status(500).json({ error: 'No fue posible guardar el color' });
  }
};

const cambiarColorDocente = async (req, res) => {
  const color = normalizarColor(req.body?.color);
  if (!color) return res.status(400).json({ error: MENSAJE_COLOR_INVALIDO });
  try {
    const [r] = await pool.query(
      'UPDATE usuario SET Docente_Color = ? WHERE Usuario_Id = ? AND Es_Docente = 1',
      [color, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Docente no encontrado' });
    res.json({ mensaje: 'Color del docente actualizado', color });
  } catch (error) {
    console.error('cambiarColorDocente:', error);
    res.status(500).json({ error: 'No fue posible guardar el color' });
  }
};

module.exports = { getColores, cambiarColorAsignatura, cambiarColorDocente };
