// config/institucion.js
// Datos del colegio que usa el backend: dominios de los correos
// institucionales y las cuentas de correo del sistema.
//
// Si cambian, actualizar también FrontEnd/src/config/institucion.js.

// Dominios aceptados para los correos institucionales (docentes y
// administradores). El primero es el principal: se usa en los ejemplos.
const DOMINIOS_INSTITUCIONALES = ['@colegiojc.cl', '@colegiojacquescousteau.cl'];

// Texto para los mensajes: "@colegiojc.cl o @colegiojacquescousteau.cl"
const TEXTO_DOMINIOS_INSTITUCIONALES = DOMINIOS_INSTITUCIONALES.join(' o ');

// Cuenta desde la que el sistema envía los correos automáticos (códigos de
// verificación). Nadie la lee: los correos dicen que no se responda.
// La dirección real del remitente la fija EMAIL_FROM en el .env.
const CORREO_NO_RESPONDER = 'noreply@colegiojc.cl';

// Cuenta de Google Drive donde se suben los respaldos (cierre de período).
const CORREO_RESPALDOS = 'respaldosigae@colegiojc.cl';

module.exports = {
  DOMINIOS_INSTITUCIONALES,
  TEXTO_DOMINIOS_INSTITUCIONALES,
  CORREO_NO_RESPONDER,
  CORREO_RESPALDOS,
};
