// config/env.js
// Configuración leída del entorno (.env). Un solo lugar para saber qué
// variables usa el backend y cuáles son obligatorias en producción.
//
// Regla: los secretos NO tienen valor por defecto en el código. En desarrollo
// los pone el .env que crean los scripts de setup a partir de .env.example; en
// producción el servidor se niega a arrancar si falta alguno (ver
// validarEntornoProduccion, que llama server.js antes de abrir el puerto).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const esProduccion = process.env.NODE_ENV === 'production';

// Carpeta de archivos subidos por los usuarios (CU20: fotografías de perfil).
// Producción: fuera del repo (p. ej. /var/sigae/uploads) para que un git pull
// o un redeploy nunca la toque. Desarrollo: webSIGAE/BackEnd/uploads, como siempre.
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'));

// Orígenes permitidos por CORS, separados por coma. Si no se define, se usa
// FRONTEND_URL; en desarrollo, el servidor de Vite.
function origenesCors() {
  const valor = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || (esProduccion ? '' : 'http://localhost:5173');
  return valor.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
}

// Variables sin las cuales el backend no puede funcionar bien en producción.
const OBLIGATORIAS_PRODUCCION = [
  'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'JWT_SECRET',
  'FRONTEND_URL',            // enlaces de recuperación de contraseña y CORS
  'UPLOADS_DIR',             // fotos de perfil fuera del repo
  'PUPPETEER_EXECUTABLE_PATH', // Chromium del sistema para exportar PNG
  'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', // correo de recuperación (CU14)
];

// Devuelve la lista de problemas (nombres de variables, nunca valores).
function problemasEntornoProduccion(env = process.env) {
  const problemas = OBLIGATORIAS_PRODUCCION
    .filter((nombre) => !env[nombre] || !String(env[nombre]).trim())
    .map((nombre) => `falta ${nombre}`);

  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    problemas.push('JWT_SECRET debe tener al menos 32 caracteres');
  }
  if (env.JWT_SECRET === 'un_secreto_muy_largo_y_seguro') {
    problemas.push('JWT_SECRET es el valor de ejemplo de .env.example');
  }
  if (env.UPLOADS_DIR && !path.isAbsolute(env.UPLOADS_DIR)) {
    problemas.push('UPLOADS_DIR debe ser una ruta absoluta');
  }
  const origenes = env.CORS_ORIGINS || env.FRONTEND_URL || '';
  if (/localhost|127\.0\.0\.1/.test(origenes)) {
    problemas.push('CORS_ORIGINS / FRONTEND_URL apuntan a localhost');
  }
  return problemas;
}

// En producción, aborta el arranque si la configuración está incompleta.
function validarEntornoProduccion() {
  if (!esProduccion) return;
  const problemas = problemasEntornoProduccion();
  if (problemas.length > 0) {
    console.error('Configuración de producción incompleta; el servidor no arranca:');
    problemas.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
}

module.exports = {
  esProduccion,
  UPLOADS_DIR,
  origenesCors,
  problemasEntornoProduccion,
  validarEntornoProduccion,
};
