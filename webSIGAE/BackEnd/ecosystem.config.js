// ecosystem.config.js — configuración de pm2 para producción (EC2).
//
//   cd /ruta/a/webSIGAE/BackEnd
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup
//
// Aquí NO van secretos: la BD, JWT_SECRET, SMTP, CORS y UPLOADS_DIR se leen del
// archivo .env de esta misma carpeta (chmod 600, ver .env.example). Si falta
// una variable obligatoria, el servidor se niega a arrancar y pm2 muestra el
// motivo en `pm2 logs sigae-api`.
module.exports = {
  apps: [
    {
      name: 'sigae-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,          // t3.small (2 GB): un proceso + Chromium para exportar
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',     // si muere antes, cuenta como arranque fallido
      max_memory_restart: '600M',
      time: true,            // marca de tiempo en los logs
      env: {
        NODE_ENV: 'production',
        PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
      },
    },
  ],
};
