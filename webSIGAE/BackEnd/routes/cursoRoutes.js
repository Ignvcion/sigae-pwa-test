const express = require('express');
const { getCursos, getNiveles, crearCurso, getAsignaturasDeCurso, getAsignaturasDisponibles, asignarAsignaturas } = require('../controllers/cursoController');
const { designarProfesorJefe, retirarProfesorJefe, getEstudiantesDeCurso, getMisJefaturas } = require('../controllers/profesorJefeController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/', verifyToken, getCursos);
router.get('/niveles', verifyToken, getNiveles);
// RF60: cursos de los que el docente autenticado es profesor jefe — antes de /:id
router.get('/mis-jefaturas', verifyToken, getMisJefaturas);
router.post('/', verifyToken, verifyAdmin, crearCurso);

router.get('/:id/asignaturas/disponibles', verifyToken, getAsignaturasDisponibles);
router.get('/:id/asignaturas', verifyToken, getAsignaturasDeCurso);
router.post('/:id/asignaturas', verifyToken, verifyAdmin, asignarAsignaturas);

// RF60: profesor jefe (CU95, CU96) y estudiantes del curso (CU97)
router.put('/:id/profesor-jefe', verifyToken, verifyAdmin, designarProfesorJefe);
router.delete('/:id/profesor-jefe', verifyToken, verifyAdmin, retirarProfesorJefe);
router.get('/:id/estudiantes', verifyToken, getEstudiantesDeCurso);

module.exports = router;