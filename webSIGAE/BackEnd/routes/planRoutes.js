const express = require('express');
const { verifyToken, verifyGestionAcademica } = require('../middleware/authMiddleware');
const {
  getPlanes,
  getPlanById,
  crearPlan,
  editarPlan,
  clonarPlan,
  getNivelesSinPlan,
  getAsignaturas,
  crearAsignatura,
  editarAsignatura,
} = require('../controllers/planController');

const router = express.Router();

// Asignaturas y planes educativos: administración y etiqueta UTP (utils/permisos.js)
router.use(verifyToken);

router.get('/niveles-sin-plan',   verifyGestionAcademica, getNivelesSinPlan);
router.get('/asignaturas',        verifyGestionAcademica, getAsignaturas);
router.post('/asignaturas',       verifyGestionAcademica, crearAsignatura);
router.put('/asignaturas/:id',    verifyGestionAcademica, editarAsignatura);
router.get('/',                   verifyGestionAcademica, getPlanes);
router.get('/:id',                verifyGestionAcademica, getPlanById);
router.post('/clonar',            verifyGestionAcademica, clonarPlan);
router.post('/',                  verifyGestionAcademica, crearPlan);
router.put('/:id',                verifyGestionAcademica, editarPlan);

module.exports = router;
