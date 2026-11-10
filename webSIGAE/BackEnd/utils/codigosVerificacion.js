// utils/codigosVerificacion.js
// "Bot" de códigos de verificación: genera, guarda, envía (desde la cuenta
// noreply@colegiojc.cl, ver utils/mailer.js) y comprueba códigos de 6 dígitos.
//
// Se usa en tres flujos:
//   - Recuperacion      CU14: recuperar la contraseña (reemplaza al enlace).
//   - Cambio de correo  CU19: confirmar el correo nuevo antes de guardarlo.
//   - Activacion        primer ingreso: confirmar el correo antes de entregar
//                       la sesión (usuario.Usuario_Correo_Verificado).
//
// Reglas comunes:
//   - El código vence a los MINUTOS_VALIDEZ minutos y sirve una sola vez.
//   - En la tabla `codigo_verificacion` se guarda el hash SHA-256 del código con
//     una sal aleatoria, nunca el código.
//   - MAX_INTENTOS códigos incorrectos bloquean el código: hay que pedir otro.
//   - Pedir un código nuevo invalida el anterior del mismo propósito, y entre
//     dos envíos al mismo usuario deben pasar SEGUNDOS_ENTRE_ENVIOS segundos.
//   - Activación: el navegador recibe un "desafío" aleatorio (solo después de
//     ingresar RUT y contraseña correctos) que identifica el código sin exponer
//     el id del usuario. En la tabla se guarda su hash.
//   - Desarrollo sin SMTP: el código se muestra en la consola y se devuelve como
//     devCodigo. En producción el servidor no arranca sin SMTP (config/env.js).
const crypto = require('crypto');
const { esProduccion } = require('../config/env');
const { correoConfigurado, enviarCodigoVerificacion } = require('./mailer');

const PROPOSITOS = Object.freeze({
  RECUPERACION: 'Recuperacion',
  CAMBIO_CORREO: 'Cambio de correo',
  ACTIVACION: 'Activacion',
});

const MINUTOS_VALIDEZ = 10;
const MAX_INTENTOS = 5;
const SEGUNDOS_ENTRE_ENVIOS = 60;
// Un desafío de activación sirve para pedir otro código durante este tiempo
const MINUTOS_VALIDEZ_DESAFIO = 30;
// Los códigos más antiguos que esto se borran al emitir uno nuevo al mismo usuario
const DIAS_CONSERVACION = 30;

/** Error con el estado HTTP y el mensaje que se devuelve al usuario. */
class ErrorCodigo extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    Object.assign(this, extra);
  }
}

const sha256 = (texto) => crypto.createHash('sha256').update(String(texto)).digest('hex');
const hashCodigo = (sal, codigo) => sha256(`${sal}:${codigo}`);

/** Código de 6 dígitos (con ceros a la izquierda), uniforme y criptográficamente seguro. */
function generarCodigo() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/** "maria.perez@colegiojc.cl" → "ma*********@colegiojc.cl" */
function enmascararCorreo(correo) {
  if (!correo) return null;
  const [local, dominio] = String(correo).split('@');
  const visible = local.slice(0, 2);
  const oculto = '*'.repeat(Math.max(local.length - 2, 3));
  return `${visible}${oculto}@${dominio}`;
}

/** Normaliza lo que escribió el usuario: quita espacios y guiones ("123 456" → "123456"). */
function normalizarCodigoIngresado(codigo) {
  return String(codigo ?? '').replace(/[\s-]/g, '');
}

/**
 * Crea un código y lo envía por correo.
 * @param db   pool o conexión de mysql2 (execute)
 * @param opciones.usuarioId, nombre, correo (destino), proposito (PROPOSITOS)
 * @param opciones.conDesafio  devuelve un desafío para identificar el código (activación)
 * @param opciones.reutilizarVigente  si se pide antes de SEGUNDOS_ENTRE_ENVIOS y el código
 *        anterior sigue vigente, no se envía otro: se entrega un desafío nuevo para el
 *        mismo código (p. ej. el usuario volvió a iniciar sesión al minuto).
 * @returns {{ correoEnmascarado, desafio?, devCodigo?, reutilizado? }}
 * @throws ErrorCodigo 429 si debe esperar, 503 si no se pudo enviar
 */
async function emitirCodigo(db, {
  usuarioId, nombre, correo, proposito, conDesafio = false, reutilizarVigente = false,
}) {
  if (!Object.values(PROPOSITOS).includes(proposito)) {
    throw new Error(`Propósito de código desconocido: ${proposito}`);
  }
  const ahora = new Date();

  const [ultimos] = await db.execute(
    `SELECT Codigo_Verificacion_Id, Codigo_Verificacion_Estado, Codigo_Verificacion_Correo,
            Codigo_Verificacion_Fecha_Creacion, Codigo_Verificacion_Fecha_Expiracion
     FROM codigo_verificacion
     WHERE Usuario_Id = ? AND Codigo_Verificacion_Proposito = ?
     ORDER BY Codigo_Verificacion_Id DESC LIMIT 1`,
    [usuarioId, proposito]
  );
  const ultimo = ultimos[0];
  if (ultimo) {
    const transcurridos = (ahora - new Date(ultimo.Codigo_Verificacion_Fecha_Creacion)) / 1000;
    if (transcurridos < SEGUNDOS_ENTRE_ENVIOS) {
      const vigente = ultimo.Codigo_Verificacion_Estado === 'Pendiente'
        && ahora <= new Date(ultimo.Codigo_Verificacion_Fecha_Expiracion)
        && ultimo.Codigo_Verificacion_Correo === correo;
      if (reutilizarVigente && conDesafio && vigente) {
        const desafio = crypto.randomBytes(32).toString('hex');
        await db.execute(
          'UPDATE codigo_verificacion SET Codigo_Verificacion_Desafio = ? WHERE Codigo_Verificacion_Id = ?',
          [sha256(desafio), ultimo.Codigo_Verificacion_Id]
        );
        return { correoEnmascarado: enmascararCorreo(correo), desafio, reutilizado: true };
      }
      const segundos = Math.max(1, Math.ceil(SEGUNDOS_ENTRE_ENVIOS - transcurridos));
      throw new ErrorCodigo(429, `Espera ${segundos} segundos antes de pedir otro código.`, { segundos });
    }
  }

  // Solo un código vigente por usuario y propósito
  await db.execute(
    `UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = 'Expirado'
     WHERE Usuario_Id = ? AND Codigo_Verificacion_Proposito = ? AND Codigo_Verificacion_Estado = 'Pendiente'`,
    [usuarioId, proposito]
  );
  await db.execute(
    'DELETE FROM codigo_verificacion WHERE Usuario_Id = ? AND Codigo_Verificacion_Fecha_Creacion < ?',
    [usuarioId, new Date(ahora.getTime() - DIAS_CONSERVACION * 24 * 60 * 60 * 1000)]
  );

  const codigo = generarCodigo();
  const sal = crypto.randomBytes(16).toString('hex');
  const desafio = conDesafio ? crypto.randomBytes(32).toString('hex') : null;
  const expiracion = new Date(ahora.getTime() + MINUTOS_VALIDEZ * 60 * 1000);

  const [insercion] = await db.execute(
    `INSERT INTO codigo_verificacion
       (Usuario_Id, Codigo_Verificacion_Proposito, Codigo_Verificacion_Correo,
        Codigo_Verificacion_Hash, Codigo_Verificacion_Sal, Codigo_Verificacion_Desafio,
        Codigo_Verificacion_Intentos, Codigo_Verificacion_Estado,
        Codigo_Verificacion_Fecha_Creacion, Codigo_Verificacion_Fecha_Expiracion)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'Pendiente', ?, ?)`,
    [usuarioId, proposito, correo, hashCodigo(sal, codigo), sal, desafio && sha256(desafio), ahora, expiracion]
  );

  const invalidar = () => db.execute(
    `UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = 'Expirado'
     WHERE Codigo_Verificacion_Id = ?`,
    [insercion.insertId]
  );
  const resultado = { correoEnmascarado: enmascararCorreo(correo), ...(desafio && { desafio }) };

  if (correoConfigurado()) {
    try {
      await enviarCodigoVerificacion({ para: correo, nombre, codigo, minutos: MINUTOS_VALIDEZ, proposito });
    } catch (errorEnvio) {
      // El código no llegó a nadie: se invalida para que no quede vigente
      console.error(`codigosVerificacion: falló el envío (${proposito}):`, errorEnvio.message);
      await invalidar();
      throw new ErrorCodigo(503, 'No fue posible enviar el código por correo. Intenta más tarde o contacta a la administración.');
    }
    return resultado;
  }

  if (esProduccion) {
    // No debería ocurrir: server.js no arranca en producción sin SMTP_*
    await invalidar();
    throw new ErrorCodigo(503, 'El envío de códigos por correo no está disponible. Contacta a la administración.');
  }

  // Solo desarrollo y sin SMTP: el código se muestra para poder probar el flujo
  console.log(`[dev] Código de verificación (${proposito}) para ${correo}: ${codigo} (SMTP no configurado)`);
  return { ...resultado, devCodigo: codigo };
}

const MENSAJE_POR_ESTADO = {
  Utilizado: 'Este código ya fue usado. Pide uno nuevo.',
  Expirado: 'El código venció o fue reemplazado por uno más nuevo. Pide uno nuevo.',
  Bloqueado: 'Se agotaron los intentos para este código. Pide uno nuevo.',
};

/** Fila del código identificado por un desafío de activación (cualquier estado), o null. */
async function buscarPorDesafio(db, desafio, proposito) {
  if (!/^[0-9a-f]{64}$/.test(String(desafio ?? ''))) return null;
  const [filas] = await db.execute(
    `SELECT * FROM codigo_verificacion
     WHERE Codigo_Verificacion_Desafio = ? AND Codigo_Verificacion_Proposito = ?`,
    [sha256(desafio), proposito]
  );
  return filas[0] || null;
}

/** true si el desafío aún sirve para pedir otro código (MINUTOS_VALIDEZ_DESAFIO). */
function desafioVigente(fila, ahora = new Date()) {
  const creacion = new Date(fila.Codigo_Verificacion_Fecha_Creacion);
  return ahora - creacion <= MINUTOS_VALIDEZ_DESAFIO * 60 * 1000;
}

/**
 * Comprueba un código. Identifica el código por `desafio` (activación) o por el
 * último emitido al usuario para ese propósito.
 * @returns la fila del código (Usuario_Id, Codigo_Verificacion_Correo, ...) ya marcada como Utilizado
 * @throws ErrorCodigo 400 con el motivo (incorrecto, vencido, usado, bloqueado)
 */
async function verificarCodigo(db, { usuarioId, desafio, proposito, codigo }) {
  const ingresado = normalizarCodigoIngresado(codigo);
  if (!/^\d{6}$/.test(ingresado)) {
    throw new ErrorCodigo(400, 'El código tiene 6 dígitos.');
  }

  let fila;
  if (desafio !== undefined) {
    fila = await buscarPorDesafio(db, desafio, proposito);
  } else {
    const [filas] = await db.execute(
      `SELECT * FROM codigo_verificacion
       WHERE Usuario_Id = ? AND Codigo_Verificacion_Proposito = ?
       ORDER BY Codigo_Verificacion_Id DESC LIMIT 1`,
      [usuarioId, proposito]
    );
    fila = filas[0];
  }
  if (!fila) {
    throw new ErrorCodigo(400, 'No hay un código vigente. Pide uno nuevo.');
  }
  if (fila.Codigo_Verificacion_Estado !== 'Pendiente') {
    throw new ErrorCodigo(400, MENSAJE_POR_ESTADO[fila.Codigo_Verificacion_Estado] || 'El código no es válido. Pide uno nuevo.');
  }
  if (new Date() > new Date(fila.Codigo_Verificacion_Fecha_Expiracion)) {
    await db.execute(
      `UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = 'Expirado'
       WHERE Codigo_Verificacion_Id = ?`,
      [fila.Codigo_Verificacion_Id]
    );
    throw new ErrorCodigo(400, `El código venció (dura ${MINUTOS_VALIDEZ} minutos). Pide uno nuevo.`);
  }

  const esperado = Buffer.from(String(fila.Codigo_Verificacion_Hash), 'hex');
  const recibido = Buffer.from(hashCodigo(fila.Codigo_Verificacion_Sal, ingresado), 'hex');
  const coincide = esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);

  if (!coincide) {
    // El estado va antes que el contador: así ve el número de intentos previo
    // tanto si la base asigna de izquierda a derecha como en simultáneo.
    await db.execute(
      `UPDATE codigo_verificacion
       SET Codigo_Verificacion_Estado = IF(Codigo_Verificacion_Intentos + 1 >= ?, 'Bloqueado', Codigo_Verificacion_Estado),
           Codigo_Verificacion_Intentos = Codigo_Verificacion_Intentos + 1
       WHERE Codigo_Verificacion_Id = ? AND Codigo_Verificacion_Estado = 'Pendiente'`,
      [MAX_INTENTOS, fila.Codigo_Verificacion_Id]
    );
    const restantes = MAX_INTENTOS - (Number(fila.Codigo_Verificacion_Intentos) + 1);
    throw new ErrorCodigo(400, restantes > 0
      ? `Código incorrecto. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`
      : MENSAJE_POR_ESTADO.Bloqueado, { restantes: Math.max(restantes, 0) });
  }

  // Marcar como usado solo si nadie lo usó entremedio (dos envíos simultáneos)
  const [marcado] = await db.execute(
    `UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = 'Utilizado'
     WHERE Codigo_Verificacion_Id = ? AND Codigo_Verificacion_Estado = 'Pendiente'`,
    [fila.Codigo_Verificacion_Id]
  );
  if (marcado.affectedRows !== 1) {
    throw new ErrorCodigo(400, MENSAJE_POR_ESTADO.Utilizado);
  }
  return fila;
}

/** Responde un ErrorCodigo con su estado; devuelve false si `error` no es uno. */
function responderErrorCodigo(res, error, clave = 'error') {
  if (!(error instanceof ErrorCodigo)) return false;
  const cuerpo = { [clave]: error.message };
  if (error.segundos !== undefined) cuerpo.segundos = error.segundos;
  if (error.restantes !== undefined) cuerpo.intentosRestantes = error.restantes;
  res.status(error.status).json(cuerpo);
  return true;
}

module.exports = {
  PROPOSITOS,
  MINUTOS_VALIDEZ,
  MAX_INTENTOS,
  SEGUNDOS_ENTRE_ENVIOS,
  MINUTOS_VALIDEZ_DESAFIO,
  ErrorCodigo,
  generarCodigo,
  enmascararCorreo,
  emitirCodigo,
  verificarCodigo,
  buscarPorDesafio,
  desafioVigente,
  responderErrorCodigo,
};
