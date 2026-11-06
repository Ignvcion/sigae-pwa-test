const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { hashToken } = require('../utils/sesion');

const verifyToken = async (req, res, next) => {

  const authHeader = req.headers['authorization'];

  const token =
    authHeader &&
    authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Token no proporcionado'
    });
  }

  // En `sesion` se guarda el hash del token, no el token (utils/sesion.js)
  const tokenHash = hashToken(token);

  try {

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // Verificar que la sesión siga activa en BD (cubre cuentas desactivadas y logouts)
    const [rows] = await pool.execute(
      `SELECT Sesion_Estado, Sesion_Fecha_Expiracion FROM sesion WHERE Sesion_Token_Acceso = ? LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0 || rows[0].Sesion_Estado === 0) {
      return res.status(401).json({
        error: 'Sesión inválida o cerrada',
        codigo: 'SESION_INACTIVA'
      });
    }

    // RNF05: sesión de 30 min de INACTIVIDAD (ventana deslizante), no de vida fija.
    // Sesion_Fecha_Expiracion guarda el corte de inactividad; si ya pasó, se cierra
    // la sesión aunque el JWT (válido hasta 30 min tras el login) no haya expirado.
    if (rows[0].Sesion_Fecha_Expiracion && new Date(rows[0].Sesion_Fecha_Expiracion) < new Date()) {
      await pool.execute(
        `UPDATE sesion SET Sesion_Estado = 0 WHERE Sesion_Token_Acceso = ? AND Sesion_Estado = 1`,
        [tokenHash]
      );
      return res.status(401).json({
        error: 'Sesión expirada por inactividad',
        codigo: 'SESION_INACTIVA'
      });
    }

    const nuevaExpiracion = new Date(Date.now() + 30 * 60 * 1000);
    await pool.execute(
      `UPDATE sesion SET Sesion_Fecha_Expiracion = ? WHERE Sesion_Token_Acceso = ?`,
      [nuevaExpiracion, tokenHash]
    );

    req.user = decoded;
    req.token = token;

    next();

  } catch (error) {

    // Distinguir token expirado de token inválido (CU 13)
    if (error.name === 'TokenExpiredError') {
      // Marcar sesión como expirada en BD
      try {
        await pool.execute(
          `UPDATE sesion
           SET Sesion_Estado = 0, Sesion_Fecha_Expiracion = NOW()
           WHERE Sesion_Token_Acceso = ? AND Sesion_Estado = 1`,
          [tokenHash]
        );
      } catch (_) { /* no bloquear la respuesta si falla la BD */ }

      return res.status(401).json({
        error: 'Sesión expirada',
        codigo: 'TOKEN_EXPIRADO'
      });
    }

    return res.status(401).json({
      error: 'Token inválido'
    });

  }

};

const verifyAdmin = (req, res, next) => {

  const roles = req.user?.roles || [];

  if (!roles.includes('Administrador')) {

    return res.status(403).json({
      error: 'No tienes permisos'
    });

  }

  next();

};

const verifySuperAdmin = (req, res, next) => {

  if (req.user?.administradorTipo !== 'Super Admin') {

    return res.status(403).json({
      error: 'Solo un Super Administrador puede realizar esta acción'
    });

  }

  next();

};

const verifyPuedeCrearRol = (req, res, next) => {
  const { Es_Administrador } = req.body;

  if (Es_Administrador) {
    if (req.user?.administradorTipo !== 'Super Admin') {
      return res.status(403).json({
        error: 'Solo un Super Administrador puede registrar administradores'
      });
    }
  }

  next();
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifySuperAdmin,
  verifyPuedeCrearRol,   // ← agrega esta línea
};