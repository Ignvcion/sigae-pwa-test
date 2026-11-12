// CU101: notificaciones de mensajes y citaciones del usuario autenticado
const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const { getNotificaciones, marcarLeida, marcarLeidas } = require('../controllers/notificacionController');

const router = express.Router();
router.use(verifyToken);

router.get('/', getNotificaciones);
router.patch('/leidas', marcarLeidas);   // antes de '/:id/leida'
router.patch('/:id/leida', marcarLeida);

module.exports = router;
