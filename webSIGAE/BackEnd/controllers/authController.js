const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { hashToken } = require('../utils/sesion');
const { tieneEtiquetaUTP, ROL_UTP } = require('../utils/permisos');
const { columnaEsperaPrimerIngreso, cuentaUtilizable } = require('../utils/primerIngreso');

const {
  PROPOSITOS,
  MINUTOS_VALIDEZ,
  emitirCodigo,
  verificarCodigo,
  buscarPorDesafio,
  desafioVigente,
  responderErrorCodigo,
} = require('../utils/codigosVerificacion');

const COLUMNAS_LOGIN = `Usuario_Id, Usuario_RUT, Usuario_Contraseña,
              Usuario_Nombre_Completo, Usuario_Estado_Cuenta, Usuario_Correo_Verificado,
              Es_Administrador, Administrador_Tipo, Administrador_Correo_Institucional,
              Es_Docente, Docente_Correo_Institucional,
              Es_Apoderado, Apoderado_Correo_Natural,
              ${columnaEsperaPrimerIngreso('usuario')}`;

/** Correo principal de la cuenta (según el rol): a él se envía el código de activación. */
const correoPrincipal = (user) =>
  user.Administrador_Correo_Institucional ||
  user.Docente_Correo_Institucional ||
  user.Apoderado_Correo_Natural ||
  null;

/** Crea la sesión (JWT + fila en `sesion`) y responde lo mismo que un login correcto. */
async function iniciarSesion(req, res, user) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.socket?.remoteAddress;
  const dispositivo = (req.headers['user-agent'] || 'desconocido').substring(0, 100);

  // Etiqueta UTP (utils/permisos.js): un administrador con UTP entra con el rol
  // 'UTP' en vez de 'Administrador', así que sus permisos quedan limitados a los
  // de la UTP. Un docente con UTP conserva el rol 'Docente' y suma esos permisos.
  const utp = tieneEtiquetaUTP(user);
  const roles = [];
  if (user.Es_Administrador) roles.push(utp ? ROL_UTP : 'Administrador');
  if (user.Es_Docente) roles.push('Docente');
  if (user.Es_Apoderado) roles.push('Apoderado');
  const administradorTipo = user.Es_Administrador && !utp ? (user.Administrador_Tipo || null) : null;

  const payload = {
    id: user.Usuario_Id,
    rut: user.Usuario_RUT,
    roles,
    administradorTipo,
    utp,
  };
  // RNF05: el JWT vive 30 min como techo máximo; la sesión real se
  // desliza en authMiddleware.verifyToken en cada request autenticado,
  // así que se cierra a los 30 min de INACTIVIDAD, no a los 30 min del login.
  // jwtid aleatorio: sin él, dos logins del mismo usuario en el mismo segundo
  // (p. ej. doble clic) firman el mismo token y el INSERT en `sesion` choca
  // con el UNIQUE de Sesion_Token_Acceso (500). En `sesion` se guarda el hash
  // del token, no el token (ver utils/sesion.js).
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30m', jwtid: crypto.randomUUID() });
  const expiracion = new Date(Date.now() + 30 * 60 * 1000);

  await pool.execute(
    `INSERT INTO sesion
    (Sesion_Token_Acceso, Sesion_Fecha_Inicio, Sesion_Fecha_Expiracion,
    Sesion_Direccion_IP, Sesion_Dispositivo, Sesion_Token_Expiracion, Sesion_Estado, Usuario_Id)
    VALUES (?, NOW(), ?, ?, ?, ?, 1, ?)`,
    [hashToken(token), expiracion, ip, dispositivo, expiracion, user.Usuario_Id]
  );

  // Primer inicio de sesión: la cuenta se registró inactiva y aquí pasa a activa
  if (!user.Usuario_Estado_Cuenta) {
    await pool.execute(
      'UPDATE usuario SET Usuario_Estado_Cuenta = 1 WHERE Usuario_Id = ? AND Usuario_Estado_Cuenta = 0',
      [user.Usuario_Id]
    );
  }

  return res.json({
    user: {
      id: user.Usuario_Id,
      nombre: user.Usuario_Nombre_Completo,
      rut: user.Usuario_RUT,
      correo: correoPrincipal(user),
      roles,
      administradorTipo,
      utp,
    },
    token
  });
}

/**
 * Activación (primer ingreso): envía el código al correo principal y responde
 * { requiereVerificacion, desafio, correoEnmascarado } en vez de la sesión.
 */
async function pedirActivacion(res, user, { reutilizarVigente }) {
  const emitido = await emitirCodigo(pool, {
    usuarioId: user.Usuario_Id,
    nombre: user.Usuario_Nombre_Completo,
    correo: correoPrincipal(user),
    proposito: PROPOSITOS.ACTIVACION,
    conDesafio: true,
    reutilizarVigente,
  });
  return res.json({
    requiereVerificacion: true,
    desafio: emitido.desafio,
    correoEnmascarado: emitido.correoEnmascarado,
    minutos: MINUTOS_VALIDEZ,
    ...(emitido.reutilizado && { aviso: 'Ya te enviamos un código hace un momento: revisa tu correo.' }),
    ...(emitido.devCodigo && { devCodigo: emitido.devCodigo }),
  });
}

const login = async (req, res) => {
  const { rut, password } = req.body;

  try {
    const [rows] = await pool.execute(`SELECT ${COLUMNAS_LOGIN} FROM usuario WHERE Usuario_RUT = ?`, [rut]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];

    // Una cuenta inactiva solo entra si espera su primer ingreso (utils/primerIngreso.js)
    if (!cuentaUtilizable(user)) {
      return res.status(401).json({ error: 'Cuenta deshabilitada, contacte al administrador' });
    }

    const validPassword = await bcrypt.compare(password, user.Usuario_Contraseña);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Primer ingreso (o correo cambiado por la administración): antes de entregar
    // la sesión se confirma el correo con un código. Una cuenta sin correo no
    // tiene nada que verificar y entra directo.
    if (!user.Usuario_Correo_Verificado && correoPrincipal(user)) {
      return await pedirActivacion(res, user, { reutilizarVigente: true });
    }

    return await iniciarSesion(req, res, user);
  } catch (error) {
    if (responderErrorCodigo(res, error)) return;
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/** Usuario dueño del desafío, si la cuenta sigue activa (o espera su primer ingreso); si no, null. */
async function usuarioDelDesafio(fila) {
  if (!fila) return null;
  const [rows] = await pool.execute(`SELECT ${COLUMNAS_LOGIN} FROM usuario WHERE Usuario_Id = ?`, [fila.Usuario_Id]);
  const user = rows[0];
  if (!cuentaUtilizable(user)) return null;
  return user;
}

// POST /api/auth/activacion/verificar
// Body: { desafio, codigo }. Si el código es correcto, marca el correo como
// verificado y entrega la sesión (misma respuesta que el login).
const verificarActivacion = async (req, res) => {
  const { desafio, codigo } = req.body || {};
  if (!desafio || !codigo) {
    return res.status(400).json({ error: 'Ingresa el código que te enviamos por correo' });
  }

  try {
    const fila = await verificarCodigo(pool, { desafio: String(desafio), proposito: PROPOSITOS.ACTIVACION, codigo });
    const user = await usuarioDelDesafio(fila);
    if (!user) {
      return res.status(401).json({ error: 'Cuenta deshabilitada, contacte al administrador' });
    }
    // Se verifica el correo al que llegó el código; si la administración lo cambió
    // entremedio, el nuevo sigue sin verificar y se pedirá otro código.
    if (correoPrincipal(user) !== fila.Codigo_Verificacion_Correo) {
      return res.status(409).json({ error: 'Tu correo cambió mientras verificabas. Inicia sesión de nuevo para recibir otro código.' });
    }
    await pool.execute('UPDATE usuario SET Usuario_Correo_Verificado = 1 WHERE Usuario_Id = ?', [user.Usuario_Id]);
    return await iniciarSesion(req, res, user);
  } catch (error) {
    if (responderErrorCodigo(res, error)) return;
    console.error('Error en verificarActivacion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/auth/activacion/reenviar
// Body: { desafio }. Envía otro código (respetando la espera entre envíos) y
// devuelve un desafío nuevo. El desafío sirve MINUTOS_VALIDEZ_DESAFIO minutos.
const reenviarActivacion = async (req, res) => {
  const { desafio } = req.body || {};
  const SESION_VENCIDA = 'La verificación venció. Inicia sesión de nuevo.';

  try {
    const fila = await buscarPorDesafio(pool, desafio, PROPOSITOS.ACTIVACION);
    if (!fila || !desafioVigente(fila)) {
      return res.status(400).json({ error: SESION_VENCIDA });
    }
    const user = await usuarioDelDesafio(fila);
    if (!user || user.Usuario_Correo_Verificado || !correoPrincipal(user)) {
      return res.status(400).json({ error: SESION_VENCIDA });
    }
    return await pedirActivacion(res, user, { reutilizarVigente: false });
  } catch (error) {
    if (responderErrorCodigo(res, error)) return;
    console.error('Error en reenviarActivacion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(400).json({ error: 'Token no proporcionado' });
  }

  try {
    // Marcar la sesión como inactiva (Sesion_Estado = 0) y registrar la expiración
    await pool.execute(
      `UPDATE sesion
       SET Sesion_Estado = 0, Sesion_Fecha_Expiracion = NOW()
       WHERE Sesion_Token_Acceso = ? AND Sesion_Estado = 1`,
      [hashToken(token)]
    );
    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { login, logout, verificarActivacion, reenviarActivacion, correoPrincipal };
