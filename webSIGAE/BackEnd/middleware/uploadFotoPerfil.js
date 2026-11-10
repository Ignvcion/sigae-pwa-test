// CU20: middleware de carga de la fotografía de perfil
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOADS_DIR } = require('../config/env');

// UPLOADS_DIR viene del .env (producción: /var/sigae/uploads, fuera del repo).
// Sin la variable se usa webSIGAE/BackEnd/uploads, como en desarrollo.
// server.js sirve esta misma carpeta en /uploads.
const UPLOAD_DIR = path.join(UPLOADS_DIR, 'perfiles');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Extensión según el tipo permitido. NUNCA se usa la extensión del nombre que
// envía el cliente: el tipo declarado también lo manda el cliente, y un
// "x.html" declarado como image/png se serviría luego desde /uploads como HTML
// en el mismo dominio de la aplicación.
const EXTENSION_POR_TIPO = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const TIPOS_PERMITIDOS = Object.keys(EXTENSION_POR_TIPO);
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    cb(null, `usuario-${req.user.id}-${Date.now()}${EXTENSION_POR_TIPO[file.mimetype]}`);
  },
});

const uploadFotoPerfil = multer({
  storage,
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
      return cb(new Error('FORMATO_INVALIDO'));
    }
    cb(null, true);
  },
}).single('foto');

/**
 * Comprueba los primeros bytes del archivo ya guardado (JPEG, PNG o WEBP reales).
 * Si no coinciden con el tipo declarado, borra el archivo y devuelve false.
 */
function esImagenValida(rutaArchivo, mimetype) {
  let fd;
  try {
    fd = fs.openSync(rutaArchivo, 'r');
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    const ok = {
      'image/jpeg': () => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
      'image/png': () => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      'image/webp': () => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
    }[mimetype];
    if (ok && ok()) return true;
  } catch { /* se trata como inválido */ } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  try { fs.unlinkSync(rutaArchivo); } catch { /* ya no existe */ }
  return false;
}

module.exports = uploadFotoPerfil;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
module.exports.esImagenValida = esImagenValida;
