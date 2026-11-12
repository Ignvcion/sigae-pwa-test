// utils/respaldo.js
// Respaldo de la base de datos enviado por correo a la cuenta de respaldos del
// colegio (respaldosigae@colegiojc.cl, config/institucion.js), desde la cuenta
// no-reply (utils/mailer.js). Lo usa scripts/enviarRespaldo.js (cron diario).
//
// El respaldo es un volcado completo (mariadb-dump / mysqldump) comprimido con
// gzip. El correo lleva el archivo adjunto, su detalle (fecha, hora, tamaño,
// SHA-256, tablas) y las instrucciones para cargarlo en caso de contingencia;
// además se adjunta un LEEME con esas instrucciones, para que queden junto al
// archivo si se guarda en Google Drive.
//
// Gmail rechaza mensajes de más de 25 MB y los adjuntos crecen ~33 % al
// codificarse, así que sobre RESPALDO_MAX_MB (18 por defecto) no se envía: el
// archivo queda en el servidor y el script termina con error.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const ZONA_HORARIA = 'America/Santiago';
const MAX_MB_POR_DEFECTO = 18;

/** "2026-11-12" y "03:17:05" en la hora de Chile. */
function fechaHoraChile(fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-CL', {
      timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(fecha).map((p) => [p.type, p.value])
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}:${partes.second}`,
    sello: `${partes.year}${partes.month}${partes.day}_${partes.hour}${partes.minute}`,
  };
}

function formatearBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Límite de tamaño del adjunto, en bytes (RESPALDO_MAX_MB). */
function limiteBytes(env = process.env) {
  const mb = Number(env.RESPALDO_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : MAX_MB_POR_DEFECTO) * 1024 * 1024;
}

/** Cliente de volcado disponible: mariadb-dump (MariaDB 10.5+) o mysqldump. */
function comandoVolcado(env = process.env) {
  if (env.RESPALDO_DUMP_BIN) return env.RESPALDO_DUMP_BIN;
  const rutas = (env.PATH || '').split(path.delimiter);
  for (const nombre of ['mariadb-dump', 'mysqldump']) {
    if (rutas.some((dir) => dir && fs.existsSync(path.join(dir, nombre)))) return nombre;
  }
  return 'mysqldump';
}

/**
 * Argumentos del volcado. Usa un usuario de solo lectura si está configurado
 * (RESPALDO_DB_USER / RESPALDO_DB_PASSWORD); si no, el de la aplicación. La
 * contraseña va por la variable MYSQL_PWD, nunca en la línea de comandos.
 */
function argumentosVolcado(env = process.env) {
  const args = [
    '-h', env.DB_HOST || '127.0.0.1',
    '-P', String(Number(env.DB_PORT) || 3306),
    '-u', env.RESPALDO_DB_USER || env.DB_USER,
    '--single-transaction',      // copia consistente sin bloquear las tablas (InnoDB)
    '--no-tablespaces',          // no requiere el privilegio PROCESS (RDS)
    '--default-character-set=utf8mb4',
    '--databases', env.DB_NAME || 'sigae', // incluye CREATE DATABASE y USE: se restaura igual que schema_base.sql
  ];
  if (env.DB_SSL === 'true') {
    args.push('--ssl');
    if (env.RESPALDO_SSL_CA) args.push(`--ssl-ca=${env.RESPALDO_SSL_CA}`);
  }
  return args;
}

/**
 * Genera el volcado comprimido en `destino`. Devuelve { bytes, sha256, tablas }.
 * Cuenta las tablas a medida que pasa el SQL (líneas "CREATE TABLE").
 */
async function generarVolcado({ destino, env = process.env }) {
  const proceso = spawn(comandoVolcado(env), argumentosVolcado(env), {
    env: { ...env, MYSQL_PWD: env.RESPALDO_DB_PASSWORD ?? env.DB_PASSWORD ?? '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errores = '';
  proceso.stderr.on('data', (d) => { errores += d.toString(); });
  const terminado = new Promise((resolve, reject) => {
    proceso.on('error', reject);
    proceso.on('close', (codigo) => (codigo === 0
      ? resolve()
      : reject(new Error(`El volcado terminó con código ${codigo}: ${errores.trim() || 'sin detalle'}`))));
  });

  let tablas = 0;
  let resto = '';
  const contador = new Transform({
    transform(trozo, _cod, listo) {
      const texto = resto + trozo.toString('utf8');
      const lineas = texto.split('\n');
      resto = lineas.pop();
      tablas += lineas.filter((l) => l.startsWith('CREATE TABLE ')).length;
      listo(null, trozo);
    },
  });
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const medidor = new Transform({
    transform(trozo, _cod, listo) {
      hash.update(trozo);
      bytes += trozo.length;
      listo(null, trozo);
    },
  });

  await Promise.all([
    pipeline(proceso.stdout, contador, zlib.createGzip({ level: 9 }), medidor, fs.createWriteStream(destino, { mode: 0o600 })), // solo el dueño: datos personales
    terminado,
  ]);
  return { bytes, sha256: hash.digest('hex'), tablas };
}

/** Instrucciones para cargar el respaldo en caso de contingencia (texto plano). */
function instruccionesRestauracion({ archivo, sha256, baseDatos }) {
  return [
    'CÓMO CARGAR ESTE RESPALDO EN CASO DE CONTINGENCIA',
    '',
    `1. Descarga el adjunto ${archivo} en el servidor (o en un equipo con el cliente de MariaDB).`,
    '2. Comprueba que el archivo llegó completo; el resultado debe ser idéntico al SHA-256 de este correo:',
    `     sha256sum ${archivo}`,
    `     (SHA-256 esperado: ${sha256})`,
    '3. Si la base actual todavía existe, saca primero un snapshot de la RDS (o un volcado): la carga',
    `   REEMPLAZA las tablas de la base "${baseDatos}".`,
    '4. Detén el backend para que nadie escriba durante la carga:',
    '     pm2 stop sigae-api',
    '5. Carga el respaldo (trae CREATE DATABASE y USE, igual que schema_base.sql):',
    `     gunzip -c ${archivo} | mariadb --default-character-set=utf8mb4 -h <endpoint-de-la-RDS> -u <usuario-administrador> -p`,
    '   En Windows: descomprime el .gz con 7-Zip y ejecuta, desde Git Bash:',
    `     mariadb --default-character-set=utf8mb4 -h <host> -u <usuario> -p < ${archivo.replace(/\.gz$/, '')}`,
    '6. Vuelve a iniciar el backend y prueba un inicio de sesión:',
    '     pm2 start sigae-api',
    '',
    'Notas:',
    '- Las fotografías de perfil (/var/sigae/uploads) no van en este respaldo.',
    '- Si la versión de SIGAE en el servidor es más nueva que la del respaldo y cambió el esquema,',
    '  aplica después los ALTER TABLE documentados en docs/ (README, "Para quien modifique el esquema").',
    '- Contiene datos personales de menores: no lo descargues en equipos personales y bórralo del',
    '  equipo después de usarlo.',
  ].join('\n');
}

/**
 * Asunto, cuerpo (texto y HTML) y LEEME del correo del respaldo.
 * `detalle`: { archivo, bytes, sha256, tablas, baseDatos, servidor, inicio, duracionSeg }.
 */
function armarCorreoRespaldo(detalle, escaparHTML) {
  const { fecha, hora } = fechaHoraChile(detalle.inicio);
  const instrucciones = instruccionesRestauracion(detalle);
  const filas = [
    ['Fecha', fecha],
    ['Hora', `${hora} (hora de Chile)`],
    ['Base de datos', detalle.baseDatos],
    ['Servidor', detalle.servidor],
    ['Archivo', detalle.archivo],
    ['Tamaño (comprimido)', formatearBytes(detalle.bytes)],
    ['Tablas', String(detalle.tablas)],
    ['SHA-256', detalle.sha256],
    ['Duración', `${detalle.duracionSeg} s`],
  ];
  const asunto = `Respaldo SIGAE - ${detalle.baseDatos} - ${fecha} ${hora.slice(0, 5)}`;
  const texto = [
    'Respaldo automático de la base de datos de SIGAE.',
    '',
    ...filas.map(([k, v]) => `${k}: ${v}`),
    '',
    instrucciones,
  ].join('\n');
  const html = '<p>Respaldo automático de la base de datos de SIGAE.</p>'
    + '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">'
    + filas.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#475569">${escaparHTML(k)}</td>`
      + `<td style="padding:2px 0;font-family:monospace">${escaparHTML(v)}</td></tr>`).join('')
    + '</table>'
    + `<pre style="font-size:13px;background:#f8fafc;padding:12px;border-radius:6px;white-space:pre-wrap">${escaparHTML(instrucciones)}</pre>`;
  const leeme = `SIGAE - respaldo ${detalle.archivo}\n\n${filas.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${instrucciones}\n`;
  return { asunto, texto, html, leeme };
}

// Nombres legibles del conteo de utils/limpiezaPeriodo.js (conteo)
const ETIQUETAS_CONTEO = {
  cursos: 'Cursos que se eliminan',
  estudiantes: 'Estudiantes que se eliminan (egresados, en práctica y retirados)',
  horarios: 'Clases programadas que se eliminan',
  citaciones: 'Citaciones que se eliminan',
  apoderadosEliminar: 'Apoderados que se eliminan',
  apoderadosDesactivar: 'Apoderados que quedan inactivos',
  apoderadosQuitarRol: 'Usuarios que pierden el rol de apoderado',
};

/**
 * Correo con el Excel del cierre de período (lo que se eliminará o desactivará al
 * iniciar el nuevo período). `detalle`: { archivo, bytes, sha256, vigente,
 * siguiente, conteo: { concepto: cantidad }, inicio, responsable }.
 */
function armarCorreoRespaldoCierre(detalle, escaparHTML) {
  const { fecha, hora } = fechaHoraChile(detalle.inicio);
  const filas = [
    ['Fecha', fecha],
    ['Hora', `${hora} (hora de Chile)`],
    ['Período vigente', String(detalle.vigente)],
    ['Período siguiente', String(detalle.siguiente || '—')],
    ['Descargado por', detalle.responsable || '—'],
    ['Archivo', detalle.archivo],
    ['Tamaño', formatearBytes(detalle.bytes)],
    ['SHA-256', detalle.sha256],
  ];
  const conteo = Object.entries(detalle.conteo || {}).map(([k, v]) => [ETIQUETAS_CONTEO[k] || k, v]);
  const uso = [
    'CÓMO USAR ESTE RESPALDO',
    '',
    '- Es el registro de lo que se elimina o desactiva al iniciar el nuevo período: cursos de dos',
    '  períodos atrás con sus egresados, en práctica y retirados (historial, citaciones,',
    '  evaluaciones y horarios) y los apoderados sin estudiantes. Cada hoja del Excel es una tabla.',
    '- En caso de contingencia (un estudiante o curso eliminado por error, o un estudiante que se',
    '  reincorpora), busca sus datos en el Excel y vuelve a registrarlo en SIGAE: Registrar',
    '  Estudiante, Cursos y Gestión de Apoderados. No se carga de forma automática.',
    '- Para recuperar la base completa usa el respaldo diario de la base de datos (correos',
    '  "Respaldo SIGAE - sigae - ...") o un snapshot de la RDS.',
    '- Contiene datos personales de menores: no lo guardes en equipos personales.',
  ].join('\n');
  const asunto = `Respaldo SIGAE - cierre de período ${detalle.vigente} - ${fecha} ${hora.slice(0, 5)}`;
  const texto = [
    'Copia del respaldo previo al cambio de período (Gestión Académica > Cierre de Período).',
    '',
    ...filas.map(([k, v]) => `${k}: ${v}`),
    '',
    'Qué se eliminará o modificará:',
    ...conteo.map(([k, v]) => `- ${k}: ${v}`),
    '',
    uso,
  ].join('\n');
  const html = '<p>Copia del respaldo previo al cambio de período (Gestión Académica &gt; Cierre de Período).</p>'
    + '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">'
    + filas.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#475569">${escaparHTML(k)}</td>`
      + `<td style="padding:2px 0;font-family:monospace">${escaparHTML(v)}</td></tr>`).join('')
    + '</table>'
    + '<p><strong>Qué se eliminará o modificará:</strong></p><ul>'
    + conteo.map(([k, v]) => `<li>${escaparHTML(k)}: ${escaparHTML(v)}</li>`).join('')
    + '</ul>'
    + `<pre style="font-size:13px;background:#f8fafc;padding:12px;border-radius:6px;white-space:pre-wrap">${escaparHTML(uso)}</pre>`;
  return { asunto, texto, html };
}

/** Carpeta temporal del respaldo (RESPALDO_DIR o la temporal del sistema). */
function carpetaRespaldo(env = process.env) {
  return env.RESPALDO_DIR || os.tmpdir();
}

module.exports = {
  ZONA_HORARIA,
  fechaHoraChile,
  formatearBytes,
  limiteBytes,
  comandoVolcado,
  argumentosVolcado,
  generarVolcado,
  instruccionesRestauracion,
  armarCorreoRespaldo,
  armarCorreoRespaldoCierre,
  carpetaRespaldo,
};
