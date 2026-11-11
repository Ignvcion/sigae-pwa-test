// utils/contrasenaInicial.js
// Contraseña inicial de las cuentas nuevas: el administrador ya no la escribe
// al registrar a un usuario. SIGAE genera una aleatoria y la envía al correo
// del usuario desde la cuenta no-reply (utils/mailer.js). En el primer ingreso
// el usuario confirma su correo con un código de activación y puede cambiarla
// desde su perfil o con "¿Olvidaste tu contraseña?".
const crypto = require('crypto');
const { esProduccion } = require('../config/env');
const { correoConfigurado, enviarContrasenaInicial } = require('./mailer');
const { validarFortalezaContrasena } = require('../middleware/validation');

// Sin caracteres que se confunden al leerlos en un correo (0/O, 1/l/I)
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
const DIGITOS = '23456789';
const TODOS = MAYUSCULAS + MINUSCULAS + DIGITOS;
const LARGO_CONTRASENA = 12;

class ErrorEnvioContrasena extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.status = 503;
  }
}

const caracterAleatorio = (alfabeto) => alfabeto[crypto.randomInt(alfabeto.length)];

/**
 * Genera una contraseña aleatoria criptográficamente segura que cumple la
 * política de SIGAE (mín. 8 caracteres, al menos una mayúscula y un número).
 */
function generarContrasenaAleatoria(largo = LARGO_CONTRASENA) {
  const caracteres = [caracterAleatorio(MAYUSCULAS), caracterAleatorio(MINUSCULAS), caracterAleatorio(DIGITOS)];
  while (caracteres.length < Math.max(largo, 8)) caracteres.push(caracterAleatorio(TODOS));
  // Fisher-Yates: los caracteres obligatorios no quedan siempre al inicio
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  const contrasena = caracteres.join('');
  if (validarFortalezaContrasena(contrasena)) throw new Error('Contraseña generada no cumple la política');
  return contrasena;
}

/**
 * Envía la contraseña inicial al correo del usuario. Lanza ErrorEnvioContrasena
 * si no se pudo enviar (quien llama deshace la creación de la cuenta).
 * En desarrollo y sin SMTP, la muestra en la consola del backend.
 */
async function entregarContrasenaInicial({ para, nombre, rut, contrasena }) {
  if (correoConfigurado()) {
    try {
      await enviarContrasenaInicial({ para, nombre, rut, contrasena });
      return;
    } catch (errorEnvio) {
      console.error('contrasenaInicial: falló el envío del correo:', errorEnvio.message);
      throw new ErrorEnvioContrasena(
        'No fue posible enviar la contraseña al correo del usuario, por lo que no se registró. Intenta más tarde.'
      );
    }
  }
  if (esProduccion) {
    // No debería ocurrir: server.js no arranca en producción sin SMTP_*
    throw new ErrorEnvioContrasena('El envío de correos no está disponible: el usuario no se registró.');
  }
  console.log(`[dev] Contraseña inicial para ${para} (RUT ${rut}): ${contrasena} (SMTP no configurado)`);
}

module.exports = {
  LARGO_CONTRASENA,
  ErrorEnvioContrasena,
  generarContrasenaAleatoria,
  entregarContrasenaInicial,
};
