// Datos del colegio que usa el frontend. Deben coincidir con
// BackEnd/config/institucion.js (el backend es el que valida de verdad).

// Dominios aceptados para los correos institucionales de docentes y
// administradores. El primero es el principal: se usa en los ejemplos.
export const DOMINIOS_INSTITUCIONALES = ["@colegiojc.cl", "@colegiojacquescousteau.cl"];
export const DOMINIO_INSTITUCIONAL = DOMINIOS_INSTITUCIONALES[0];

// "@colegiojc.cl o @colegiojacquescousteau.cl", para los mensajes
export const TEXTO_DOMINIOS_INSTITUCIONALES = DOMINIOS_INSTITUCIONALES.join(" o ");

// Cuenta desde la que llegan los códigos de verificación
export const CORREO_NO_RESPONDER = "noreply@colegiojc.cl";

// Cuenta de Google Drive donde se suben los respaldos (cierre de período)
export const CORREO_RESPALDOS = "respaldosigae@colegiojc.cl";
