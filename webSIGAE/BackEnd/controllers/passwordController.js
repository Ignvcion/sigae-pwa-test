// CU14: recuperación de contraseña con un código de verificación de 6 dígitos
// enviado desde noreply@colegiojc.cl (antes era un enlace con token).
// Flujo: check-recovery-emails (RUT → correos enmascarados) → forgot-password
// (envía el código al correo elegido) → reset-password (RUT + código + nueva
// contraseña). Reglas del código en utils/codigosVerificacion.js.
// Una cuenta recién registrada (inactiva hasta su primer ingreso) también puede
// recuperar su contraseña: ver utils/primerIngreso.js.
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { validarFortalezaContrasena } = require('../middleware/validation');
const {
  PROPOSITOS,
  MINUTOS_VALIDEZ,
  enmascararCorreo,
  emitirCodigo,
  verificarCodigo,
  responderErrorCodigo,
} = require('../utils/codigosVerificacion');
const { columnaEsperaPrimerIngreso, cuentaUtilizable } = require('../utils/primerIngreso');

const MSG_GENERICO = 'Si los datos son correctos, recibirás un código de verificación en tu correo.';

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
              Apoderado_Correo_Natural,
              ${columnaEsperaPrimerIngreso('usuario')}
       FROM usuario WHERE Usuario_RUT = ?`,
      [rut]
    );

    // Respuesta genérica para no revelar existencia de RUT
    if (rows.length === 0 || !cuentaUtilizable(rows[0])) {
      return res.json({ correos: [] });
    }

    const u = rows[0];
    const correos = [];

    if (u.Administrador_Correo_Institucional) {
      correos.push({ tipo: 'Administrador (institucional)', enmascarado: enmascararCorreo(u.Administrador_Correo_Institucional) });
    }
    if (u.Docente_Correo_Institucional) {
      correos.push({ tipo: 'Docente (institucional)', enmascarado: enmascararCorreo(u.Docente_Correo_Institucional) });
    }
    if (u.Apoderado_Correo_Natural) {
      correos.push({ tipo: 'Apoderado (personal)', enmascarado: enmascararCorreo(u.Apoderado_Correo_Natural) });
    }

    // Solo se devuelve el correo enmascarado, nunca el valor real
    res.json({ correos });
  } catch (error) {
    console.error('Error en checkRecoveryEmails:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/auth/forgot-password
// Body: { rut, correoEnmascarado }
// Envía el código de recuperación al correo elegido.
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
              Apoderado_Correo_Natural,
              ${columnaEsperaPrimerIngreso('usuario')}
       FROM usuario WHERE Usuario_RUT = ?`,
      [rut]
    );

    // Respuesta genérica para no revelar si el RUT existe
    if (rows.length === 0 || !cuentaUtilizable(rows[0])) {
      return res.json({ message: MSG_GENERICO, minutos: MINUTOS_VALIDEZ });
    }

    const user = rows[0];

    // Recopilar correos disponibles
    const correosDisponibles = [
      user.Administrador_Correo_Institucional,
      user.Docente_Correo_Institucional,
      user.Apoderado_Correo_Natural,
    ].filter(Boolean);

    if (correosDisponibles.length === 0) {
      return res.json({ message: MSG_GENERICO, minutos: MINUTOS_VALIDEZ });
    }

    // Determinar el correo destino
    let correoDestino;
    if (correosDisponibles.length === 1) {
      correoDestino = correosDisponibles[0];
    } else {
      // Con múltiples correos, el frontend debe enviar el enmascarado elegido
      if (!correoEnmascarado) {
        return res.status(400).json({ error: 'Debes seleccionar a qué correo enviar el código' });
      }
      correoDestino = correosDisponibles.find((c) => enmascararCorreo(c) === correoEnmascarado);
      if (!correoDestino) {
        return res.status(400).json({ error: 'Correo seleccionado no válido' });
      }
    }

    // El código nunca se registra en los logs ni se devuelve en producción:
    // solo viaja por correo (en desarrollo sin SMTP se devuelve como devCodigo).
    const emitido = await emitirCodigo(pool, {
      usuarioId: user.Usuario_Id,
      nombre: user.Usuario_Nombre_Completo,
      correo: correoDestino,
      proposito: PROPOSITOS.RECUPERACION,
    });
    return res.json({
      message: MSG_GENERICO,
      minutos: MINUTOS_VALIDEZ,
      ...(emitido.devCodigo && { devCodigo: emitido.devCodigo }),
    });
  } catch (error) {
    if (responderErrorCodigo(res, error)) return;
    console.error('Error en forgotPassword:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/auth/reset-password
// Body: { rut, codigo, newPassword }
const resetPassword = async (req, res) => {
  const { rut, codigo, newPassword } = req.body;

  if (!rut || !codigo || !newPassword) {
    return res.status(400).json({ error: 'RUT, código y nueva contraseña son requeridos' });
  }

  // La contraseña se valida antes que el código: una contraseña débil no gasta un intento
  const errorFortaleza = validarFortalezaContrasena(newPassword);
  if (errorFortaleza) {
    return res.status(400).json({ error: errorFortaleza });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT Usuario_Id, Usuario_Estado_Cuenta, ${columnaEsperaPrimerIngreso('usuario')}
         FROM usuario WHERE Usuario_RUT = ?`,
      [rut]
    );
    if (rows.length === 0 || !cuentaUtilizable(rows[0])) {
      // Mismo mensaje que un código sin emitir: no revela si el RUT existe
      return res.status(400).json({ error: 'No hay un código vigente. Pide uno nuevo.' });
    }
    const usuarioId = rows[0].Usuario_Id;

    await verificarCodigo(pool, { usuarioId, proposito: PROPOSITOS.RECUPERACION, codigo });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // El código llegó a un correo de la cuenta: queda verificado (no se pide
    // otro código de activación justo después de recuperar la contraseña).
    await pool.execute(
      'UPDATE usuario SET `Usuario_Contraseña` = ?, Usuario_Correo_Verificado = 1 WHERE Usuario_Id = ?',
      [hashedPassword, usuarioId]
    );

    // Invalidar todas las sesiones activas del usuario por seguridad
    await pool.execute(
      `UPDATE sesion SET Sesion_Estado = 0, Sesion_Fecha_Expiracion = NOW()
       WHERE Usuario_Id = ? AND Sesion_Estado = 1`,
      [usuarioId]
    );

    res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (error) {
    if (responderErrorCodigo(res, error)) return;
    console.error('Error en resetPassword:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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

module.exports = { checkRecoveryEmails, forgotPassword, resetPassword, cambiarContrasena };
