const express = require('express');
const router  = express.Router();

const estudianteController = require('../controllers/estudianteController');
const apoderadosEstudianteController = require('../controllers/apoderadosEstudianteController');
const { verifyToken, verifyAdmin, verifyGestionAcademica } = require('../middleware/authMiddleware');

router.get('/',               verifyToken,             estudianteController.getEstudiantes);
// CU36: búsqueda por nombre completo o RUT — debe estar ANTES de /:id
router.get('/buscar',        verifyToken,             estudianteController.buscarEstudiantes);
router.get('/verificar-rut', verifyToken, verifyAdmin, estudianteController.verificarRut);
router.get('/sin-apoderado', verifyToken, verifyAdmin, estudianteController.getEstudiantesSinApoderado);
// "Mis Cursos" del docente: estudiantes de un curso donde hace clases (sin datos sensibles)
router.get('/curso/:cursoId/mis-estudiantes', verifyToken, estudianteController.getEstudiantesCursoDocente);
router.get('/:id',           verifyToken,             estudianteController.getEstudianteById);
router.post('/',   verifyToken, verifyAdmin, estudianteController.createEstudiante);
router.post('/asignar-apoderado', verifyToken, verifyAdmin, estudianteController.asignarApoderado);
router.delete('/apoderado/:apoderadoId/todas', verifyToken, verifyAdmin, estudianteController.eliminarTodasAsociacionesApoderado);
// CU40: el propio Apoderado o un Admin/SuperAdmin (autorización fina dentro del controlador)
router.get('/apoderado/:apoderadoId/asociados', verifyToken, estudianteController.getEstudiantesAsociados);
// CU41: detalle de un estudiante desde la lista de asociados del apoderado
router.get('/apoderado/:apoderadoId/asociados/:estudianteId', verifyToken, estudianteController.getDetalleEstudiante);
router.delete('/:estudianteId/apoderado', verifyToken, verifyAdmin, estudianteController.eliminarAsociacionEspecifica);
// CU39: reasignar o quitar el apoderado de un estudiante puntual
router.put('/:estudianteId/apoderado', verifyToken, verifyAdmin, estudianteController.editarAsociaciones);
// CU90 (RF57): apoderado titular y hasta 4 suplentes del estudiante
router.get('/:estudianteId/apoderados', verifyToken, verifyAdmin, apoderadosEstudianteController.getApoderadosEstudiante);
router.put('/:estudianteId/apoderados', verifyToken, verifyAdmin, apoderadosEstudianteController.designarApoderados);
// CU38: la etiqueta UTP también asigna estudiantes a cursos (solo curso, estado y ruta)
router.put('/:id', verifyToken, verifyGestionAcademica, estudianteController.updateEstudiante);
router.delete('/:id', verifyToken, verifyAdmin, estudianteController.deleteEstudiante);

module.exports = router;
