const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getColores, cambiarColorAsignatura, cambiarColorDocente } = require('../controllers/colorController');

const router = express.Router();
router.use(verifyToken);

router.get('/', getColores);
router.put('/asignaturas/:id', verifyAdmin, cambiarColorAsignatura);
router.put('/docentes/:id', verifyAdmin, cambiarColorDocente);

module.exports = router;
