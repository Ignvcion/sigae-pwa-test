// routes/electivoRoutes.js
// Electivos de 3° y 4° medio: plan del período (CU108) y programación en bloques
// compartidos (CU106). La gestión es del Administrador y Super Administrador; los
// electivos se ven además en los horarios del curso, del docente y del estudiante.
const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
  getPlan,
  crearPlan,
  editarPlan,
  clonarPlan,
  getProgramacion,
  programarElectivo,
  eliminarElectivo,
  getElectivosDeCurso,
} = require('../controllers/electivoController');

const router = express.Router();

router.use(verifyToken, verifyAdmin);

// CU108: plan de electivos del período
router.get('/plan',          getPlan);
router.post('/plan/clonar',  clonarPlan);
router.post('/plan',         crearPlan);
router.put('/plan/:id',      editarPlan);

// CU106: programación de electivos en bloques compartidos
router.get('/programacion',  getProgramacion);
router.post('/clases',       programarElectivo);
router.delete('/clases/:id', eliminarElectivo);

// Electivos en el horario de un curso de 3° o 4° medio
router.get('/curso/:cursoId', getElectivosDeCurso);

module.exports = router;
