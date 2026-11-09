const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getEspecialidades } = require('../controllers/especialidadController');

const router = express.Router();

router.get('/', verifyToken, verifyAdmin, getEspecialidades);

module.exports = router;
