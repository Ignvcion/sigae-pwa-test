// Horario de atención de apoderados del docente (RF55 / CU87, CU88).
//
// Cada bloque (tramo) es un día de la semana con hora de inicio y término "desde–hasta",
// independiente del horario de clases, entre 08:00 y 18:00. El apoderado solicita citaciones
// de 30 minutos (en punto o y media) que caben completas en un tramo (RF56 / CU89), por eso
// cada tramo debe incluir al menos una. Reglas que lo enlazan con el resto del horario:
//   - no se superpone con sus clases del período vigente (CU87 Excepción 2) ni con otro tramo
//     de atención (CU87 Excepción 3);
//   - debe quedar dentro de su disponibilidad laboral (CU107) del período vigente, si la tiene;
//   - si un cambio deja fuera citaciones a futuro, se pide confirmación (CU88 Excepción 1).
// El docente lo edita por tramos o la semana completa (vista por bloques de 45 minutos).
const pool = require('../config/db');
const { obtenerPeriodos } = require('../utils/periodos');
const { normalizarTramos, unirTramos, cabeEnTramos, aHora } = require('../utils/disponibilidadLaboral');
const {
  bloquesDeJornada, tramosGuardados,
} = require('./disponibilidadLaboralController');
const {
  DIAS_SEMANA,
  aMinutos,
  minutosAHora,
  hhmm,
  parsearTramo,
  diaSemanaDeFecha,
  seSuperponen,
  buscarChoquesConClases,
  ocupacionesDelDocente,
  describirClase,
} = require('../utils/disponibilidadDocente');

const INICIO_ATENCION = 8 * 60;   // 08:00
const FIN_ATENCION = 18 * 60;     // 18:00
const PASO_MINUTOS = 30;          // duración de una citación (en punto o y media)

/** ¿El tramo [inicio, fin) incluye al menos una citación de 30 minutos en punto o y media? */
const alcanzaParaCitacion = (inicio, fin) => Math.ceil(inicio / PASO_MINUTOS) * PASO_MINUTOS + PASO_MINUTOS <= fin;

const ESTADO_CANCELADA = 'Cancelada';

const esDocente = (user) => (user?.roles || []).includes('Docente');

const SELECT_BLOQUES = `
  SELECT Horario_Atencion_Id, Horario_Atencion_Dia_Semana,
         Horario_Atencion_Hora_Inicio, Horario_Atencion_Hora_Fin, Docente_Usuario_Id
    FROM horario_atencion`;

const ORDEN_BLOQUES = `
  ORDER BY FIELD(Horario_Atencion_Dia_Semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'),
           Horario_Atencion_Hora_Inicio`;

/** Fila de BD → objeto que consume el frontend, con horas "HH:MM" */
function formatearBloque(fila) {
  return {
    Horario_Atencion_Id: fila.Horario_Atencion_Id,
    Horario_Atencion_Dia_Semana: fila.Horario_Atencion_Dia_Semana,
    Horario_Atencion_Hora_Inicio: hhmm(fila.Horario_Atencion_Hora_Inicio),
    Horario_Atencion_Hora_Fin: hhmm(fila.Horario_Atencion_Hora_Fin),
    Docente_Usuario_Id: fila.Docente_Usuario_Id,
  };
}

/** Bloques de atención de un docente, ordenados por día y hora (los usa también CU89). */
async function obtenerBloques(conn, docenteId) {
  const [filas] = await conn.query(`${SELECT_BLOQUES} WHERE Docente_Usuario_Id = ? ${ORDEN_BLOQUES}`, [docenteId]);
  return filas.map(formatearBloque);
}

/**
 * CU87 Excepción 1: datos incompletos o la hora de inicio no es anterior a la de término.
 * Devuelve { errores, datos } con los valores normalizados ("HH:MM") si son válidos.
 */
function validarBloque({ dia, horaInicio, horaFin } = {}) {
  const errores = {};
  if (!dia) errores.dia = 'El día es obligatorio';
  else if (!DIAS_SEMANA.includes(dia)) errores.dia = 'El día debe ser de lunes a viernes';

  const inicio = aMinutos(horaInicio);
  const fin = aMinutos(horaFin);
  if (!horaInicio) errores.horaInicio = 'La hora de inicio es obligatoria';
  else if (Number.isNaN(inicio)) errores.horaInicio = 'Hora de inicio inválida';
  if (!horaFin) errores.horaFin = 'La hora de término es obligatoria';
  else if (Number.isNaN(fin)) errores.horaFin = 'Hora de término inválida';

  if (!errores.horaInicio && !errores.horaFin) {
    if (inicio >= fin) {
      errores.horaFin = 'La hora de inicio debe ser anterior a la hora de término';
    } else if (inicio < INICIO_ATENCION || fin > FIN_ATENCION) {
      errores.horaInicio = 'El horario de atención debe estar entre las 08:00 y las 18:00';
    } else if (!alcanzaParaCitacion(inicio, fin)) {
      errores.horaFin = 'El bloque debe incluir al menos una citación de 30 minutos (en punto o y media)';
    }
  }

  if (Object.keys(errores).length > 0) return { errores, datos: null };
  return { errores: null, datos: { dia, inicio, fin } };
}

/**
 * CU87 Excepciones 2 y 3: el bloque no puede superponerse con una clase del docente
 * ni con otro de sus bloques de atención. Devuelve la respuesta de error o null.
 */
async function validarSuperposiciones(conn, docenteId, { dia, inicio, fin }, excluirId = null) {
  const clases = await buscarChoquesConClases(conn, { docenteId, dia, inicio, fin });
  if (clases.length > 0) {
    return {
      status: 409,
      body: {
        mensaje: `El bloque se superpone con una clase asignada: ${clases.map(describirClase).join('; ')}`,
        clases,
      },
    };
  }

  const bloques = await obtenerBloques(conn, docenteId);
  const otro = bloques.find(
    (b) =>
      b.Horario_Atencion_Id !== excluirId &&
      b.Horario_Atencion_Dia_Semana === dia &&
      seSuperponen({ inicio, fin }, {
        inicio: aMinutos(b.Horario_Atencion_Hora_Inicio),
        fin: aMinutos(b.Horario_Atencion_Hora_Fin),
      })
  );
  if (otro) {
    return {
      status: 409,
      body: {
        mensaje: `El bloque se superpone con otro bloque de atención (${otro.Horario_Atencion_Dia_Semana} `
          + `${otro.Horario_Atencion_Hora_Inicio}–${otro.Horario_Atencion_Hora_Fin})`,
      },
    };
  }

  const fuera = await fueraDeDisponibilidadLaboral(conn, docenteId, [{ dia, inicio, fin }]);
  if (fuera.mensajes.length > 0) return { status: 409, body: { mensaje: fuera.mensajes[0] } };
  return null;
}

/**
 * CU107: los tramos de atención deben quedar dentro de la disponibilidad laboral del
 * docente en el período vigente (si no tiene disponibilidad registrada, no hay restricción).
 * Devuelve la disponibilidad (unida por día) y un mensaje por cada tramo que queda fuera.
 */
async function fueraDeDisponibilidadLaboral(conn, docenteId, tramos) {
  const { vigente } = await obtenerPeriodos(conn);
  const disponibilidad = await tramosGuardados(conn, docenteId, vigente);
  if (disponibilidad.length === 0) return { disponibilidad, mensajes: [] };
  const porDia = new Map(DIAS_SEMANA.map((d) => [d, unirTramos(disponibilidad.filter((t) => t.dia === d))]));
  const mensajes = tramos
    .filter((t) => !cabeEnTramos(porDia.get(t.dia) || [], t.inicio, t.fin))
    .map((t) => {
      const libres = (porDia.get(t.dia) || []).map((x) => `${aHora(x.inicio)}–${aHora(x.fin)}`).join(' y ');
      return `El tramo ${t.dia} ${aHora(t.inicio)}–${aHora(t.fin)} queda fuera de tu disponibilidad laboral `
        + `(${libres ? `ese día estás disponible ${libres}` : 'ese día no tienes disponibilidad'}). `
        + 'Si necesitas otro horario, pide a un administrador que actualice tu disponibilidad.';
    });
  return { disponibilidad, mensajes };
}

/**
 * CU88 Excepción 1: citaciones futuras (pendientes o confirmadas) del docente que caen dentro
 * del bloque y que dejarían de estar cubiertas por el horario de atención tras el cambio.
 * `nuevo` es el intervalo que reemplaza al bloque (null si se elimina).
 */
async function citacionesAfectadas(conn, docenteId, bloque, nuevo = null) {
  const [filas] = await conn.query(
    `SELECT c.Citacion_Id,
            DATE_FORMAT(c.Citacion_Fecha, '%Y-%m-%d') AS Citacion_Fecha,
            c.Citacion_Tramo_Horario, c.Citacion_Estado,
            e.Estudiante_Nombre_Completo, ua.Usuario_Nombre_Completo AS Apoderado_Nombre
       FROM citacion c
       JOIN estudiante e ON e.Estudiante_Id = c.Estudiante_Id
       JOIN usuario ua   ON ua.Usuario_Id = c.Apoderado_Usuario_Id
      WHERE c.Docente_Usuario_Id = ?
        AND c.Citacion_Fecha >= CURDATE()
        AND c.Citacion_Estado <> ?
      ORDER BY c.Citacion_Fecha, c.Citacion_Tramo_Horario`,
    [docenteId, ESTADO_CANCELADA]
  );
  const actual = {
    inicio: aMinutos(bloque.Horario_Atencion_Hora_Inicio),
    fin: aMinutos(bloque.Horario_Atencion_Hora_Fin),
  };
  const dentro = (tramo, intervalo) => tramo.inicio >= intervalo.inicio && tramo.fin <= intervalo.fin;

  return filas.filter((c) => {
    const tramo = parsearTramo(c.Citacion_Tramo_Horario);
    if (!tramo) return false;
    const dia = diaSemanaDeFecha(c.Citacion_Fecha);
    if (dia !== bloque.Horario_Atencion_Dia_Semana || !dentro(tramo, actual)) return false;
    // Si el bloque se modifica, solo importan las que quedan fuera del nuevo intervalo
    return !(nuevo && nuevo.dia === dia && dentro(tramo, nuevo));
  });
}

async function buscarBloquePropio(conn, id, docenteId) {
  const bloqueId = Number(id);
  if (!Number.isInteger(bloqueId) || bloqueId <= 0) return null;
  const [filas] = await conn.query(
    `${SELECT_BLOQUES} WHERE Horario_Atencion_Id = ? AND Docente_Usuario_Id = ?`,
    [bloqueId, docenteId]
  );
  return filas.length ? formatearBloque(filas[0]) : null;
}

const confirmado = (valor) => valor === true || valor === 'true' || valor === '1' || valor === 1;

const SOLO_DOCENTE = { mensaje: 'Solo un docente puede gestionar su horario de atención de apoderados' };
const BLOQUE_NO_EXISTE = { mensaje: 'El bloque de atención no existe o no te pertenece' };

// ── CU87 / CU88: bloques de atención del docente autenticado ──
const getMiHorarioAtencion = async (req, res) => {
  if (!esDocente(req.user)) return res.status(403).json(SOLO_DOCENTE);
  try {
    const bloques = await obtenerBloques(pool, req.user.id);
    if (bloques.length === 0) {
      return res.status(200).json({ mensaje: 'Aún no registras bloques de atención de apoderados', bloques: [] });
    }
    return res.json(bloques);
  } catch (error) {
    console.error('getMiHorarioAtencion:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar tu horario de atención' });
  }
};

// ── CU87: registrar un bloque de atención ──
const crearBloqueAtencion = async (req, res) => {
  if (!esDocente(req.user)) return res.status(403).json(SOLO_DOCENTE);

  const { errores, datos } = validarBloque(req.body);
  if (errores) {
    return res.status(400).json({ mensaje: 'Datos incompletos o inválidos', errores });
  }

  const docenteId = req.user.id;
  try {
    const error = await validarSuperposiciones(pool, docenteId, datos);
    if (error) return res.status(error.status).json(error.body);

    const [resultado] = await pool.query(
      `INSERT INTO horario_atencion
         (Horario_Atencion_Dia_Semana, Horario_Atencion_Hora_Inicio, Horario_Atencion_Hora_Fin, Docente_Usuario_Id)
       VALUES (?, ?, ?, ?)`,
      [datos.dia, minutosAHora(datos.inicio), minutosAHora(datos.fin), docenteId]
    );
    return res.status(201).json({
      mensaje: 'Bloque de atención registrado. Ya está disponible para solicitudes de citación.',
      bloque: {
        Horario_Atencion_Id: resultado.insertId,
        Horario_Atencion_Dia_Semana: datos.dia,
        Horario_Atencion_Hora_Inicio: minutosAHora(datos.inicio),
        Horario_Atencion_Hora_Fin: minutosAHora(datos.fin),
        Docente_Usuario_Id: docenteId,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya tienes un bloque de atención que comienza ese día a esa hora' });
    }
    console.error('crearBloqueAtencion:', error);
    return res.status(500).json({ mensaje: 'No fue posible registrar el bloque de atención' });
  }
};

// ── CU88: modificar un bloque de atención ──
const actualizarBloqueAtencion = async (req, res) => {
  if (!esDocente(req.user)) return res.status(403).json(SOLO_DOCENTE);

  const { errores, datos } = validarBloque(req.body);
  if (errores) {
    return res.status(400).json({ mensaje: 'Datos incompletos o inválidos', errores });
  }

  const docenteId = req.user.id;
  try {
    const bloque = await buscarBloquePropio(pool, req.params.id, docenteId);
    if (!bloque) return res.status(404).json(BLOQUE_NO_EXISTE);

    // CU88 Excepción 2: los nuevos datos se superponen con clases u otros bloques
    const error = await validarSuperposiciones(pool, docenteId, datos, bloque.Horario_Atencion_Id);
    if (error) return res.status(error.status).json(error.body);

    // CU88 Excepción 1: citaciones a futuro que quedarían fuera del horario de atención
    const afectadas = await citacionesAfectadas(pool, docenteId, bloque, datos);
    if (afectadas.length > 0 && !confirmado(req.body?.confirmar)) {
      return res.status(409).json({
        mensaje: 'El bloque tiene citaciones agendadas a futuro que quedarían fuera del horario de atención. '
          + 'Confirma para continuar; las citaciones se mantienen y puedes reprogramarlas desde Citaciones.',
        requiereConfirmacion: true,
        citaciones: afectadas,
      });
    }

    await pool.query(
      `UPDATE horario_atencion
          SET Horario_Atencion_Dia_Semana = ?, Horario_Atencion_Hora_Inicio = ?, Horario_Atencion_Hora_Fin = ?
        WHERE Horario_Atencion_Id = ? AND Docente_Usuario_Id = ?`,
      [datos.dia, minutosAHora(datos.inicio), minutosAHora(datos.fin), bloque.Horario_Atencion_Id, docenteId]
    );
    return res.json({ mensaje: 'Bloque de atención actualizado' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya tienes un bloque de atención que comienza ese día a esa hora' });
    }
    console.error('actualizarBloqueAtencion:', error);
    return res.status(500).json({ mensaje: 'No fue posible actualizar el bloque de atención' });
  }
};

// ── CU88: eliminar un bloque de atención ──
const eliminarBloqueAtencion = async (req, res) => {
  if (!esDocente(req.user)) return res.status(403).json(SOLO_DOCENTE);

  const docenteId = req.user.id;
  try {
    const bloque = await buscarBloquePropio(pool, req.params.id, docenteId);
    if (!bloque) return res.status(404).json(BLOQUE_NO_EXISTE);

    const afectadas = await citacionesAfectadas(pool, docenteId, bloque);
    if (afectadas.length > 0 && !confirmado(req.query?.confirmar)) {
      return res.status(409).json({
        mensaje: 'El bloque tiene citaciones agendadas a futuro. Confirma para eliminarlo; '
          + 'las citaciones se mantienen y puedes reprogramarlas o cancelarlas desde Citaciones.',
        requiereConfirmacion: true,
        citaciones: afectadas,
      });
    }

    await pool.query(
      'DELETE FROM horario_atencion WHERE Horario_Atencion_Id = ? AND Docente_Usuario_Id = ?',
      [bloque.Horario_Atencion_Id, docenteId]
    );
    return res.json({ mensaje: 'Bloque de atención eliminado' });
  } catch (error) {
    console.error('eliminarBloqueAtencion:', error);
    return res.status(500).json({ mensaje: 'No fue posible eliminar el bloque de atención' });
  }
};

// ── CU87 / CU88: semana completa de atención, con la vista por bloques de 45 minutos ──
// GET /api/horario-atencion/semana
const getSemanaAtencion = async (req, res) => {
  if (!esDocente(req.user)) return res.status(403).json(SOLO_DOCENTE);
  const docenteId = req.user.id;
  try {
    const { vigente } = await obtenerPeriodos(pool);
    const bloques = await obtenerBloques(pool, docenteId);
    const disponibilidad = await tramosGuardados(pool, docenteId, vigente);
    return res.json({
      periodo: vigente,
      dias: DIAS_SEMANA,
      limites: { minimo: minutosAHora(INICIO_ATENCION), maximo: minutosAHora(FIN_ATENCION) },
      duracionCitacion: PASO_MINUTOS,
      tramos: bloques.map((b) => ({
        dia: b.Horario_Atencion_Dia_Semana,
        hora_inicio: b.Horario_Atencion_Hora_Inicio,
        hora_fin: b.Horario_Atencion_Hora_Fin,
      })),
      disponibilidadLaboral: disponibilidad.map((t) => ({ dia: t.dia, hora_inicio: aHora(t.inicio), hora_fin: aHora(t.fin) })),
      bloques: await bloquesDeJornada(pool),
      // Clases, electivos y bloques P.I.E.: ninguno admite atención de apoderados
      clases: (await ocupacionesDelDocente(pool, docenteId)).map((o) => ({
        Horario_Asignatura_Id: o.id,
        tipo: o.tipo,
        dia: o.dia,
        Bloque_Horario_Id: o.bloqueId,
        hora_inicio: o.horaInicio,
        hora_fin: o.horaFin,
        curso: o.curso,
        asignatura: o.asignatura,
      })),
    });
  } catch (error) {
    console.error('getSemanaAtencion:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar tu horario de atención' });
  }
};

/** Citaciones a futuro (no canceladas) que están en algún tramo actual y no caben en los nuevos. */
async function citacionesFueraDeLosTramos(conn, docenteId, actuales, nuevos) {
  const afectadas = new Map();
  for (const bloque of actuales) {
    const nuevosDelDia = nuevos.filter((t) => t.dia === bloque.Horario_Atencion_Dia_Semana);
    for (const c of await citacionesAfectadas(conn, docenteId, bloque)) {
      const tramo = parsearTramo(c.Citacion_Tramo_Horario);
      if (!nuevosDelDia.some((t) => t.inicio <= tramo.inicio && tramo.fin <= t.fin)) afectadas.set(c.Citacion_Id, c);
    }
  }
  return [...afectadas.values()];
}

// PUT /api/horario-atencion/semana   Body: { tramos: [{ dia, hora_inicio, hora_fin }], confirmar? }
// Reemplaza toda la semana con las mismas validaciones de CU87 y CU88.
const guardarSemanaAtencion = async (req, res) => {
  if (!esDocente(req.user)) return res.status(403).json(SOLO_DOCENTE);
  const normalizados = normalizarTramos(req.body?.tramos, {
    minimo: INICIO_ATENCION,
    maximo: FIN_ATENCION,
    minDuracion: PASO_MINUTOS,
    nombre: 'El horario de atención',
  });
  // CU87 Excepciones 1 y 3: datos inválidos o tramos de atención que se superponen
  if (!normalizados.ok) return res.status(400).json({ mensaje: normalizados.mensaje });
  const tramos = normalizados.tramos;
  const sinCitacion = tramos.find((t) => !alcanzaParaCitacion(t.inicio, t.fin));
  if (sinCitacion) {
    return res.status(400).json({
      mensaje: `El tramo ${sinCitacion.dia} ${aHora(sinCitacion.inicio)}–${aHora(sinCitacion.fin)} no incluye `
        + 'ninguna citación de 30 minutos (en punto o y media)',
    });
  }

  const docenteId = req.user.id;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // CU87 Excepción 2: ningún tramo puede superponerse con una clase del período vigente
    const conflictos = [];
    for (const t of tramos) {
      const clases = await buscarChoquesConClases(conn, { docenteId, dia: t.dia, inicio: t.inicio, fin: t.fin });
      if (clases.length > 0) {
        conflictos.push(`El tramo ${t.dia} ${aHora(t.inicio)}–${aHora(t.fin)} se superpone con una clase asignada: `
          + `${clases.map(describirClase).join('; ')}`);
      }
    }
    // CU107: dentro de la disponibilidad laboral
    conflictos.push(...(await fueraDeDisponibilidadLaboral(conn, docenteId, tramos)).mensajes);
    if (conflictos.length > 0) {
      await conn.rollback();
      return res.status(409).json({ mensaje: conflictos[0], conflictos });
    }

    // CU88 Excepción 1: citaciones a futuro que quedarían fuera del horario de atención
    const actuales = await obtenerBloques(conn, docenteId);
    const afectadas = await citacionesFueraDeLosTramos(conn, docenteId, actuales, tramos);
    if (afectadas.length > 0 && !confirmado(req.body?.confirmar)) {
      await conn.rollback();
      return res.status(409).json({
        mensaje: 'Hay citaciones agendadas a futuro que quedarían fuera del horario de atención. '
          + 'Confirma para continuar; las citaciones se mantienen y puedes reprogramarlas desde Citaciones.',
        requiereConfirmacion: true,
        citaciones: afectadas,
      });
    }

    await conn.query('DELETE FROM horario_atencion WHERE Docente_Usuario_Id = ?', [docenteId]);
    if (tramos.length > 0) {
      await conn.query(
        `INSERT INTO horario_atencion
           (Horario_Atencion_Dia_Semana, Horario_Atencion_Hora_Inicio, Horario_Atencion_Hora_Fin, Docente_Usuario_Id)
         VALUES ?`,
        [tramos.map((t) => [t.dia, aHora(t.inicio), aHora(t.fin), docenteId])]
      );
    }
    await conn.commit();
    return res.json({
      mensaje: tramos.length > 0
        ? 'Horario de atención guardado. Los apoderados ya pueden solicitar citaciones en estos tramos.'
        : 'Se quitó tu horario de atención: los apoderados no podrán solicitar citaciones contigo.',
      bloques: await obtenerBloques(pool, docenteId),
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('guardarSemanaAtencion:', error);
    return res.status(500).json({ mensaje: 'No fue posible guardar tu horario de atención' });
  } finally {
    if (conn) conn.release();
  }
};

module.exports = {
  getSemanaAtencion,
  guardarSemanaAtencion,
  alcanzaParaCitacion,
  getMiHorarioAtencion,
  crearBloqueAtencion,
  actualizarBloqueAtencion,
  eliminarBloqueAtencion,
  // Compartidos con la solicitud de citación del apoderado (CU89) y con las pruebas
  obtenerBloques,
  validarBloque,
};
