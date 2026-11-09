const express = require('express');

const router = express.Router();

const {
  obtenerRecepcion,
  actualizarRecepcion,
  habilitarConversacion,
  obtenerConversaciones,
  obtenerMensajes,
  enviarMensaje,
  marcarMensajesLeidos,
  obtenerContactos,
  iniciarConversacion,
  obtenerDetalleContacto
} = require('../controllers/mensajeController');

const { verifyToken } = require('../middleware/authMiddleware');

// CU73 / RF47 — la autorización por rol (Docente/Apoderado) y por
// participación en la conversación se resuelve dentro del controlador.
router.use(verifyToken);


// RF54 / CU85: recepción general de mensajes de apoderados (docente)
router.get('/recepcion', obtenerRecepcion);
router.put('/recepcion', actualizarRecepcion);

// RF54 / CU86: habilitar respuestas del apoderado en una conversación hasta una fecha y hora
router.put('/conversaciones/:id/habilitacion', habilitarConversacion);

// Contactos válidos según la relación docente-apoderado (?rol=)
router.get('/contactos', obtenerContactos);


// Obtener las conversaciones del usuario autenticado (?rol=)
router.get('/conversaciones', obtenerConversaciones);


// Iniciar (o reutilizar) una conversación con un contacto válido
router.post('/conversaciones', iniciarConversacion);


// Obtener los mensajes de una conversación
router.get('/conversaciones/:id/mensajes', obtenerMensajes);


// Datos no invasivos de la contraparte (panel lateral del chat)
router.get('/conversaciones/:id/contacto', obtenerDetalleContacto);


// Enviar un mensaje
router.post('/conversaciones/:id/mensajes', enviarMensaje);


// Marcar mensajes como leídos
router.patch('/conversaciones/:id/leidos', marcarMensajesLeidos);


module.exports = router;
