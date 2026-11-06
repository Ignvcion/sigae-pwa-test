// utils/sesion.js
// En la tabla `sesion` no se guarda el JWT sino su hash SHA-256 (64 caracteres
// hexadecimales), por dos motivos:
//   1. La columna Sesion_Token_Acceso es varchar(255) y un JWT puede ser más
//      largo (p. ej. un administrador que también es docente, con un RUT de
//      8 dígitos, ya pasa de 255): el INSERT fallaba y esa persona no podía
//      iniciar sesión.
//   2. Si alguien lee la tabla, los tokens no le sirven para entrar.
const crypto = require('crypto');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

module.exports = { hashToken };
