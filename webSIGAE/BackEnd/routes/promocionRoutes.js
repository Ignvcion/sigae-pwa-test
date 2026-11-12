// RF61: situación final, promoción y cambio de período lectivo.
// docs/decisiones-rf60-rf61-periodos.txt (puntos 4 a 6).
const express = require('express');
const multer = require('multer');
const { verifyToken, verifyAdmin, verifyGestionAcademica, verifySuperAdmin } = require('../middleware/authMiddleware');
const promocion = require('../controllers/promocionController');
const periodo = require('../controllers/periodoController');

const router = express.Router();

// CU99: el Excel se procesa en memoria (no se guarda en disco); máximo 2 MB
const subirExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.xlsx$/i.test(file.originalname)),
}).single('archivo');
const conExcel = (req, res, next) => subirExcel(req, res, (err) => {
  if (err) return res.status(400).json({ mensaje: 'El archivo debe ser un Excel (.xlsx) de máximo 2 MB' });
  return next();
});

router.use(verifyToken);

// Cambio de período (antes de /cursos/:cursoId)
// El estado del cierre lo leen también la etiqueta UTP (períodos de cursos y horarios)
router.get('/periodos/estado', verifyGestionAcademica, periodo.getEstado);
router.post('/periodos/iniciar-cierre', verifySuperAdmin, periodo.iniciarCierre);
router.get('/periodos/respaldo', verifySuperAdmin, periodo.descargarRespaldo);
router.post('/periodos/iniciar-nuevo', verifySuperAdmin, periodo.iniciarNuevoPeriodo);

// CU98 / CU99: profesor jefe del curso o administración (se valida en el controlador)
router.get('/cursos/:cursoId/situaciones', promocion.getSituacionesCurso);
router.put('/cursos/:cursoId/situaciones', promocion.registrarSituaciones);
router.get('/cursos/:cursoId/plantilla', promocion.descargarPlantilla);
router.post('/cursos/:cursoId/situaciones/excel', conExcel, promocion.cargarExcel);

// CU100: aplicar la promoción (Administrador / Super Admin)
router.post('/cursos/:cursoId/promover', verifyAdmin, promocion.promoverCurso);

module.exports = router;
