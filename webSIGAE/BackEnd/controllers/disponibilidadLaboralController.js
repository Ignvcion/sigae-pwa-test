// controllers/disponibilidadLaboralController.js
// CU107: disponibilidad laboral semanal del docente (RF04, RF35). Solo el administrador
// la consulta y la edita, al registrar un docente o al editar su perfil:
//   GET  /api/usuarios/disponibilidad/opciones        días, bloques de clase y períodos (formulario de registro)
//   GET  /api/usuarios/:id/disponibilidad?periodo=     disponibilidad guardada de un docente
//   POST /api/usuarios y PUT /api/usuarios/:id         la reciben en `Docente_Disponibilidad`
//        { periodo?: '2026', bloques: [{ dia: 'Lunes', Bloque_Horario_Id: 1 }, ...] }
//        (bloques vacío = sin restricción). Ver guardarDisponibilidadDocente.
// Las reglas están en utils/disponibilidadLaboral.js.
const pool = require('../config/db');
const { obtenerPeriodos } = require('../utils/periodos');
const { condicionDesajustado } = require('../utils/bloquesDesajustados');
const { registrarHistorial } = require('../utils/historial');
const {
  DIAS_SEMANA, claveBloque, resumenSemanal, advertenciaHorasAdeudadas,
} = require('../utils/disponibilidadLaboral');

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const hhmm = (t) => String(t ?? '').slice(0, 5);
const describir = (r) => (r.configurada
  ? `${r.bloquesDisponibles} bloque(s) semanales, ${r.horasDisponibles} h`
  : null);

async function obtenerDocente(db, id) {
  const [filas] = await db.query(
    `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Carga_Horaria_Maxima, Es_Docente
       FROM usuario WHERE Usuario_Id = ?`,
    [id]
  );
  const d = Array.isArray(filas) ? filas[0] : null;
  return d && d.Es_Docente ? d : null;
}

/** Bloques de clase vigentes (los que se pueden marcar como disponibles). */
async function bloquesDeClase(db) {
  const [filas] = await db.query(
    `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin,
            bh.Bloque_Horario_Jornada,
            TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600 AS duracion
       FROM bloque_horario bh
      WHERE bh.Bloque_Horario_Tipo = 'Clase' AND NOT ${condicionDesajustado('bh')}
      ORDER BY bh.Bloque_Horario_Hora_Inicio`
  );
  return filas.map((b) => ({ ...b, duracion: Math.round(Number(b.duracion) * 100) / 100 }));
}

/** Clases activas del docente en el período. */
async function clasesDelDocente(db, docenteId, periodo) {
  const [filas] = await db.query(
    `SELECT ha.Horario_Asignatura_Id, ha.Horario_Asignatura_Dia_Semana AS dia, ha.Bloque_Horario_Id,
            bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin,
            c.Curso_Nombre AS curso, a.Asignatura_Nombre AS asignatura
       FROM horario_asignatura ha
       JOIN curso c           ON c.Curso_Id = ha.Curso_Id
       JOIN asignatura a      ON a.Asignatura_Id = ha.Asignatura_Id
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo' AND c.Curso_Periodo_Lectivo = ?
      ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana, ?), bh.Bloque_Horario_Hora_Inicio`,
    [docenteId, periodo, DIAS_SEMANA]
  );
  return filas;
}

/** Período pedido: vigente por defecto; solo se aceptan el vigente y, con el cierre iniciado, el siguiente. */
async function resolverPeriodo(db, pedido) {
  const periodos = await obtenerPeriodos(db);
  const periodo = pedido ? String(pedido) : periodos.vigente;
  const valido = periodo === periodos.vigente || (periodos.siguiente && periodo === periodos.siguiente);
  return { periodos, periodo, valido };
}

const clasesFuera = (clases, seleccion) => (seleccion.size === 0
  ? []
  : clases.filter((c) => !seleccion.has(claveBloque(c.dia, c.Bloque_Horario_Id))));

const formatoClase = (c) => ({
  Horario_Asignatura_Id: c.Horario_Asignatura_Id,
  dia: c.dia,
  Bloque_Horario_Id: c.Bloque_Horario_Id,
  hora_inicio: hhmm(c.Bloque_Horario_Hora_Inicio),
  hora_fin: hhmm(c.Bloque_Horario_Hora_Fin),
  curso: c.curso,
  asignatura: c.asignatura,
});

const formatoBloque = (b) => ({
  Bloque_Horario_Id: b.Bloque_Horario_Id,
  hora_inicio: hhmm(b.Bloque_Horario_Hora_Inicio),
  hora_fin: hhmm(b.Bloque_Horario_Hora_Fin),
  jornada: b.Bloque_Horario_Jornada,
  duracion: b.duracion,
});

// GET /api/usuarios/:id/disponibilidad
const getDisponibilidad = async (req, res) => {
  const { id } = req.params;
  if (!idValido(id)) return res.status(400).json({ mensaje: 'Docente no válido' });
  try {
    const docente = await obtenerDocente(pool, id);
    if (!docente) return res.status(404).json({ mensaje: 'Docente no encontrado' });
    const { periodos, periodo, valido } = await resolverPeriodo(pool, req.query.periodo);
    if (!valido) return res.status(400).json({ mensaje: `El período ${periodo} no está disponible` });

    const [filas] = await pool.query(
      `SELECT Disponibilidad_Docente_Dia_Semana AS dia, Bloque_Horario_Id
         FROM disponibilidad_docente
        WHERE Docente_Usuario_Id = ? AND Disponibilidad_Docente_Periodo_Lectivo = ?
        ORDER BY FIELD(Disponibilidad_Docente_Dia_Semana, ?), Bloque_Horario_Id`,
      [id, periodo, DIAS_SEMANA]
    );
    const bloques = await bloquesDeClase(pool);
    const vigentes = new Set(bloques.map((b) => Number(b.Bloque_Horario_Id)));
    const seleccion = filas
      .filter((f) => vigentes.has(Number(f.Bloque_Horario_Id)))
      .map((f) => ({ dia: f.dia, Bloque_Horario_Id: Number(f.Bloque_Horario_Id) }));
    const clases = await clasesDelDocente(pool, id, periodo);
    const setSeleccion = new Set(seleccion.map((s) => claveBloque(s.dia, s.Bloque_Horario_Id)));
    const resumen = await resumenSemanal(pool, id, periodo);

    return res.json({
      docente: {
        Usuario_Id: docente.Usuario_Id,
        Usuario_Nombre_Completo: docente.Usuario_Nombre_Completo,
        Docente_Carga_Horaria_Maxima: docente.Docente_Carga_Horaria_Maxima,
      },
      periodo,
      periodos: { vigente: periodos.vigente, siguiente: periodos.siguiente },
      dias: DIAS_SEMANA,
      bloques: bloques.map(formatoBloque),
      seleccion,
      clases: clases.map(formatoClase),
      clasesFueraDeDisponibilidad: clasesFuera(clases, setSeleccion).map(formatoClase),
      resumen,
      advertencia: advertenciaHorasAdeudadas(resumen, docente.Usuario_Nombre_Completo),
    });
  } catch (error) {
    console.error('getDisponibilidad:', error);
    return res.status(500).json({ mensaje: 'No fue posible obtener la disponibilidad del docente' });
  }
};

/**
 * Valida el campo `Docente_Disponibilidad` de una solicitud.
 * @returns {{ ok: true, periodo?: string, bloques: {dia, bloqueId}[] } | { ok: false, mensaje: string }}
 */
function leerDisponibilidad(valor) {
  const bloques = Array.isArray(valor) ? valor : valor?.bloques;
  if (!Array.isArray(bloques)) {
    return { ok: false, mensaje: 'La disponibilidad laboral debe indicar sus bloques como una lista (vacía para quitar la restricción)' };
  }
  const seleccion = new Map();
  for (const b of bloques) {
    const dia = b?.dia;
    const bloqueId = Number(b?.Bloque_Horario_Id);
    if (!DIAS_SEMANA.includes(dia) || !idValido(bloqueId)) {
      return { ok: false, mensaje: 'Cada bloque disponible debe indicar un día hábil (lunes a viernes) y un bloque horario válido' };
    }
    seleccion.set(claveBloque(dia, bloqueId), { dia, bloqueId });
  }
  return { ok: true, periodo: Array.isArray(valor) ? undefined : valor?.periodo, bloques: [...seleccion.values()] };
}

class ErrorDisponibilidad extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * Reemplaza la disponibilidad del docente en un período y lo registra en el
 * historial. Usar dentro de la transacción del registro o la edición del docente.
 * Lanza ErrorDisponibilidad (con `status`) si el período o algún bloque no es válido.
 * @param {{ periodo?: string, bloques: {dia, bloqueId}[] }} disponibilidad salida de leerDisponibilidad
 */
async function guardarDisponibilidadDocente(conn, { docenteId, disponibilidad, responsableId }) {
  const { periodo, valido } = await resolverPeriodo(conn, disponibilidad.periodo);
  if (!valido) throw new ErrorDisponibilidad(400, `El período ${periodo} no está disponible para la disponibilidad laboral`);

  const vigentes = new Set((await bloquesDeClase(conn)).map((b) => Number(b.Bloque_Horario_Id)));
  if (disponibilidad.bloques.some((b) => !vigentes.has(b.bloqueId))) {
    throw new ErrorDisponibilidad(422, 'Solo se pueden marcar bloques de clase vigentes (no recreos ni bloques reemplazados)');
  }

  const antes = await resumenSemanal(conn, docenteId, periodo);
  const [filasAntes] = await conn.query(
    `SELECT Disponibilidad_Docente_Dia_Semana AS dia, Bloque_Horario_Id
       FROM disponibilidad_docente WHERE Docente_Usuario_Id = ? AND Disponibilidad_Docente_Periodo_Lectivo = ?`,
    [docenteId, periodo]
  );
  const clavesAntes = (Array.isArray(filasAntes) ? filasAntes : []).map((f) => claveBloque(f.dia, f.Bloque_Horario_Id)).sort();
  const clavesDespues = disponibilidad.bloques.map((b) => claveBloque(b.dia, b.bloqueId)).sort();
  await conn.query(
    'DELETE FROM disponibilidad_docente WHERE Docente_Usuario_Id = ? AND Disponibilidad_Docente_Periodo_Lectivo = ?',
    [docenteId, periodo]
  );
  if (disponibilidad.bloques.length > 0) {
    await conn.query(
      `INSERT INTO disponibilidad_docente
         (Disponibilidad_Docente_Periodo_Lectivo, Disponibilidad_Docente_Dia_Semana, Bloque_Horario_Id, Docente_Usuario_Id)
       VALUES ?`,
      [disponibilidad.bloques.map((b) => [periodo, b.dia, b.bloqueId, Number(docenteId)])]
    );
  }
  const despues = await resumenSemanal(conn, docenteId, periodo);
  if (clavesAntes.join(',') !== clavesDespues.join(',')) {
    await registrarHistorial(conn, {
      atributo: 'Disponibilidad_Laboral',
      anterior: describir(antes) ?? 'Sin restricción',
      nuevo: describir(despues) ?? 'Sin restricción',
      descripcion: `CU107: disponibilidad laboral semanal de ${periodo}`,
      usuarioId: Number(docenteId),
      responsableId,
    });
  }

  // CU107: las clases ya asignadas en bloques que quedan no disponibles se mantienen, con advertencia
  const clases = await clasesDelDocente(conn, docenteId, periodo);
  const seleccion = new Set(disponibilidad.bloques.map((b) => claveBloque(b.dia, b.bloqueId)));
  return {
    periodo,
    resumen: despues,
    advertencia: advertenciaHorasAdeudadas(despues),
    clasesFueraDeDisponibilidad: clasesFuera(clases, seleccion).map(formatoClase),
  };
}

// GET /api/usuarios/disponibilidad/opciones
const getOpcionesDisponibilidad = async (req, res) => {
  try {
    const periodos = await obtenerPeriodos(pool);
    const bloques = await bloquesDeClase(pool);
    return res.json({
      periodos: { vigente: periodos.vigente, siguiente: periodos.siguiente },
      dias: DIAS_SEMANA,
      bloques: bloques.map(formatoBloque),
    });
  } catch (error) {
    console.error('getOpcionesDisponibilidad:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar los bloques horarios' });
  }
};

module.exports = {
  getDisponibilidad,
  getOpcionesDisponibilidad,
  leerDisponibilidad,
  guardarDisponibilidadDocente,
  ErrorDisponibilidad,
};
