// Horario de atención de apoderados del docente (RF55 / CU87, CU88).
//
// Cada bloque es un día de la semana con hora de inicio y término, independiente del horario
// de clases. Los bloques se definen en tramos de 30 minutos entre 08:00 y 18:00, igual que las
// citaciones, para que el apoderado pueda solicitar exactamente esos tramos (RF56 / CU89).
const pool = require('../config/db');
const {
  DIAS_SEMANA,
  aMinutos,
  minutosAHora,
  hhmm,
  parsearTramo,
  diaSemanaDeFecha,
  seSuperponen,
  buscarChoquesConClases,
  describirClase,
} = require('../utils/disponibilidadDocente');

const INICIO_ATENCION = 8 * 60;   // 08:00
const FIN_ATENCION = 18 * 60;     // 18:00
const PASO_MINUTOS = 30;

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
    } else if (inicio % PASO_MINUTOS !== 0 || fin % PASO_MINUTOS !== 0) {
      errores.horaInicio = 'Las horas deben ser en punto o y media (tramos de 30 minutos)';
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
  return null;
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

module.exports = {
  getMiHorarioAtencion,
  crearBloqueAtencion,
  actualizarBloqueAtencion,
  eliminarBloqueAtencion,
  // Compartidos con la solicitud de citación del apoderado (CU89) y con las pruebas
  obtenerBloques,
  validarBloque,
};
