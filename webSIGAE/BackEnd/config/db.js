const mysql = require('mysql2/promise');
require('./env'); // carga el .env

// Sin valores por defecto para usuario y contraseña: vienen del .env
// (en desarrollo lo crean los scripts de setup desde .env.example; en
// producción server.js no arranca si falta alguno).
// DB_SSL=true: conexión cifrada y verificada contra la CA de Amazon RDS
// (perfil 'Amazon RDS' incluido en mysql2). Recomendado en producción.
const pool = mysql.createPool({
  host    : process.env.DB_HOST || 'localhost',
  port    : Number(process.env.DB_PORT) || 3306,
  user    : process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'sigae',
  ...(process.env.DB_SSL === 'true' && { ssl: 'Amazon RDS' }),
  charset : 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
