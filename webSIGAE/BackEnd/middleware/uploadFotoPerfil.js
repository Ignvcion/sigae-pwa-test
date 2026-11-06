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

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `usuario-${req.user.id}-${Date.now()}${ext}`);
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

module.exports = uploadFotoPerfil;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
