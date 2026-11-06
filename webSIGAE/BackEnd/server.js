// server.js
const { esProduccion, UPLOADS_DIR, origenesCors, validarEntornoProduccion } = require('./config/env');
const { instalarLogsSeguros } = require('./utils/logger');

// Producción: logs sin RUT, nombres ni notas (ver utils/logger.js) y arranque
// abortado si falta una variable obligatoria del .env (ver config/env.js).
if (esProduccion) instalarLogsSeguros();
validarEntornoProduccion();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const app = express();

// CORS_ORIGINS (o FRONTEND_URL): orígenes permitidos, separados por coma.
// En producción Nginx sirve el FrontEnd y /api en el mismo dominio, así que
// basta con el dominio público (https://...).
const corsOptions = {
  origin     : origenesCors(),
  credentials: true,
};

// Detrás de Nginx: confiar en UN proxy para que req.ip (rate limiter de login
// y recuperación) y req.secure salgan de X-Forwarded-For / X-Forwarded-Proto.
app.set('trust proxy', 1);

// RNF01: HTTPS obligatorio + cabeceras de seguridad (HSTS incluido).
// El certificado/terminación TLS la entrega el proxy/hosting; aquí solo
// forzamos que el tráfico ya autenticado como HTTPS lo siga siendo.
// crossOriginResourcePolicy en 'same-origin' (default de helmet) bloquearía que
// el FrontEnd (otro origen: distinto puerto/dominio) cargue imágenes de /uploads
// vía <img>, lo que rompe las fotografías de perfil (RF14/CU20) en este esquema
// de CORS explícito entre FrontEnd y BackEnd.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    res.redirect(301, `https://${req.headers.host}${req.url}`);
  });
}

app.use(cors(corsOptions));
app.use(express.json());

// CU20: archivos subidos (fotografías de perfil). Misma carpeta que usa
// middleware/uploadFotoPerfil.js (UPLOADS_DIR; por defecto BackEnd/uploads).
app.use('/uploads', express.static(UPLOADS_DIR, { dotfiles: 'deny', index: false }));

// ── RUTAS ────────────────────────────────────────────
const authRoutes        = require('./routes/authRoutes');
const usuarioRoutes     = require('./routes/usuarioRoutes');
const estudianteRoutes  = require('./routes/estudianteRoutes');
const cursoRoutes       = require('./routes/cursoRoutes');
const horarioRoutes     = require('./routes/horarioRoutes');
const bloquesRoutes     = require('./routes/bloquesRoutes');
const dashboardRoutes   = require('./routes/dashboardRoutes');
const planRoutes        = require('./routes/planRoutes');
const citacionRoutes    = require('./routes/citacionRoutes');
const mensajeRoutes = require('./routes/mensajeRoutes');
const promocionRoutes   = require('./routes/promocionRoutes');
const horarioAtencionRoutes = require('./routes/horarioAtencionRoutes');

app.use('/api/auth',        authRoutes);
app.use('/api/usuarios',    usuarioRoutes);
app.use('/api/estudiantes', estudianteRoutes);
app.use('/api/cursos',      cursoRoutes);
app.use('/api/horarios',    horarioRoutes);
app.use('/api/bloques',     bloquesRoutes);
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/planes',      planRoutes);
app.use('/api/citaciones',  citacionRoutes);
app.use('/api/mensajes', mensajeRoutes);
app.use('/api/promocion',   promocionRoutes);
app.use('/api/horario-atencion', horarioAtencionRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error global. Nunca devuelve el stack ni mensajes de SQL: en producción solo
// un mensaje genérico; en desarrollo se agrega "detalle" para depurar.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = Number.isInteger(err.status || err.statusCode) ? (err.status || err.statusCode) : 500;
  const codigo = status >= 400 && status < 600 ? status : 500;
  if (codigo >= 500) console.error(err);
  const cuerpo = { error: codigo >= 500 ? 'Error interno del servidor' : 'Solicitud inválida' };
  if (!esProduccion) cuerpo.detalle = err.message;
  res.status(codigo).json(cuerpo);
});

const PORT = process.env.PORT || 3000;
// HOST: en producción 127.0.0.1, para que solo Nginx llegue a la API.
const HOST = process.env.HOST || (esProduccion ? '127.0.0.1' : undefined);
app.listen(PORT, HOST, () => {
  console.log(`Servidor corriendo en ${HOST || '*'}:${PORT}`);
});
