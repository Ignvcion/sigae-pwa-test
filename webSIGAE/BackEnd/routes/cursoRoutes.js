const express = require('express');
const { getCursos, getNiveles, crearCurso, getAsignaturasDeCurso, getAsignaturasDisponibles, asignarAsignaturas } = require('../controllers/cursoController');
const { designarProfesorJefe, retirarProfesorJefe, getEstudiantesDeCurso, getMisJefaturas, asignarRutaFormacion } = require('../controllers/profesorJefeController');
const { verifyToken, verifyAdmin, verifyGestionAcademica } = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/', verifyToken, getCursos);
router.get('/niveles', verifyToken, getNiveles);
// RF60: cursos de los que el docente autenticado es profesor jefe — antes de /:id
router.get('/mis-jefaturas', verifyToken, getMisJefaturas);
// Cursos, sus asignaturas y la ruta de formación: administración y etiqueta UTP.
// La jefatura (profesor jefe) es solo de la administración.
router.post('/', verifyToken, verifyGestionAcademica, crearCurso);

router.get('/:id/asignaturas/disponibles', verifyToken, getAsignaturasDisponibles);
router.get('/:id/asignaturas', verifyToken, getAsignaturasDeCurso);
router.post('/:id/asignaturas', verifyToken, verifyGestionAcademica, asignarAsignaturas);

// RF60: profesor jefe (CU95, CU96) y estudiantes del curso (CU97)
router.put('/:id/profesor-jefe', verifyToken, verifyAdmin, designarProfesorJefe);
router.delete('/:id/profesor-jefe', verifyToken, verifyAdmin, retirarProfesorJefe);
router.get('/:id/estudiantes', verifyToken, getEstudiantesDeCurso);
// CU105: ruta de formación de estudiantes de 2°, 3° y 4° medio
router.put('/:id/ruta-formacion', verifyToken, verifyGestionAcademica, asignarRutaFormacion);

module.exports = router;