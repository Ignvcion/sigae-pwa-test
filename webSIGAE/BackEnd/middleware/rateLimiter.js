const rateLimit = require('express-rate-limit');

// Solo cuentan los intentos FALLIDOS (respuesta >= 400). Sin esto, 5 inicios de sesión
// correctos en 15 minutos desde la misma IP bloqueaban al siguiente, y en el colegio
// muchos usuarios salen a internet por la misma IP pública.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos fallidos. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes de recuperación. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Códigos de verificación (recuperación, activación y cambio de correo): cuentan
// solo los intentos FALLIDOS. Además, cada código se bloquea a los 5 intentos
// incorrectos (utils/codigosVerificacion.js).
const codigoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos con códigos de verificación. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, recoveryLimiter, codigoLimiter };
