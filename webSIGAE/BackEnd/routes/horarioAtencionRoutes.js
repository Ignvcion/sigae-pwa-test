const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const {
  getSemanaAtencion,
  guardarSemanaAtencion,
  getMiHorarioAtencion,
  crearBloqueAtencion,
  actualizarBloqueAtencion,
  eliminarBloqueAtencion,
} = require('../controllers/horarioAtencionController');

const router = express.Router();

// RF55: el rol Docente se valida dentro del controlador; cada docente gestiona solo sus bloques.
router.use(verifyToken);

// CU87 / CU88: semana completa (tramos por día y vista por bloques de 45 minutos)
router.get('/semana', getSemanaAtencion);
router.put('/semana', guardarSemanaAtencion);
// CU87 / CU88: bloques de atención del docente autenticado
router.get('/', getMiHorarioAtencion);
// CU87: registrar bloque
router.post('/', crearBloqueAtencion);
// CU88: modificar bloque (body.confirmar = true si tiene citaciones a futuro)
router.put('/:id', actualizarBloqueAtencion);
// CU88: eliminar bloque (?confirmar=true si tiene citaciones a futuro)
router.delete('/:id', eliminarBloqueAtencion);

module.exports = router;
