// Solicitud de citación por parte del apoderado (RF56 / CU89).
//
// El apoderado (titular o suplente del estudiante) elige a un docente que imparte clases al
// estudiante y un tramo libre dentro del horario de atención del docente (RF55). La solicitud
// queda "Pendiente de confirmación" hasta que el docente la acepta (CU75).
const pool = require('../config/db');
const { claseVigente } = require('../utils/clasesEliminadas');
const { enPeriodoVigente } = require('../utils/periodos');
const {
  aMinutos,
  parsearTramo,
  diaSemanaDeFecha,
  seSuperponen,
  buscarClaseEnTramo,
} = require('../utils/disponibilidadDocente');
const { obtenerBloques } = require('./horarioAtencionController');
const { condicionApoderadoAsociado, rolApoderadoSQL } = require('../utils/apoderadosEstudiante');
const {
  ESTADO_PENDIENTE,
  ESTADO_CANCELADA,
  MODALIDADES,
  TRAMOS_HORARIOS,
  validarFechaTramo,
  validarMotivo,
  hayConflictoHorario,
  buscarCitacionDelUsuario,
  mensajeChoqueClase,
} = require('./citacionController');

// Ventana de búsqueda de bloques disponibles (CU89 Excepción 2: "próximas semanas")
const SEMANAS_DISPONIBILIDAD = 4;

const esApoderado = (user) => (user?.roles || []).includes('Apoderado');
const SOLO_APODERADO = { mensaje: 'Solo un apoderado puede solicitar citaciones' };

const pad = (n) => String(n).padStart(2, '0');
const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Fecha y minuto actual del servidor, para descartar tramos de hoy que ya comenzaron. */
function ahora() {
  const d = new Date();
  return { fecha: aISO(d), minuto: d.getHours() * 60 + d.getMinutes() };
}

/** Tramos de 30 minutos completamente contenidos en un bloque de atención. */
function tramosDelBloque(bloque) {
  const inicio = aMinutos(bloque.Horario_Atencion_Hora_Inicio);
  const fin = aMinutos(bloque.Horario_Atencion_Hora_Fin);
  return TRAMOS_HORARIOS.filter((t) => {
    const tramo = parsearTramo(t);
    return tramo.inicio >= inicio && tramo.fin <= fin;
  });
}

/**
 * Estudiante asociado al apoderado como titular (estudiante.Apoderado_Usuario_Id) o como
 * suplente (apoderado_suplente). Devuelve null si no existe o no está asociado.
 */
async function buscarEstudianteAsociado(conn, apoderadoId, estudianteId) {
  const id = Number(estudianteId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [filas] = await conn.query(
    `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Curso_Id, c.Curso_Nombre,
            ${rolApoderadoSQL('e')} AS Rol_Apoderado
       FROM estudiante e
       LEFT JOIN curso c ON c.Curso_Id = e.Curso_Id
      WHERE e.Estudiante_Id = ?
        AND e.Estudiante_Fecha_Eliminacion IS NULL
        AND ${condicionApoderadoAsociado('e')}`,
    [apoderadoId, id, apoderadoId, apoderadoId]
  );
  return filas[0] || null;
}

/** El docente está activo e imparte al menos una clase vigente en el curso del estudiante. */
async function docenteImparteEnCurso(conn, docenteId, cursoId) {
  const id = Number(docenteId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const [filas] = await conn.query(
    `SELECT 1
       FROM horario_asignatura ha
       JOIN usuario u ON u.Usuario_Id = ha.Usuario_Id
      WHERE ha.Usuario_Id = ? AND ha.Curso_Id = ? AND ${claseVigente('ha')}
        AND u.Es_Docente = 1 AND u.Usuario_Estado_Cuenta = 1
      LIMIT 1`,
    [id, cursoId]
  );
  return filas.length > 0;
}

/**
 * Valida estudiante y docente de una solicitud. Devuelve { estudiante } o { error: {status, body} }.
 */
async function validarEstudianteYDocente(conn, apoderadoId, estudianteId, docenteId) {
  // La solicitud siempre la acepta otro: un apoderado que además es docente del
  // estudiante no puede citarse a sí mismo (sería él quien la confirmara)
  if (Number(docenteId) === Number(apoderadoId)) {
    return { error: { status: 400, body: { mensaje: 'No puedes solicitarte una citación a ti mismo' } } };
  }
  const estudiante = await buscarEstudianteAsociado(conn, apoderadoId, estudianteId);
  if (!estudiante) {
    return { error: { status: 404, body: { mensaje: 'El estudiante no existe o no está asociado a tu cuenta' } } };
  }
  if (!(await docenteImparteEnCurso(conn, docenteId, estudiante.Curso_Id))) {
    return {
      error: { status: 400, body: { mensaje: 'El docente seleccionado no imparte clases al estudiante' } },
    };
  }
  return { estudiante };
}

// ── CU89 paso 2: estudiantes asociados al apoderado (titular o suplente) ──
const getEstudiantesSolicitud = async (req, res) => {
  if (!esApoderado(req.user)) return res.status(403).json(SOLO_APODERADO);
  const apoderadoId = req.user.id;
  try {
    const [filas] = await pool.query(
      `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Curso_Id, c.Curso_Nombre,
              ${rolApoderadoSQL('e')} AS Rol_Apoderado
         FROM estudiante e
         LEFT JOIN curso c ON c.Curso_Id = e.Curso_Id
        WHERE e.Estudiante_Fecha_Eliminacion IS NULL
          AND ${condicionApoderadoAsociado('e')}
        ORDER BY e.Estudiante_Nombre_Completo`,
      [apoderadoId, apoderadoId, apoderadoId]
    );
    if (filas.length === 0) {
      return res.status(200).json({ mensaje: 'No tienes estudiantes asociados', estudiantes: [] });
    }
    return res.json(filas);
  } catch (error) {
    console.error('getEstudiantesSolicitud:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar tus estudiantes' });
  }
};

// ── CU89 paso 2: docentes que imparten clases al estudiante ──
const getDocentesSolicitud = async (req, res) => {
  if (!esApoderado(req.user)) return res.status(403).json(SOLO_APODERADO);
  try {
    const estudiante = await buscarEstudianteAsociado(pool, req.user.id, req.params.estudianteId);
    if (!estudiante) {
      return res.status(404).json({ mensaje: 'El estudiante no existe o no está asociado a tu cuenta' });
    }
    const [docentes] = await pool.query(
      `SELECT u.Usuario_Id, u.Usuario_Nombre_Completo,
              GROUP_CONCAT(DISTINCT a.Asignatura_Nombre ORDER BY a.Asignatura_Nombre SEPARATOR ', ') AS Asignaturas,
              EXISTS (SELECT 1 FROM horario_atencion hat WHERE hat.Docente_Usuario_Id = u.Usuario_Id)
                AS Tiene_Horario_Atencion
         FROM horario_asignatura ha
         JOIN usuario u    ON u.Usuario_Id = ha.Usuario_Id
         JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
        WHERE ha.Curso_Id = ? AND ${claseVigente('ha')}
          AND u.Es_Docente = 1 AND u.Usuario_Estado_Cuenta = 1
          AND u.Usuario_Id <> ?  -- no se ofrece a sí mismo (apoderado que también es docente)
        GROUP BY u.Usuario_Id, u.Usuario_Nombre_Completo
        ORDER BY u.Usuario_Nombre_Completo`,
      [estudiante.Curso_Id, req.user.id]
    );
    const lista = docentes.map((d) => ({ ...d, Tiene_Horario_Atencion: Boolean(Number(d.Tiene_Horario_Atencion)) }));
    if (lista.length === 0) {
      return res.status(200).json({ mensaje: 'El curso del estudiante aún no tiene docentes asignados', docentes: [] });
    }
    return res.json(lista);
  } catch (error) {
    console.error('getDocentesSolicitud:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar los docentes del estudiante' });
  }
};

/**
 * Tramos libres del docente en las próximas semanas, dentro de su horario de atención:
 * se descartan los que chocan con sus clases y los ocupados por citaciones activas del
 * docente o del apoderado. Devuelve [{ fecha, dia, tramos: [...] }] solo con días que tienen tramos.
 */
async function calcularDisponibilidad(conn, { docenteId, apoderadoId, bloques, desde = ahora() }) {
  const [inicioY, inicioM, inicioD] = desde.fecha.split('-').map(Number);
  const fechas = [];
  for (let i = 0; i < SEMANAS_DISPONIBILIDAD * 7; i++) {
    const d = new Date(inicioY, inicioM - 1, inicioD + i);
    fechas.push(aISO(d));
  }

  const [clases] = await conn.query(
    `SELECT ha.Horario_Asignatura_Dia_Semana AS dia,
            bh.Bloque_Horario_Hora_Inicio AS horaInicio, bh.Bloque_Horario_Hora_Fin AS horaFin
       FROM horario_asignatura ha
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      WHERE ha.Usuario_Id = ? AND ${claseVigente('ha')} AND ${enPeriodoVigente('ha')}`,
    [docenteId]
  );
  const [ocupadas] = await conn.query(
    `SELECT DATE_FORMAT(Citacion_Fecha, '%Y-%m-%d') AS fecha, Citacion_Tramo_Horario AS tramo
       FROM citacion
      WHERE Citacion_Fecha BETWEEN ? AND ?
        AND Citacion_Estado <> ?
        AND (Docente_Usuario_Id = ? OR Apoderado_Usuario_Id = ?)`,
    [fechas[0], fechas[fechas.length - 1], ESTADO_CANCELADA, docenteId, apoderadoId]
  );
  const tramosOcupados = new Set(ocupadas.map((c) => `${c.fecha}|${c.tramo}`));

  const dias = [];
  for (const fecha of fechas) {
    const dia = diaSemanaDeFecha(fecha);
    if (!dia) continue;
    const clasesDelDia = clases
      .filter((c) => c.dia === dia)
      .map((c) => ({ inicio: aMinutos(c.horaInicio), fin: aMinutos(c.horaFin) }));

    const tramos = bloques
      .filter((b) => b.Horario_Atencion_Dia_Semana === dia)
      .flatMap(tramosDelBloque)
      .filter((t) => {
        const tramo = parsearTramo(t);
        if (fecha === desde.fecha && tramo.inicio <= desde.minuto) return false;
        if (clasesDelDia.some((c) => seSuperponen(c, tramo))) return false;
        return !tramosOcupados.has(`${fecha}|${t}`);
      });

    if (tramos.length > 0) dias.push({ fecha, dia, tramos: [...new Set(tramos)] });
  }
  return dias;
}

// ── CU89 pasos 3–4: bloques disponibles del horario de atención del docente ──
const getDisponibilidadSolicitud = async (req, res) => {
  if (!esApoderado(req.user)) return res.status(403).json(SOLO_APODERADO);
  const { estudianteId, docenteId } = req.query;
  try {
    const { error } = await validarEstudianteYDocente(pool, req.user.id, estudianteId, docenteId);
    if (error) return res.status(error.status).json(error.body);

    const bloques = await obtenerBloques(pool, Number(docenteId));
    // CU89 Excepción 1: el docente no tiene horario de atención registrado
    if (bloques.length === 0) {
      return res.status(200).json({
        mensaje: 'El docente aún no registra horario de atención de apoderados',
        sinHorarioAtencion: true,
        bloques: [],
        dias: [],
      });
    }

    const dias = await calcularDisponibilidad(pool, {
      docenteId: Number(docenteId),
      apoderadoId: req.user.id,
      bloques,
    });
    // CU89 Excepción 2: no hay bloques disponibles en las próximas semanas
    if (dias.length === 0) {
      return res.status(200).json({
        mensaje: `El docente no tiene bloques disponibles en las próximas ${SEMANAS_DISPONIBILIDAD} semanas`,
        bloques,
        dias: [],
      });
    }
    return res.json({ semanas: SEMANAS_DISPONIBILIDAD, bloques, dias });
  } catch (error) {
    console.error('getDisponibilidadSolicitud:', error);
    return res.status(500).json({ mensaje: 'No fue posible consultar la disponibilidad del docente' });
  }
};

// ── CU89 pasos 5–6: registrar la solicitud como pendiente de confirmación del docente ──
const solicitarCitacion = async (req, res) => {
  if (!esApoderado(req.user)) return res.status(403).json(SOLO_APODERADO);

  const {
    Estudiante_Id,
    Docente_Usuario_Id,
    Citacion_Fecha,
    Citacion_Tramo_Horario,
    Citacion_Motivo,
    Citacion_Modalidad,
  } = req.body || {};

  // CU89 Excepción 3: datos incompletos o inválidos
  const errores = validarFechaTramo(Citacion_Fecha, Citacion_Tramo_Horario);
  const estudianteId = Number(Estudiante_Id);
  const docenteId = Number(Docente_Usuario_Id);
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) errores.estudianteId = 'Selecciona el estudiante';
  if (!Number.isInteger(docenteId) || docenteId <= 0) errores.docenteId = 'Selecciona el docente';
  const errorMotivo = validarMotivo(Citacion_Motivo);
  if (errorMotivo) errores.motivo = errorMotivo;
  if (!Citacion_Modalidad) errores.modalidad = 'La modalidad es obligatoria';
  else if (!MODALIDADES.includes(Citacion_Modalidad)) errores.modalidad = 'Modalidad inválida';
  if (!errores.fecha && !errores.tramo) {
    const { fecha, minuto } = ahora();
    if (Citacion_Fecha === fecha && parsearTramo(Citacion_Tramo_Horario).inicio <= minuto) {
      errores.tramo = 'El tramo seleccionado ya comenzó';
    }
  }
  if (Object.keys(errores).length > 0) {
    return res.status(400).json({ mensaje: 'Datos incompletos o inválidos en el formulario', errores });
  }

  const apoderadoId = req.user.id;
  try {
    const { error } = await validarEstudianteYDocente(pool, apoderadoId, estudianteId, docenteId);
    if (error) return res.status(error.status).json(error.body);

    // Solo se pueden solicitar tramos dentro del horario de atención del docente
    const dia = diaSemanaDeFecha(Citacion_Fecha);
    const bloques = await obtenerBloques(pool, docenteId);
    if (bloques.length === 0) {
      return res.status(409).json({ mensaje: 'El docente aún no registra horario de atención de apoderados' });
    }
    const dentroDeAtencion = bloques
      .filter((b) => b.Horario_Atencion_Dia_Semana === dia)
      .some((b) => tramosDelBloque(b).includes(Citacion_Tramo_Horario));
    if (!dentroDeAtencion) {
      return res.status(409).json({ mensaje: 'El tramo seleccionado no está dentro del horario de atención del docente' });
    }

    // C-11: aunque esté en su horario de atención, no puede coincidir con una clase del docente
    const clase = await buscarClaseEnTramo(pool, { docenteId, fecha: Citacion_Fecha, tramo: Citacion_Tramo_Horario });
    if (clase) return res.status(409).json({ mensaje: mensajeChoqueClase(clase), clase });

    const conflicto = await hayConflictoHorario(pool, {
      fecha: Citacion_Fecha,
      tramo: Citacion_Tramo_Horario,
      docenteId,
      apoderadoId,
    });
    if (conflicto) {
      return res.status(409).json({ mensaje: 'El tramo seleccionado ya no está disponible. Elige otro.' });
    }

    const [resultado] = await pool.query(
      `INSERT INTO citacion (
         Citacion_Tramo_Horario, Citacion_Fecha, Citacion_Motivo, Citacion_Estado, Citacion_Modalidad,
         Estudiante_Id, Apoderado_Usuario_Id, Docente_Usuario_Id, Citacion_Solicitante_Rol
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Apoderado')`,
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
    return res.status(201).json({
      mensaje: 'Solicitud de citación enviada. Queda pendiente hasta que el docente la confirme.',
      citacion,
    });
  } catch (error) {
    console.error('solicitarCitacion:', error);
    return res.status(500).json({ mensaje: 'No fue posible registrar la solicitud. Intente nuevamente.' });
  }
};

module.exports = {
  getEstudiantesSolicitud,
  getDocentesSolicitud,
  getDisponibilidadSolicitud,
  solicitarCitacion,
  // Exportados para las pruebas unitarias
  SEMANAS_DISPONIBILIDAD,
  tramosDelBloque,
  calcularDisponibilidad,
};
