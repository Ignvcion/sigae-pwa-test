// server.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');

const app = express();

const corsOptions = {
  origin     : process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
};
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

// CU20: archivos subidos (fotografías de perfil)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/horario-atencion', horarioAtencionRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
