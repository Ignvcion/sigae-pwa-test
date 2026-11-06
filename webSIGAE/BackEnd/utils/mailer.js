// utils/mailer.js
// Envío de correos por SMTP (CU14: recuperación de contraseña).
//
// Variables del .env:
//   SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_SECURE (true solo para el
//   puerto 465), SMTP_USER, SMTP_PASS, EMAIL_FROM ("SIGAE <no-responder@dominio>").
// En una EC2 el puerto 25 de salida está bloqueado por AWS: usar 587 o 465.
//
// En producción las variables son obligatorias (config/env.js). En desarrollo,
// si no están, correoConfigurado() devuelve false y passwordController muestra
// el enlace en la consola en vez de enviarlo.
const nodemailer = require('nodemailer');
require('../config/env');

let transporter = null;

function correoConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

function obtenerTransporter() {
  if (!transporter) {
    const puerto = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: process.env.SMTP_SECURE === 'true' || puerto === 465,
      requireTLS: puerto === 587, // STARTTLS obligatorio: nunca enviar en claro
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

function escaparHTML(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function enviarCorreoRecuperacion({ para, nombre, enlace, minutos }) {
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
  await obtenerTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: para,
    subject: 'Recuperación de contraseña - SIGAE',
    text: `${saludo}\n\nRecibimos una solicitud para restablecer tu contraseña en SIGAE.\n`
      + `Abre este enlace para elegir una nueva (válido por ${minutos} minutos):\n\n${enlace}\n\n`
      + 'Si no fuiste tú, ignora este correo: tu contraseña no cambiará.\n',
    html: `<p>${escaparHTML(saludo)}</p>`
      + '<p>Recibimos una solicitud para restablecer tu contraseña en SIGAE.</p>'
      + `<p>Haz clic en el siguiente enlace para elegir una nueva (válido por ${minutos} minutos):</p>`
      + `<p><a href="${escaparHTML(enlace)}">${escaparHTML(enlace)}</a></p>`
      + '<p>Si no fuiste tú, ignora este correo: tu contraseña no cambiará.</p>',
  });
}

module.exports = { correoConfigurado, enviarCorreoRecuperacion };
