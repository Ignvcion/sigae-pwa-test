// controllers/especialidadController.js
// Catálogo de especialidades docentes (RF04), usado como lista de etiquetas al
// registrar o editar un docente y como filtro del listado de docentes (CU31).
const pool = require('../config/db');

// GET /api/especialidades
const getEspecialidades = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT e.Especialidad_Id, e.Especialidad_Nombre, COUNT(de.Docente_Usuario_Id) AS Total_Docentes
         FROM especialidad e
         LEFT JOIN docente_especialidad de ON de.Especialidad_Id = e.Especialidad_Id
        GROUP BY e.Especialidad_Id, e.Especialidad_Nombre
        ORDER BY e.Especialidad_Nombre`
    );
    return res.json(filas.map((f) => ({ ...f, Total_Docentes: Number(f.Total_Docentes) })));
  } catch (error) {
    console.error('getEspecialidades:', error);
    return res.status(500).json({ mensaje: 'No fue posible obtener las especialidades' });
  }
};

module.exports = { getEspecialidades };
