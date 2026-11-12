// Módulo de citaciones (CU74–CU79 / RF48–RF53).
// Cada función sigue los diagramas de secuencia del Incremento 3 (C_Citaciones → C_MySQL).
const pool = require('../config/db');
const { claseVigente } = require('../utils/clasesEliminadas');
const { buscarClaseEnTramo, describirClase } = require('../utils/disponibilidadDocente');
const { esApoderadoDelEstudiante } = require('../utils/apoderadosEstudiante');
const { finDeCitacion, cerrarPorCitacion, moverPorCitacion } = require('../utils/recepcionMensajes');
const { TIPOS, notificarCitacion, marcarLeidasCitacion } = require('../utils/notificaciones');

const ESTADO_PENDIENTE  = 'Pendiente de confirmación';
const ESTADO_CONFIRMADA = 'Confirmada';
const ESTADO_CANCELADA  = 'Cancelada';
const DESCRIPCION_REPROGRAMACION = 'Reprogramación de citación';

const MODALIDADES = ['Presencial', 'Online'];
const MIN_MOTIVO = 5;
const MAX_MOTIVO = 500;

// Tramos de 30 minutos entre 08:00 y 18:00, en el formato de Citacion_Tramo_Horario ("17:00 - 17:30")
const TRAMOS_HORARIOS = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const tramos = [];
  for (let h = 8; h < 18; h++) {
    tramos.push(`${pad(h)}:00 - ${pad(h)}:30`);
    tramos.push(`${pad(h)}:30 - ${pad(h + 1)}:00`);
  }
  return tramos;
})();

const esPendiente = (c) => String(c.Citacion_Estado || '').startsWith('Pendiente');
const esCancelada = (c) => String(c.Citacion_Estado || '').startsWith('Cancelada');

function hoyISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function esDiaHabil(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay();
  return dia !== 0 && dia !== 6;
}

// Valida fecha y tramo (compartido por CU74 y CU77). Devuelve { campo: mensaje } con los inválidos.
function validarFechaTramo(fecha, tramo) {
  const errores = {};
  if (!fecha) errores.fecha = 'La fecha es obligatoria';
  else if (!esFechaValida(fecha)) errores.fecha = 'Formato de fecha inválido';
  else if (fecha < hoyISO()) errores.fecha = 'La fecha no puede ser anterior a hoy';
  else if (!esDiaHabil(fecha)) errores.fecha = 'La citación debe agendarse en un día hábil (lunes a viernes)';

  if (!tramo) errores.tramo = 'El tramo horario es obligatorio';
  else if (!TRAMOS_HORARIOS.includes(tramo)) errores.tramo = 'Tramo horario inválido';
  return errores;
}

function validarMotivo(motivo, campo = 'motivo') {
  const limpio = typeof motivo === 'string' ? motivo.trim() : '';
  if (!limpio) return campo === 'motivo' ? 'El motivo de la citación es obligatorio' : 'Debe ingresar un motivo de cancelación válido';
  if (limpio.length < MIN_MOTIVO) return `El motivo debe tener al menos ${MIN_MOTIVO} caracteres`;
  if (limpio.length > MAX_MOTIVO) return `El motivo no puede superar los ${MAX_MOTIVO} caracteres`;
  return '';
}

const ROLES_CITACIONES = ['Docente', 'Apoderado', 'Administrador'];
const esAdministrador = (user) => (user?.roles || []).includes('Administrador');

// Rol con el que el usuario consulta la agenda: el rol activo enviado por el frontend (?rol=),
// siempre que lo tenga; si no, el primero de sus roles que participe en citaciones.
function resolverRol(user, rolSolicitado) {
  const roles = user?.roles || [];
  if (ROLES_CITACIONES.includes(rolSolicitado) && roles.includes(rolSolicitado)) return rolSolicitado;
  return ROLES_CITACIONES.find((r) => roles.includes(r)) || null;
}

// SELECT base con los datos que muestra la agenda. Las fechas se devuelven como texto (YYYY-MM-DD)
// para evitar desfases de zona horaria al serializar DATE a JSON.
// Ultimo_Reprogramador_Id permite saber a quién le toca confirmar tras una reprogramación (CU77).
const SELECT_CITACION = `
  SELECT
    c.Citacion_Id,
    DATE_FORMAT(c.Citacion_Fecha, '%Y-%m-%d') AS Citacion_Fecha,
    c.Citacion_Tramo_Horario,
    c.Citacion_Motivo,
    c.Citacion_Modalidad,
    c.Citacion_Estado,
    DATE_FORMAT(c.Citacion_Fecha_Confirmacion, '%Y-%m-%d') AS Citacion_Fecha_Confirmacion,
    c.Citacion_Motivo_Cancelacion,
    c.Citacion_Observaciones_Posteriores,
    c.Estudiante_Id,
    e.Estudiante_Nombre_Completo,
    cu.Curso_Nombre,
    c.Apoderado_Usuario_Id,
    ua.Usuario_Nombre_Completo AS Apoderado_Nombre,
    c.Docente_Usuario_Id,
    ud.Usuario_Nombre_Completo AS Docente_Nombre,
    c.Citacion_Solicitante_Rol,
    (
      SELECT h.Usuario_Responsable_Id
      FROM historial h
      WHERE h.Citacion_Id = c.Citacion_Id
        AND h.Historial_Descripcion_Cambio = '${DESCRIPCION_REPROGRAMACION}'
      ORDER BY h.Historial_Fecha_Registro DESC, h.Historial_Hora_Registro DESC, h.Historial_Id DESC
      LIMIT 1
    ) AS Ultimo_Reprogramador_Id
  FROM citacion c
  JOIN estudiante e   ON e.Estudiante_Id = c.Estudiante_Id
  LEFT JOIN curso cu  ON cu.Curso_Id = e.Curso_Id
  JOIN usuario ua     ON ua.Usuario_Id = c.Apoderado_Usuario_Id
  JOIN usuario ud     ON ud.Usuario_Id = c.Docente_Usuario_Id
`;

const ORDEN_CRONOLOGICO = 'ORDER BY c.Citacion_Fecha ASC, c.Citacion_Tramo_Horario ASC, c.Citacion_Id ASC';

// CU75/CU77/CU89: confirma la contraparte de quien hizo el último movimiento.
//  - Sin reprogramaciones: la contraparte de quien la originó. Si la citó el docente (o un
//    administrador, guardado en Docente_Usuario_Id) confirma el apoderado; si la solicitó el
//    apoderado (RF56), confirma el docente.
//  - Tras una reprogramación: si reprogramó el apoderado confirma el docente; si reprogramó el
//    docente o un administrador, confirma el apoderado.
// Puede_Confirmar indica si al usuario que consulta le corresponde confirmarla.
function formatearCitacion(fila, userId) {
  const { Ultimo_Reprogramador_Id, ...citacion } = fila;
  let requiere = null;
  if (esPendiente(citacion)) {
    let ultimoMovimientoApoderado = citacion.Citacion_Solicitante_Rol === 'Apoderado';
    if (Ultimo_Reprogramador_Id != null) {
      ultimoMovimientoApoderado =
        Number(Ultimo_Reprogramador_Id) === Number(citacion.Apoderado_Usuario_Id) &&
        Number(Ultimo_Reprogramador_Id) !== Number(citacion.Docente_Usuario_Id);
    }
    requiere = ultimoMovimientoApoderado ? 'Docente' : 'Apoderado';
  }
  const responsableId = requiere === 'Docente' ? citacion.Docente_Usuario_Id : citacion.Apoderado_Usuario_Id;
  const puedeConfirmar =
    requiere !== null && citacion.Citacion_Fecha >= hoyISO() && Number(responsableId) === Number(userId);
  return { ...citacion, Requiere_Confirmacion_De: requiere, Puede_Confirmar: puedeConfirmar };
}

// Busca una citación visible para el usuario: un Administrador/Super Admin accede a todas las de la
// institución; docentes y apoderados solo a aquellas en que participan.
// Devuelve null si no existe o no le pertenece: ambos casos son "no existe o no está disponible".
async function buscarCitacionDelUsuario(citacionId, user, conn = pool) {
  const id = Number(citacionId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [rows] = esAdministrador(user)
    ? await conn.query(`${SELECT_CITACION} WHERE c.Citacion_Id = ?`, [id])
    : await conn.query(
      `${SELECT_CITACION} WHERE c.Citacion_Id = ? AND (c.Docente_Usuario_Id = ? OR c.Apoderado_Usuario_Id = ?)`,
      [id, user.id, user.id]
    );
  return rows.length ? formatearCitacion(rows[0], user.id) : null;
}

// Verifica que ni el docente ni el apoderado tengan otra citación activa en la misma fecha y tramo
async function hayConflictoHorario(conn, { fecha, tramo, docenteId, apoderadoId, excluirId = null }) {
  const [rows] = await conn.query(
    `SELECT Citacion_Id FROM citacion
     WHERE Citacion_Fecha = ? AND Citacion_Tramo_Horario = ?
       AND Citacion_Estado <> ?
       AND (Docente_Usuario_Id = ? OR Apoderado_Usuario_Id = ?)
       ${excluirId ? 'AND Citacion_Id <> ?' : ''}
     LIMIT 1`,
    excluirId
      ? [fecha, tramo, ESTADO_CANCELADA, docenteId, apoderadoId, excluirId]
      : [fecha, tramo, ESTADO_CANCELADA, docenteId, apoderadoId]
  );
  return rows.length > 0;
}

const mensajeChoqueClase = (clase) =>
  `El tramo seleccionado coincide con una clase del docente: ${describirClase(clase)}`;

async function registrarHistorial(conn, { citacionId, atributo, anterior, nuevo, descripcion, responsableId }) {
  await conn.query(
    `INSERT INTO historial (
       Historial_Valor_Anterior, Historial_Hora_Registro, Historial_Descripcion_Cambio,
       Historial_Atributo_Modificado, Historial_Valor_Nuevo, Historial_Fecha_Registro,
       Citacion_Id, Usuario_Responsable_Id
     ) VALUES (?, CURTIME(), ?, ?, ?, CURDATE(), ?, ?)`,
    [anterior, descripcion, atributo, nuevo, citacionId, responsableId]
  );
}

// ── CU78: agenda cronológica de las citaciones del usuario (Administrador: toda la institución) ──
const getCitaciones = async (req, res) => {
  const rol = resolverRol(req.user, req.query.rol);
  if (!rol) {
    return res.status(403).json({ mensaje: 'No tienes permiso para consultar citaciones' });
  }
  try {
    let rows;
    if (rol === 'Administrador') {
      [rows] = await pool.query(`${SELECT_CITACION} ${ORDEN_CRONOLOGICO}`);
    } else {
      const columna = rol === 'Docente' ? 'c.Docente_Usuario_Id' : 'c.Apoderado_Usuario_Id';
      [rows] = await pool.query(`${SELECT_CITACION} WHERE ${columna} = ? ${ORDEN_CRONOLOGICO}`, [req.user.id]);
    }

    // Excepción 1: no existen citaciones asociadas al usuario
    if (rows.length === 0) {
      return res.status(200).json({ mensaje: 'No existen citaciones asociadas al usuario', citaciones: [] });
    }
    return res.json(rows.map((fila) => formatearCitacion(fila, req.user.id)));
  } catch (error) {
    console.error(error);
    // Excepción 2: error al recuperar la información
    return res.status(500).json({ mensaje: 'No fue posible recuperar la agenda de citaciones. Intente nuevamente.' });
  }
};

// ── CU75: solicitudes pendientes que esperan la confirmación del usuario ──
const getCitacionesPendientes = async (req, res) => {
  const rol = resolverRol(req.user, req.query.rol);
  if (!rol) {
    return res.status(403).json({ mensaje: 'No tienes permiso para consultar citaciones' });
  }
  try {
    // El administrador solo confirma las citaciones que él mismo creó (queda como citador)
    const columna = rol === 'Apoderado' ? 'c.Apoderado_Usuario_Id' : 'c.Docente_Usuario_Id';
    const [rows] = await pool.query(
      `${SELECT_CITACION}
       WHERE ${columna} = ? AND c.Citacion_Estado = ? AND c.Citacion_Fecha >= CURDATE()
       ${ORDEN_CRONOLOGICO}`,
      [req.user.id, ESTADO_PENDIENTE]
    );
    const pendientes = rows
      .map((fila) => formatearCitacion(fila, req.user.id))
      .filter((c) => c.Requiere_Confirmacion_De === (rol === 'Apoderado' ? 'Apoderado' : 'Docente') && c.Puede_Confirmar);

    // Excepción 1: no existen citaciones pendientes
    if (pendientes.length === 0) {
      return res.status(200).json({
        mensaje: `No existen citaciones pendientes para el ${rol.toLowerCase()}`,
        citaciones: [],
      });
    }
    return res.json(pendientes);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'No fue posible recuperar las solicitudes pendientes' });
  }
};

// ── CU76 / CU77: getDetalleCitacion(Citacion_Id) ──
const getDetalleCitacion = async (req, res) => {
  try {
    const citacion = await buscarCitacionDelUsuario(req.params.id, req.user);
    // Excepción 1: la citación no existe o no está disponible
    if (!citacion) {
      return res.status(404).json({ mensaje: 'La citación seleccionada no existe o no está disponible' });
    }
    // CU101: al ver el detalle, sus notificaciones quedan leídas
    await marcarLeidasCitacion(pool, { usuarioId: req.user.id, citacionId: citacion.Citacion_Id });
    return res.json(citacion);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'No fue posible recuperar el detalle de la citación' });
  }
};

// ── CU74: crearCitacion(datos) — Docente o Administrador/Super Admin ──
// Quien crea la citación queda como citador (Docente_Usuario_Id, FK a usuario).
const crearCitacion = async (req, res) => {
  const roles = req.user?.roles || [];
  const esAdmin = roles.includes('Administrador');
  if (!esAdmin && !roles.includes('Docente')) {
    return res.status(403).json({ mensaje: 'Solo un docente o un administrador puede crear citaciones' });
  }

  const {
    Estudiante_Id,
    Citacion_Fecha,
    Citacion_Tramo_Horario,
    Citacion_Motivo,
    Citacion_Modalidad,
  } = req.body || {};

  // Excepción 1: datos incompletos o inválidos en el formulario
  const errores = validarFechaTramo(Citacion_Fecha, Citacion_Tramo_Horario);
  const estudianteId = Number(Estudiante_Id);
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) {
    errores.estudianteId = 'Selecciona el estudiante (y su apoderado) a citar';
  }
  const errorMotivo = validarMotivo(Citacion_Motivo);
  if (errorMotivo) errores.motivo = errorMotivo;
  if (!Citacion_Modalidad) errores.modalidad = 'La modalidad es obligatoria';
  else if (!MODALIDADES.includes(Citacion_Modalidad)) errores.modalidad = 'Modalidad inválida';

  if (Object.keys(errores).length > 0) {
    return res.status(400).json({ mensaje: 'Datos incompletos o inválidos en el formulario', errores });
  }

  const docenteId = req.user.id;
  try {
    // Precondición: el estudiante existe y tiene apoderado asociado. Un docente solo puede citar
    // a estudiantes de sus cursos; un administrador, a cualquier estudiante de la institución.
    const [estudiantes] = esAdmin
      ? await pool.query(
        `SELECT e.Estudiante_Id, e.Apoderado_Usuario_Id
         FROM estudiante e
         WHERE e.Estudiante_Id = ? AND e.Estudiante_Fecha_Eliminacion IS NULL`,
        [estudianteId]
      )
      : await pool.query(
        `SELECT e.Estudiante_Id, e.Apoderado_Usuario_Id
         FROM estudiante e
         WHERE e.Estudiante_Id = ?
           AND e.Estudiante_Fecha_Eliminacion IS NULL
           AND e.Curso_Id IN (SELECT DISTINCT Curso_Id FROM horario_asignatura WHERE Usuario_Id = ? AND ${claseVigente('horario_asignatura')})`,
        [estudianteId, docenteId]
      );
    if (estudiantes.length === 0) {
      return res.status(400).json({
        mensaje: 'Datos incompletos o inválidos en el formulario',
        errores: { estudianteId: esAdmin ? 'El estudiante no existe' : 'El estudiante no pertenece a tus cursos' },
      });
    }
    const apoderadoId = estudiantes[0].Apoderado_Usuario_Id;
    if (!apoderadoId) {
      return res.status(400).json({
        mensaje: 'Datos incompletos o inválidos en el formulario',
        errores: { estudianteId: 'El estudiante no tiene un apoderado asociado' },
      });
    }

    // Pasos 7–10: validar disponibilidad horaria del docente y del apoderado
    // Excepción 2: no existe disponibilidad para la fecha y tramo seleccionado
    const conflicto = await hayConflictoHorario(pool, {
      fecha: Citacion_Fecha,
      tramo: Citacion_Tramo_Horario,
      docenteId,
      apoderadoId,
    });
    if (conflicto) {
      return res.status(409).json({ mensaje: 'No existe disponibilidad para la fecha y tramo seleccionado' });
    }
    // C-11 (decisión D8): la citación no puede coincidir con una clase del docente
    const clase = await buscarClaseEnTramo(pool, { docenteId, fecha: Citacion_Fecha, tramo: Citacion_Tramo_Horario });
    if (clase) {
      return res.status(409).json({ mensaje: mensajeChoqueClase(clase), clase });
    }

    // Pasos 11–14: INSERT con estado "Pendiente de confirmación"
    const [resultado] = await pool.query(
      `INSERT INTO citacion (
         Citacion_Tramo_Horario, Citacion_Fecha, Citacion_Motivo, Citacion_Estado,
         Citacion_Modalidad, Estudiante_Id, Apoderado_Usuario_Id, Docente_Usuario_Id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Citacion_Tramo_Horario,
        Citacion_Fecha,
        Citacion_Motivo.trim(),
        ESTADO_PENDIENTE,
        Citacion_Modalidad,
        estudianteId,
        apoderadoId,
        docenteId,
      ]
    );

    const citacion = await buscarCitacionDelUsuario(resultado.insertId, req.user);
    // CU101: el apoderado citado recibe la notificación
    await notificarCitacion(pool, {
      citacionId: resultado.insertId, tipo: TIPOS.CITACION_NUEVA, usuarioIds: [apoderadoId], actorId: docenteId,
    });
    return res.status(201).json({ mensaje: 'Citación creada, pendiente de confirmación', citacion });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'No fue posible registrar la citación. Intente nuevamente.' });
  }
};

// ── CU75: confirmarCitacion(citacion_id) ──
const confirmarCitacion = async (req, res) => {
  const userId = req.user.id;
  let conn;
  try {
    const citacion = await buscarCitacionDelUsuario(req.params.id, req.user);
    if (!citacion) {
      return res.status(404).json({ mensaje: 'La citación seleccionada no existe o no está disponible' });
    }
    if (!esPendiente(citacion)) {
      return res.status(409).json({ mensaje: 'La citación no se encuentra pendiente de confirmación' });
    }
    if (citacion.Citacion_Fecha < hoyISO()) {
      return res.status(409).json({ mensaje: 'La fecha de la citación ya pasó; no puede confirmarse' });
    }
    // Confirmar es aceptar la asistencia: solo la contraparte que corresponde, nunca un tercero
    // (ni siquiera un administrador en nombre de otro).
    if (!citacion.Puede_Confirmar) {
      return res.status(403).json({ mensaje: 'La confirmación de esta citación le corresponde a la contraparte' });
    }

    // Pasos 5–8: UPDATE estado a "Confirmada" y registro de fecha/hora en el historial
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [resultado] = await conn.query(
      `UPDATE citacion
       SET Citacion_Estado = ?, Citacion_Fecha_Confirmacion = CURDATE()
       WHERE Citacion_Id = ? AND Citacion_Estado = ?`,
      [ESTADO_CONFIRMADA, citacion.Citacion_Id, ESTADO_PENDIENTE]
    );
    if (resultado.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'La citación no se encuentra pendiente de confirmación' });
    }
    await registrarHistorial(conn, {
      citacionId: citacion.Citacion_Id,
      atributo: 'Citacion_Estado',
      anterior: citacion.Citacion_Estado,
      nuevo: ESTADO_CONFIRMADA,
      descripcion: 'Confirmación de citación',
      responsableId: userId,
    });
    await conn.commit();
    // CU101: la contraparte recibe la notificación del cambio de estado
    await notificarCitacion(pool, { citacionId: citacion.Citacion_Id, tipo: TIPOS.CITACION_CONFIRMADA, usuarioIds: [citacion.Docente_Usuario_Id, citacion.Apoderado_Usuario_Id], actorId: userId });

    // Paso 9: el cambio de estado queda visible para la contraparte en su agenda y en el historial
    return res.json({
      mensaje: 'Citación confirmada correctamente. Se notificó el cambio de estado a la contraparte.',
    });
  } catch (error) {
    console.error(error);
    if (conn) await conn.rollback().catch(() => {});
    // Excepción 2: error al actualizar el estado o registrar la confirmación
    return res.status(500).json({
      mensaje: 'Error al actualizar el estado o registrar la confirmación. Intente nuevamente.',
    });
  } finally {
    if (conn) conn.release();
  }
};

// ── CU76: cancelarCitacion(Citacion_Id, motivo) — Docente, Apoderado o Administrador ──
const cancelarCitacion = async (req, res) => {
  // Excepción 2: el actor no ingresa un motivo de cancelación válido
  const motivo = req.body?.Citacion_Motivo_Cancelacion;
  const errorMotivo = validarMotivo(motivo, 'cancelacion');
  if (errorMotivo) {
    return res.status(400).json({ mensaje: errorMotivo });
  }

  const userId = req.user.id;
  let conn;
  try {
    const citacion = await buscarCitacionDelUsuario(req.params.id, req.user);
    // Excepción 1: la citación seleccionada no existe o no está disponible
    if (!citacion || esCancelada(citacion) || citacion.Citacion_Fecha < hoyISO()) {
      return res.status(404).json({ mensaje: 'La citación seleccionada no existe o no está disponible' });
    }

    // Pasos 15–19: UPDATE estado y motivo + INSERT historial
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [resultado] = await conn.query(
      `UPDATE citacion
       SET Citacion_Estado = ?, Citacion_Motivo_Cancelacion = ?
       WHERE Citacion_Id = ? AND Citacion_Estado <> ?`,
      [ESTADO_CANCELADA, motivo.trim(), citacion.Citacion_Id, ESTADO_CANCELADA]
    );
    if (resultado.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'La citación seleccionada no existe o no está disponible' });
    }
    await registrarHistorial(conn, {
      citacionId: citacion.Citacion_Id,
      atributo: 'Citacion_Estado',
      anterior: citacion.Citacion_Estado,
      nuevo: ESTADO_CANCELADA,
      descripcion: `Cancelación de citación. Motivo: ${motivo.trim()}`,
      responsableId: userId,
    });
    // RF54 / CU86 Excepción 2: si se habilitaron respuestas desde esta citación, se cierran
    await cerrarPorCitacion(conn, citacion.Citacion_Id);
    await conn.commit();
    await notificarCitacion(pool, { citacionId: citacion.Citacion_Id, tipo: TIPOS.CITACION_CANCELADA, usuarioIds: [citacion.Docente_Usuario_Id, citacion.Apoderado_Usuario_Id], actorId: userId });

    return res.json({ mensaje: 'Citación cancelada correctamente' });
  } catch (error) {
    console.error(error);
    if (conn) await conn.rollback().catch(() => {});
    return res.status(500).json({ mensaje: 'No fue posible cancelar la citación. Intente nuevamente.' });
  } finally {
    if (conn) conn.release();
  }
};

// ── CU77: reprogramarCitacion(nuevos_datos) — Docente, Apoderado o Administrador ──
const reprogramarCitacion = async (req, res) => {
  const { Citacion_Fecha, Citacion_Tramo_Horario } = req.body || {};

  // Excepción 2 (datos inválidos)
  const errores = validarFechaTramo(Citacion_Fecha, Citacion_Tramo_Horario);
  if (Object.keys(errores).length > 0) {
    return res.status(400).json({ mensaje: Object.values(errores)[0], errores });
  }

  const userId = req.user.id;
  let conn;
  try {
    const citacion = await buscarCitacionDelUsuario(req.params.id, req.user);
    // Excepción 1: la citación no existe o no está disponible para edición
    if (!citacion || esCancelada(citacion) || citacion.Citacion_Fecha < hoyISO()) {
      return res.status(404).json({
        mensaje: 'La citación seleccionada no existe o no está disponible para edición',
      });
    }
    if (Citacion_Fecha === citacion.Citacion_Fecha && Citacion_Tramo_Horario === citacion.Citacion_Tramo_Horario) {
      return res.status(400).json({ mensaje: 'Debes modificar la fecha y/o el tramo horario para reprogramar' });
    }

    // Paso 5: validar disponibilidad horaria — Excepción 2 (conflicto)
    const conflicto = await hayConflictoHorario(pool, {
      fecha: Citacion_Fecha,
      tramo: Citacion_Tramo_Horario,
      docenteId: citacion.Docente_Usuario_Id,
      apoderadoId: citacion.Apoderado_Usuario_Id,
      excluirId: citacion.Citacion_Id,
    });
    if (conflicto) {
      return res.status(409).json({ mensaje: 'Los nuevos datos generan conflicto de disponibilidad horaria' });
    }
    // C-11 (decisión D8): el nuevo tramo no puede coincidir con una clase del docente citado
    const clase = await buscarClaseEnTramo(pool, {
      docenteId: citacion.Docente_Usuario_Id,
      fecha: Citacion_Fecha,
      tramo: Citacion_Tramo_Horario,
    });
    if (clase) {
      return res.status(409).json({ mensaje: mensajeChoqueClase(clase), clase });
    }

    // Pasos 5–8: UPDATE fecha/tramo y estado a "pendiente" hasta confirmación de la contraparte.
    // El registro en historial identifica a quién reprogramó (define quién debe confirmar).
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query(
      `UPDATE citacion
       SET Citacion_Fecha = ?, Citacion_Tramo_Horario = ?, Citacion_Estado = ?, Citacion_Fecha_Confirmacion = NULL
       WHERE Citacion_Id = ?`,
      [Citacion_Fecha, Citacion_Tramo_Horario, ESTADO_PENDIENTE, citacion.Citacion_Id]
    );
    await registrarHistorial(conn, {
      citacionId: citacion.Citacion_Id,
      atributo: 'Citacion_Fecha, Citacion_Tramo_Horario',
      anterior: `${citacion.Citacion_Fecha} ${citacion.Citacion_Tramo_Horario}`,
      nuevo: `${Citacion_Fecha} ${Citacion_Tramo_Horario}`,
      descripcion: DESCRIPCION_REPROGRAMACION,
      responsableId: userId,
    });
    // RF54 / CU86: las respuestas habilitadas desde esta citación duran hasta el nuevo tramo
    await moverPorCitacion(conn, citacion.Citacion_Id, Citacion_Fecha, Citacion_Tramo_Horario);
    await conn.commit();
    await notificarCitacion(pool, { citacionId: citacion.Citacion_Id, tipo: TIPOS.CITACION_REPROGRAMADA, usuarioIds: [citacion.Docente_Usuario_Id, citacion.Apoderado_Usuario_Id], actorId: userId });

    return res.json({
      mensaje: 'Citación reprogramada. Queda pendiente hasta la confirmación de la contraparte.',
    });
  } catch (error) {
    console.error(error);
    if (conn) await conn.rollback().catch(() => {});
    return res.status(500).json({ mensaje: 'No fue posible reprogramar la citación. Intente nuevamente.' });
  } finally {
    if (conn) conn.release();
  }
};

// ── RF54 / CU86: desde una citación, el docente habilita que el apoderado responda ──
// ── en su conversación hasta el término de la reunión                             ──
// POST /api/citaciones/:id/habilitar-respuestas
const habilitarRespuestasCitacion = async (req, res) => {
  let conn;
  try {
    const citacion = await buscarCitacionDelUsuario(req.params.id, req.user);
    if (!citacion || Number(citacion.Docente_Usuario_Id) !== Number(req.user.id)
        || !(req.user.roles || []).includes('Docente')) {
      return res.status(404).json({ mensaje: 'La citación no existe o no eres el docente citado' });
    }
    // CU86 Excepción 2: la citación está cancelada
    if (esCancelada(citacion)) {
      return res.status(409).json({ mensaje: 'La citación está cancelada: no se pueden habilitar respuestas desde ella' });
    }
    const hasta = finDeCitacion(citacion.Citacion_Fecha, citacion.Citacion_Tramo_Horario);
    // CU86 Excepción 1: la reunión ya terminó
    const [[{ futuro }]] = await pool.query('SELECT ? > NOW() AS futuro', [hasta]);
    if (!hasta || !Number(futuro)) {
      return res.status(409).json({ mensaje: 'La reunión ya terminó: no se pueden habilitar respuestas hasta ella' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [existentes] = await conn.query(
      `SELECT Conversacion_Id FROM conversacion
        WHERE Docente_Usuario_Id = ? AND Apoderado_Usuario_Id = ? AND Conversacion_Estado = 1
        ORDER BY Conversacion_Id DESC LIMIT 1`,
      [citacion.Docente_Usuario_Id, citacion.Apoderado_Usuario_Id]
    );
    let conversacionId = existentes[0]?.Conversacion_Id;
    if (!conversacionId) {
      const [nueva] = await conn.query(
        `INSERT INTO conversacion (Conversacion_Fecha_Inicio, Conversacion_Estado, Docente_Usuario_Id, Apoderado_Usuario_Id)
         VALUES (CURDATE(), 1, ?, ?)`,
        [citacion.Docente_Usuario_Id, citacion.Apoderado_Usuario_Id]
      );
      conversacionId = nueva.insertId;
    }
    await conn.query(
      `UPDATE conversacion SET Conversacion_Habilitada_Hasta = ?, Conversacion_Habilitada_Citacion_Id = ?
        WHERE Conversacion_Id = ?`,
      [hasta, citacion.Citacion_Id, conversacionId]
    );
    await conn.commit();
    return res.json({
      mensaje: `El apoderado puede responderte hasta el término de la reunión (${citacion.Citacion_Fecha} ${hasta.slice(11, 16)}).`,
      conversacionId,
      Habilitada_Hasta: hasta.slice(0, 16).replace(' ', 'T'),
    });
  } catch (error) {
    console.error(error);
    if (conn) await conn.rollback().catch(() => {});
    return res.status(500).json({ mensaje: 'No fue posible habilitar las respuestas del apoderado' });
  } finally {
    if (conn) conn.release();
  }
};

// ── CU79: getHistorialCitaciones(Estudiante_Id) — Docente, Apoderado, Admin y Super Admin ──
const getHistorialCitaciones = async (req, res) => {
  const estudianteId = Number(req.params.estudianteId);
  // Excepción 1: no se especifica un estudiante válido
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) {
    return res.status(400).json({ mensaje: 'No se especificó un estudiante válido' });
  }

  const { id: userId, roles = [] } = req.user;
  try {
    const [estudiantes] = await pool.query(
      `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Estudiante_RUT, e.Curso_Id,
              e.Apoderado_Usuario_Id, cu.Curso_Nombre
       FROM estudiante e
       LEFT JOIN curso cu ON cu.Curso_Id = e.Curso_Id
       WHERE e.Estudiante_Id = ?`,
      [estudianteId]
    );
    if (estudiantes.length === 0) {
      return res.status(404).json({ mensaje: 'No se especificó un estudiante válido' });
    }
    const estudiante = estudiantes[0];

    // Admin/Super Admin consultan cualquier estudiante; el apoderado solo a sus estudiantes
    // asociados; el docente solo a estudiantes de sus cursos.
    let autorizado = roles.includes('Administrador');
    if (!autorizado && roles.includes('Apoderado')) {
      // RF57: el titular y los suplentes son apoderados asociados del estudiante
      autorizado = Number(estudiante.Apoderado_Usuario_Id) === Number(userId)
        || await esApoderadoDelEstudiante(pool, userId, estudianteId);
    }
    if (!autorizado && roles.includes('Docente')) {
      const [cursos] = await pool.query(
        `SELECT 1 FROM horario_asignatura WHERE Usuario_Id = ? AND Curso_Id = ? AND ${claseVigente('horario_asignatura')} LIMIT 1`,
        [userId, estudiante.Curso_Id]
      );
      autorizado = cursos.length > 0;
    }
    if (!autorizado) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar el historial de este estudiante' });
    }

    // Pasos 5–7: SELECT citacion WHERE Estudiante_Id ORDER BY Citacion_Fecha
    const [filas] = await pool.query(`${SELECT_CITACION} WHERE c.Estudiante_Id = ? ${ORDEN_CRONOLOGICO}`, [estudianteId]);
    if (filas.length === 0) {
      return res.status(200).json({
        mensaje: 'No existen citaciones registradas para el estudiante seleccionado',
        estudiante,
        citaciones: [],
      });
    }

    // Pasos 8–9: SELECT historial WHERE Citacion_Id
    const ids = filas.map((c) => c.Citacion_Id);
    const [historial] = await pool.query(
      `SELECT h.Historial_Id, h.Citacion_Id,
              DATE_FORMAT(h.Historial_Fecha_Registro, '%Y-%m-%d') AS Historial_Fecha_Registro,
              h.Historial_Hora_Registro, h.Historial_Descripcion_Cambio, h.Historial_Atributo_Modificado,
              h.Historial_Valor_Anterior, h.Historial_Valor_Nuevo,
              u.Usuario_Nombre_Completo AS Usuario_Responsable_Nombre
       FROM historial h
       LEFT JOIN usuario u ON u.Usuario_Id = h.Usuario_Responsable_Id
       WHERE h.Citacion_Id IN (?)
       ORDER BY h.Historial_Fecha_Registro ASC, h.Historial_Hora_Registro ASC, h.Historial_Id ASC`,
      [ids]
    );

    // Pasos 10–11: historial completo organizado por fecha y estado
    const citaciones = filas.map((fila) => ({
      ...formatearCitacion(fila, userId),
      historial: historial.filter((h) => h.Citacion_Id === fila.Citacion_Id),
    }));

    return res.json({ estudiante, citaciones });
  } catch (error) {
    console.error(error);
    // Excepción 2: error al recuperar el historial o datos inconsistentes
    return res.status(500).json({ mensaje: 'No fue posible recuperar el historial de citaciones' });
  }
};

/**
 * @module CitacionController
 * @description Controlador encargado de gestionar la lógica de negocio para 
 * la creación, confirmación, cancelación, reprogramación y consulta de historial 
 * de citaciones (CU74 - CU79).
 */

module.exports = {
  habilitarRespuestasCitacion,
  getCitaciones,
  getCitacionesPendientes,
  getDetalleCitacion,
  crearCitacion,
  confirmarCitacion,
  cancelarCitacion,
  reprogramarCitacion,
  getHistorialCitaciones,
  // Compartidos con la solicitud de citación del apoderado (RF56) y con las pruebas unitarias
  ESTADO_PENDIENTE,
  ESTADO_CANCELADA,
  MODALIDADES,
  TRAMOS_HORARIOS,
  esCancelada,
  validarFechaTramo,
  validarMotivo,
  hayConflictoHorario,
  buscarCitacionDelUsuario,
  mensajeChoqueClase,
};
