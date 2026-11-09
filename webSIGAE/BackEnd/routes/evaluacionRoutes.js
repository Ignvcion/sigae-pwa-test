const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const {
  getMisAsignaciones,
  getEvaluaciones,
  crearEvaluacion,
  actualizarEvaluacion,
  eliminarEvaluacion,
} = require('../controllers/evaluacionController');

const router = express.Router();

// RF58 / RF59: los roles se validan dentro del controlador según el rol activo.
router.use(verifyToken);

// CU94: calendario mensual (?mes=AAAA-MM&rol=&estudianteId=&cursoId=&asignaturaId=)
router.get('/', getEvaluaciones);
// CU92: cursos y asignaturas del docente para el formulario
router.get('/mis-asignaciones', getMisAsignaciones);
// CU92: registrar (body.confirmar = true si la fecha tiene un evento que suspende clases)
router.post('/', crearEvaluacion);
// CU93: modificar o eliminar una evaluación propia
router.put('/:id', actualizarEvaluacion);
router.delete('/:id', eliminarEvaluacion);

module.exports = router;
