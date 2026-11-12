#!/usr/bin/env node
// scripts/enviarRespaldo.js
// RNF11: respaldo diario de la base de datos, enviado por correo a la cuenta de
// respaldos del colegio (respaldosigae@colegiojc.cl) con el archivo adjunto, su
// detalle (fecha, hora, tamaño, SHA-256) y cómo cargarlo en caso de contingencia.
// Reglas en utils/respaldo.js; guía en docs/respaldos-por-correo.md.
//
// Uso (desde webSIGAE/BackEnd, con el .env del servidor):
//   node scripts/enviarRespaldo.js              genera, envía y borra la copia local
//   node scripts/enviarRespaldo.js --conservar  además deja el archivo en RESPALDO_DIR
//   node scripts/enviarRespaldo.js --sin-correo solo genera el archivo (prueba)
//
// Programado (cron del usuario de pm2, todos los días a las 03:17):
//   17 3 * * * cd /ruta/webSIGAE/BackEnd && /usr/bin/node scripts/enviarRespaldo.js >> /var/log/sigae-respaldo.log 2>&1
//
// Variables del .env: DB_HOST, DB_PORT, DB_NAME, DB_SSL y las de SMTP (utils/mailer.js).
// Opcionales: RESPALDO_DB_USER / RESPALDO_DB_PASSWORD (usuario de solo lectura;
// si no, DB_USER / DB_PASSWORD), RESPALDO_CORREO (destino; por defecto la cuenta
// de respaldos), RESPALDO_DIR (carpeta del archivo), RESPALDO_MAX_MB (18),
// RESPALDO_SSL_CA (CA de la RDS), RESPALDO_DUMP_BIN (ruta de mariadb-dump).
//
// Código de salida: 0 enviado; 1 error; 2 el archivo supera el máximo para el correo.
const fs = require('fs');
const os = require('os');
const path = require('path');
require('../config/env');
const { CORREO_RESPALDOS } = require('../config/institucion');
const { correoConfigurado, enviarRespaldo, escaparHTML } = require('../utils/mailer');
const {
  fechaHoraChile, formatearBytes, limiteBytes, generarVolcado, armarCorreoRespaldo, carpetaRespaldo,
} = require('../utils/respaldo');

const registro = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function main() {
  const flags = new Set(process.argv.slice(2));
  const sinCorreo = flags.has('--sin-correo');
  const conservar = flags.has('--conservar') || process.env.RESPALDO_CONSERVAR === 'true';
  const baseDatos = process.env.DB_NAME || 'sigae';
  const destinoCorreo = process.env.RESPALDO_CORREO || CORREO_RESPALDOS;

  const inicio = new Date();
  const carpeta = carpetaRespaldo();
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = `${baseDatos}_${fechaHoraChile(inicio).sello}.sql.gz`;
  const destino = path.join(carpeta, archivo);

  registro(`Generando respaldo de "${baseDatos}" en ${destino}`);
  let volcado;
  try {
    volcado = await generarVolcado({ destino });
  } catch (error) {
    fs.rmSync(destino, { force: true });
    throw error;
  }
  const duracionSeg = Math.round((Date.now() - inicio.getTime()) / 1000);
  registro(`Respaldo listo: ${formatearBytes(volcado.bytes)}, ${volcado.tablas} tablas, SHA-256 ${volcado.sha256}`);

  if (sinCorreo || !correoConfigurado()) {
    registro(sinCorreo
      ? 'Modo --sin-correo: el archivo queda en el servidor.'
      : 'SMTP no configurado (desarrollo): no se envía; el archivo queda en el servidor.');
    return 0;
  }

  if (volcado.bytes > limiteBytes()) {
    registro(`ERROR: el respaldo (${formatearBytes(volcado.bytes)}) supera el máximo para un correo `
      + `(RESPALDO_MAX_MB). No se envió; queda en ${destino}.`);
    return 2;
  }

  const correo = armarCorreoRespaldo({
    archivo, ...volcado, baseDatos, servidor: os.hostname(), inicio, duracionSeg,
  }, escaparHTML);
  await enviarRespaldo({
    para: destinoCorreo,
    asunto: correo.asunto,
    texto: correo.texto,
    html: correo.html,
    adjuntos: [
      { filename: archivo, path: destino, contentType: 'application/gzip' },
      { filename: archivo.replace(/\.sql\.gz$/, '_LEEME.txt'), content: correo.leeme, contentType: 'text/plain; charset=utf-8' },
    ],
  });
  registro(`Enviado a ${destinoCorreo}: "${correo.asunto}"`);

  // Tiene datos personales: no se deja en el servidor salvo que se pida
  if (!conservar) fs.rmSync(destino, { force: true });
  return 0;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error) => {
    registro(`ERROR: ${error.message}`);
    process.exit(1);
  });
