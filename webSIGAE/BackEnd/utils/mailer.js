// utils/mailer.js
// Envío de correos por SMTP desde la cuenta no-reply del colegio
// (noreply@colegiojc.cl): códigos de verificación para recuperar la contraseña
// (CU14), confirmar un cambio de correo (CU19) y activar la cuenta en el primer
// ingreso. Ver utils/codigosVerificacion.js.
//
// Variables del .env:
//   SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_SECURE (true solo para el
//   puerto 465), SMTP_USER, SMTP_PASS, EMAIL_FROM ("SIGAE <noreply@colegiojc.cl>").
// En una EC2 el puerto 25 de salida está bloqueado por AWS: usar 587 o 465.
//
// En producción las variables son obligatorias (config/env.js). En desarrollo,
// si no están, correoConfigurado() devuelve false y el código se muestra en la
// consola en vez de enviarse.
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

// Textos de cada tipo de código (la clave es el propósito guardado en
// codigo_verificacion.Codigo_Verificacion_Proposito).
const PLANTILLAS = {
  Recuperacion: {
    asunto: 'Código para recuperar tu contraseña - SIGAE',
    motivo: 'Recibimos una solicitud para restablecer tu contraseña en SIGAE.',
    uso: 'Ingrésalo en la pantalla de recuperación junto con tu nueva contraseña.',
    siNoFuiste: 'Si no fuiste tú, ignora este correo: tu contraseña no cambiará.',
  },
  'Cambio de correo': {
    asunto: 'Confirma tu nuevo correo - SIGAE',
    motivo: 'Pediste usar esta dirección como tu correo en SIGAE.',
    uso: 'Ingrésalo en tu perfil para confirmar el cambio.',
    siNoFuiste: 'Si no fuiste tú, ignora este correo: tu cuenta seguirá con el correo anterior.',
  },
  Activacion: {
    asunto: 'Código para activar tu cuenta - SIGAE',
    motivo: 'Estás ingresando a SIGAE por primera vez con esta cuenta (o se cambió tu correo).',
    uso: 'Ingrésalo en la pantalla de inicio de sesión para confirmar tu correo.',
    siNoFuiste: 'Si no fuiste tú, alguien conoce tu contraseña: cámbiala o avisa a la administración del colegio.',
  },
};

/**
 * Envía un código de verificación. `proposito` es una de las claves de PLANTILLAS.
 * Lanza el error de SMTP si el envío falla (quien llama invalida el código).
 */
async function enviarCodigoVerificacion({ para, nombre, codigo, minutos, proposito }) {
  const plantilla = PLANTILLAS[proposito];
  if (!plantilla) throw new Error(`Propósito de código desconocido: ${proposito}`);
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
  const pie = 'Este correo fue enviado automáticamente por SIGAE. No respondas a este mensaje.';

  await obtenerTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: para,
    subject: plantilla.asunto,
    // Correo generado por un sistema: evita respuestas automáticas ("fuera de oficina")
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    text: `${saludo}\n\n${plantilla.motivo}\n\n`
      + `Tu código de verificación es: ${codigo}\n\n`
      + `${plantilla.uso} Vence en ${minutos} minutos y sirve una sola vez.\n`
      + 'Nadie del colegio te pedirá este código: no lo compartas.\n\n'
      + `${plantilla.siNoFuiste}\n\n${pie}\n`,
    html: `<p>${escaparHTML(saludo)}</p>`
      + `<p>${escaparHTML(plantilla.motivo)}</p>`
      + '<p>Tu código de verificación es:</p>'
      + `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;font-family:monospace">${escaparHTML(codigo)}</p>`
      + `<p>${escaparHTML(plantilla.uso)} Vence en ${Number(minutos)} minutos y sirve una sola vez.</p>`
      + '<p>Nadie del colegio te pedirá este código: no lo compartas.</p>'
      + `<p>${escaparHTML(plantilla.siNoFuiste)}</p>`
      + `<p style="color:#64748b;font-size:12px">${escaparHTML(pie)}</p>`,
  });
}

module.exports = { correoConfigurado, enviarCodigoVerificacion, PLANTILLAS };
