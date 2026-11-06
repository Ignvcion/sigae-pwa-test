const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const { validarFortalezaContrasena } = require('../middleware/validation');
const { esProduccion } = require('../config/env');
const { correoConfigurado, enviarCorreoRecuperacion } = require('../utils/mailer');

const MINUTOS_VALIDEZ_ENLACE = 30;
const MSG_GENERICO = 'Si los datos son correctos, recibirás un enlace de recuperación.';


function enmascararCorreo(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  const oculto = '*'.repeat(Math.max(local.length - 2, 3));
  return `${visible}${oculto}@${domain}`;
}

// POST /api/auth/check-recovery-emails
// Body: { rut }
// Devuelve la lista de correos enmascarados del usuario para que elija
const checkRecoveryEmails = async (req, res) => {
  const { rut } = req.body;

  if (!rut) {
    return res.status(400).json({ error: 'El RUT es requerido' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT Usuario_Id, Usuario_Estado_Cuenta,
              Administrador_Correo_Institucional,
              Docente_Correo_Institucional,
              Apoderado_Correo_Natural
       FROM usuario WHERE Usuario_RUT = ?`,
      [rut]
    );

    // Respuesta genérica para no revelar existencia de RUT
    if (rows.length === 0 || !rows[0].Usuario_Estado_Cuenta) {
      return res.json({ correos: [] });
    }

    const u = rows[0];
    const correos = [];

    if (u.Administrador_Correo_Institucional) {
      correos.push({
        tipo: 'Administrador (institucional)',
        enmascarado: enmascararCorreo(u.Administrador_Correo_Institucional),
        valor: u.Administrador_Correo_Institucional,
      });
    }
    if (u.Docente_Correo_Institucional) {
      correos.push({
        tipo: 'Docente (institucional)',
        enmascarado: enmascararCorreo(u.Docente_Correo_Institucional),
        valor: u.Docente_Correo_Institucional,
      });
    }
    if (u.Apoderado_Correo_Natural) {
      correos.push({
        tipo: 'Apoderado (personal)',
        enmascarado: enmascararCorreo(u.Apoderado_Correo_Natural),
        valor: u.Apoderado_Correo_Natural,
      });
    }

    // Solo devolver el correo enmascarado al frontend, nunca el valor real
    const correosParaCliente = correos.map(({ tipo, enmascarado }) => ({ tipo, enmascarado }));

    res.json({ correos: correosParaCliente });
  } catch (error) {
    console.error('Error en checkRecoveryEmails:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/auth/forgot-password
// Body: { rut, correoEnmascarado }
const forgotPassword = async (req, res) => {
  const { rut, correoEnmascarado } = req.body;

  if (!rut) {
    return res.status(400).json({ error: 'El RUT es requerido' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Usuario_Estado_Cuenta,
              Administrador_Correo_Institucional,
              Docente_Correo_Institucional,
              Apoderado_Correo_Natural
       FROM usuario WHERE Usuario_RUT = ?`,
      [rut]
    );

    // Respuesta genérica para no revelar si el RUT existe
    if (rows.length === 0 || !rows[0].Usuario_Estado_Cuenta) {
      return res.json({ message: MSG_GENERICO });
    }

    const user = rows[0];

    // Recopilar correos disponibles
    const correosDisponibles = [
      user.Administrador_Correo_Institucional,
      user.Docente_Correo_Institucional,
      user.Apoderado_Correo_Natural,
    ].filter(Boolean);

    if (correosDisponibles.length === 0) {
      return res.json({ message: MSG_GENERICO });
    }

    // Determinar el correo destino
    let correoDestino;
    if (correosDisponibles.length === 1) {
      correoDestino = correosDisponibles[0];
    } else {
      // Con múltiples correos, el frontend debe enviar el enmascarado elegido
      if (!correoEnmascarado) {
        return res.status(400).json({ error: 'Debes seleccionar a qué correo enviar el enlace' });
      }
      correoDestino = correosDisponibles.find(
        (c) => enmascararCorreo(c) === correoEnmascarado
      );
      if (!correoDestino) {
        return res.status(400).json({ error: 'Correo seleccionado no válido' });
      }
    }

    // Invalidar tokens anteriores pendientes del mismo usuario
    await pool.execute(
      `UPDATE solicitud_recuperacion
       SET Solicitud_Recuperacion_Estado = 'Expirado'
       WHERE Usuario_Id = ? AND Solicitud_Recuperacion_Estado = 'En Proceso'`,
      [user.Usuario_Id]
    );

    // Generar token seguro — 30 minutos (CU 14)
    const token = crypto.randomBytes(32).toString('hex');
    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + MINUTOS_VALIDEZ_ENLACE * 60 * 1000);

    await pool.execute(
      `INSERT INTO solicitud_recuperacion
       (Solicitud_Recuperacion_Fecha_Expiracion, Solicitud_Recuperacion_Token,
        Solicitud_Recuperacion_Fecha_Creacion, Solicitud_Recuperacion_Estado, Usuario_Id)
       VALUES (?, ?, ?, 'En Proceso', ?)`,
      [expiracion, token, ahora, user.Usuario_Id]
    );

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    // El enlace (que contiene el token) nunca se registra en los logs ni se
    // devuelve en la respuesta en producción: solo viaja por correo.
    if (correoConfigurado()) {
      try {
        await enviarCorreoRecuperacion({
          para: correoDestino,
          nombre: user.Usuario_Nombre_Completo,
          enlace: resetLink,
          minutos: MINUTOS_VALIDEZ_ENLACE,
        });
      } catch (errorEnvio) {
        console.error('Error en forgotPassword (envío de correo):', errorEnvio);
        // El token no llegó a nadie: se invalida para que no quede vigente.
        await pool.execute(
          `UPDATE solicitud_recuperacion SET Solicitud_Recuperacion_Estado = 'Expirado'
           WHERE Solicitud_Recuperacion_Token = ?`,
          [token]
        );
        return res.status(503).json({
          error: 'No fue posible enviar el correo de recuperación. Intente más tarde o contacte al administrador.',
        });
      }
      return res.json({ message: MSG_GENERICO });
    }

    if (esProduccion) {
      // No debería ocurrir: server.js no arranca en producción sin SMTP_*.
      return res.status(503).json({
        error: 'La recuperación por correo no está disponible. Contacte al administrador.',
      });
    }

    // Solo desarrollo y sin SMTP configurado: el enlace se muestra en la consola
    // y se devuelve en la respuesta para poder probar el flujo.
    console.log(`[dev] Enlace de recuperación (SMTP no configurado): ${resetLink}`);
    return res.json({ message: MSG_GENERICO, devResetLink: resetLink });
  } catch (error) {
    console.error('Error en forgotPassword:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
  }

  const errorFortaleza = validarFortalezaContrasena(newPassword);
  if (errorFortaleza) {
    return res.status(400).json({ error: errorFortaleza });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT Solicitud_Recuperacion_Id, Usuario_Id,
              Solicitud_Recuperacion_Fecha_Expiracion, Solicitud_Recuperacion_Estado
       FROM solicitud_recuperacion
       WHERE Solicitud_Recuperacion_Token = ?
         AND Solicitud_Recuperacion_Estado = 'En Proceso'`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'El enlace no es válido o ya fue utilizado' });
    }

    const solicitud = rows[0];

    if (new Date() > new Date(solicitud.Solicitud_Recuperacion_Fecha_Expiracion)) {
      await pool.execute(
        `UPDATE solicitud_recuperacion SET Solicitud_Recuperacion_Estado = 'Expirado'
         WHERE Solicitud_Recuperacion_Id = ?`,
        [solicitud.Solicitud_Recuperacion_Id]
      );
      return res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      `UPDATE usuario SET Usuario_Contraseña = ? WHERE Usuario_Id = ?`,
      [hashedPassword, solicitud.Usuario_Id]
    );

    await pool.execute(
      `UPDATE solicitud_recuperacion SET Solicitud_Recuperacion_Estado = 'Utilizado'
       WHERE Solicitud_Recuperacion_Id = ?`,
      [solicitud.Solicitud_Recuperacion_Id]
    );

    // Invalidar todas las sesiones activas del usuario por seguridad
    await pool.execute(
      `UPDATE sesion SET Sesion_Estado = 0, Sesion_Fecha_Expiracion = NOW()
       WHERE Usuario_Id = ? AND Sesion_Estado = 1`,
      [solicitud.Usuario_Id]
    );

    res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/auth/validate-reset-token?token=...
const validateResetToken = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ valid: false, error: 'Token requerido' });
  }

  try {
    const [todas] = await pool.execute(
      `SELECT Solicitud_Recuperacion_Estado, Solicitud_Recuperacion_Fecha_Expiracion
       FROM solicitud_recuperacion
       WHERE Solicitud_Recuperacion_Token = ?`,
      [token]
    );

    if (todas.length === 0) {
      return res.json({ valid: false, error: 'El enlace no es válido o ya fue utilizado' });
    }

    const solicitud = todas[0];

    if (solicitud.Solicitud_Recuperacion_Estado !== 'En Proceso') {
      return res.json({ valid: false, error: `El enlace ya fue ${solicitud.Solicitud_Recuperacion_Estado === 'Utilizado' ? 'utilizado' : 'expirado'}. Solicita uno nuevo.` });
    }

    if (new Date() > new Date(solicitud.Solicitud_Recuperacion_Fecha_Expiracion)) {
      return res.json({ valid: false, error: 'El enlace ha expirado (30 min). Solicita uno nuevo.' });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Error en validateResetToken:', error);
    res.status(500).json({ valid: false, error: 'Error interno del servidor' });
  }
};

// PUT /api/auth/cambiar-contrasena
const cambiarContrasena = async (req, res) => {
  const { usuarioId, contrasenaActual, nuevaContrasena } = req.body;
  if (!usuarioId || !contrasenaActual || !nuevaContrasena)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });

  if (parseInt(usuarioId) !== req.user.id)
    return res.status(403).json({ error: 'No puedes cambiar la contraseña de otro usuario' });

  const errorFortaleza = validarFortalezaContrasena(nuevaContrasena);
  if (errorFortaleza) return res.status(400).json({ error: errorFortaleza });

  try {
    const [rows] = await pool.execute(
      'SELECT `Usuario_Contraseña` FROM usuario WHERE Usuario_Id = ?', [usuarioId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const hashActual = rows[0]['Usuario_Contraseña'];
    if (!hashActual) {
      console.error('[cambiarContrasena] Hash vacío para usuarioId:', usuarioId);
      return res.status(500).json({ error: 'Error al leer la contraseña almacenada' });
    }

    const valida = await bcrypt.compare(contrasenaActual, hashActual);
    if (!valida) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

    const hash = await bcrypt.hash(nuevaContrasena, 10);
    const [result] = await pool.execute(
      'UPDATE usuario SET `Usuario_Contraseña` = ? WHERE Usuario_Id = ?', [hash, usuarioId]
    );

    if (result.affectedRows === 0) {
      console.error('[cambiarContrasena] UPDATE no afectó filas para usuarioId:', usuarioId);
      return res.status(500).json({ error: 'No se pudo actualizar la contraseña' });
    }

    console.log('[cambiarContrasena] Contraseña actualizada para usuarioId:', usuarioId);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (e) {
    console.error('[cambiarContrasena] Error:', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { checkRecoveryEmails, forgotPassword, resetPassword, validateResetToken, cambiarContrasena };
