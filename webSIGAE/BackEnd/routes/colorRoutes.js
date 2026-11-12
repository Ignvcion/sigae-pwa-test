const express = require('express');
const { verifyToken, verifyAdmin, verifyGestionAcademica } = require('../middleware/authMiddleware');
const { getColores, cambiarColorAsignatura, cambiarColorDocente } = require('../controllers/colorController');

const router = express.Router();
router.use(verifyToken);

router.get('/', getColores);
router.put('/asignaturas/:id', verifyGestionAcademica, cambiarColorAsignatura); // también UTP
router.put('/docentes/:id', verifyAdmin, cambiarColorDocente);

module.exports = router;
