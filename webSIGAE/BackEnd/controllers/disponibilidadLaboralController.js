// controllers/disponibilidadLaboralController.js
// CU107: disponibilidad laboral semanal del docente (RF04, RF35), en tramos horarios
// "desde–hasta" por día. Solo el administrador la edita, al registrar un docente o al
// editar su perfil; el docente puede verla en su propio perfil.
//   GET  /api/usuarios/disponibilidad/opciones        días, jornada y bloques (formulario de registro)
//   GET  /api/usuarios/:id/disponibilidad?periodo=     administrador o el propio docente
//   POST /api/usuarios y PUT /api/usuarios/:id         la reciben en `Docente_Disponibilidad`
//        { periodo?: '2026', tramos: [{ dia: 'Lunes', hora_inicio: '08:00', hora_fin: '13:00' }, ...] }
//        (tramos vacío = sin restricción). Ver guardarDisponibilidadDocente.
// Las reglas están en utils/disponibilidadLaboral.js.
const pool = require('../config/db');
const { puedeGestionAcademica } = require('../utils/permisos');
const { obtenerPeriodos } = require('../utils/periodos');
const { condicionDesajustado } = require('../utils/bloquesDesajustados');
const { registrarHistorial } = require('../utils/historial');
const { opcionesAtencion } = require('../utils/horarioAtencion');
const {
  DIAS_SEMANA, HORA_MINIMA, HORA_MAXIMA, aMinutos, aHora, unirTramos, cabeEnTramos,
  normalizarTramos, resumenSemanal, advertenciaHorasAdeudadas,
} = require('../utils/disponibilidadLaboral');

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const hhmm = (t) => String(t ?? '').slice(0, 5);
const describir = (r) => (r.configurada ? `${r.tramos} tramo(s) semanales, ${r.horasDisponibles} h` : null);
const claveTramo = (t) => `${t.dia}|${t.inicio}|${t.fin}`;

async function obtenerDocente(db, id) {
  const [filas] = await db.query(
    `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Carga_Horaria_Semanal, Es_Docente
       FROM usuario WHERE Usuario_Id = ?`,
    [id]
  );
  const d = Array.isArray(filas) ? filas[0] : null;
  return d && d.Es_Docente ? d : null;
}

/** Bloques vigentes de la jornada (clases y recreos), para la vista por bloques. */
async function bloquesDeJornada(db) {
  const [filas] = await db.query(
    `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin,
            bh.Bloque_Horario_Jornada, bh.Bloque_Horario_Tipo
       FROM bloque_horario bh
      WHERE NOT ${condicionDesajustado('bh')}
      ORDER BY bh.Bloque_Horario_Hora_Inicio`
  );
  return filas.map((b) => ({
    Bloque_Horario_Id: b.Bloque_Horario_Id,
    hora_inicio: hhmm(b.Bloque_Horario_Hora_Inicio),
    hora_fin: hhmm(b.Bloque_Horario_Hora_Fin),
    jornada: b.Bloque_Horario_Jornada,
    tipo: b.Bloque_Horario_Tipo,
  }));
}

/** Inicio y fin de la jornada institucional (sugerencia al agregar un tramo). */
async function jornadaInstitucional(db) {
  const [filas] = await db.query(
    `SELECT Parametro_Institucional_Inicio_Jornada AS inicio, Parametro_Institucional_Fin_Jornada AS fin
       FROM parametro_institucional LIMIT 1`
  );
  const p = Array.isArray(filas) ? filas[0] : null;
  return p ? { inicio: hhmm(p.inicio), fin: hhmm(p.fin) } : { inicio: '08:00', fin: '17:00' };
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
  return filas.map((c) => ({
    Horario_Asignatura_Id: c.Horario_Asignatura_Id,
    dia: c.dia,
    Bloque_Horario_Id: c.Bloque_Horario_Id,
    hora_inicio: hhmm(c.Bloque_Horario_Hora_Inicio),
    hora_fin: hhmm(c.Bloque_Horario_Hora_Fin),
    curso: c.curso,
    asignatura: c.asignatura,
  }));
}

/** Tramos guardados del docente en el período, ordenados por día y hora. */
async function tramosGuardados(db, docenteId, periodo) {
  const [filas] = await db.query(
    `SELECT Disponibilidad_Docente_Dia_Semana AS dia,
            Disponibilidad_Docente_Hora_Inicio AS hora_inicio, Disponibilidad_Docente_Hora_Fin AS hora_fin
       FROM disponibilidad_docente
      WHERE Docente_Usuario_Id = ? AND Disponibilidad_Docente_Periodo_Lectivo = ?
      ORDER BY FIELD(Disponibilidad_Docente_Dia_Semana, ?), Disponibilidad_Docente_Hora_Inicio`,
    [docenteId, periodo, DIAS_SEMANA]
  );
  return (Array.isArray(filas) ? filas : []).map((f) => ({
    dia: f.dia, inicio: aMinutos(f.hora_inicio), fin: aMinutos(f.hora_fin),
  }));
}

/** Horario de atención de apoderados del docente (RF55), como tramos en minutos. */
async function tramosDeAtencion(db, docenteId) {
  const [filas] = await db.query(
    `SELECT Horario_Atencion_Dia_Semana AS dia, Horario_Atencion_Hora_Inicio AS hora_inicio,
            Horario_Atencion_Hora_Fin AS hora_fin
       FROM horario_atencion WHERE Docente_Usuario_Id = ?
      ORDER BY FIELD(Horario_Atencion_Dia_Semana, ?), Horario_Atencion_Hora_Inicio`,
    [docenteId, DIAS_SEMANA]
  );
  return (Array.isArray(filas) ? filas : []).map((f) => ({
    dia: f.dia, inicio: aMinutos(f.hora_inicio), fin: aMinutos(f.hora_fin),
  }));
}

/** Tramos de atención que no caben en la disponibilidad (con tramos registrados). */
function atencionFuera(atencion, tramos) {
  if (tramos.length === 0) return [];
  const porDia = new Map(DIAS_SEMANA.map((d) => [d, unirTramos(tramos.filter((t) => t.dia === d))]));
  return atencion.filter((a) => !cabeEnTramos(porDia.get(a.dia) || [], a.inicio, a.fin)).map((a) => ({
    dia: a.dia, hora_inicio: aHora(a.inicio), hora_fin: aHora(a.fin),
  }));
}

/** Clases que no caben completas en los tramos de su día (con tramos registrados). */
function clasesFuera(clases, tramos) {
  if (tramos.length === 0) return [];
  const porDia = new Map(DIAS_SEMANA.map((d) => [d, unirTramos(tramos.filter((t) => t.dia === d))]));
  return clases.filter((c) => !cabeEnTramos(porDia.get(c.dia) || [], aMinutos(c.hora_inicio), aMinutos(c.hora_fin)));
}

const formatoTramo = (t) => ({ dia: t.dia, hora_inicio: aHora(t.inicio), hora_fin: aHora(t.fin) });

/** Período pedido: vigente por defecto; solo se aceptan el vigente y, con el cierre iniciado, el siguiente. */
async function resolverPeriodo(db, pedido) {
  const periodos = await obtenerPeriodos(db);
  const periodo = pedido ? String(pedido) : periodos.vigente;
  const valido = periodo === periodos.vigente || (periodos.siguiente && periodo === periodos.siguiente);
  return { periodos, periodo, valido };
}

// GET /api/usuarios/:id/disponibilidad — administrador o el propio docente (solo lectura)
const getDisponibilidad = async (req, res) => {
  const { id } = req.params;
  if (!idValido(id)) return res.status(400).json({ mensaje: 'Docente no válido' });
  // Lectura: administración, etiqueta UTP (horarios por docente) o el propio docente
  const esAdmin = puedeGestionAcademica(req.user);
  if (!esAdmin && Number(req.user?.id) !== Number(id)) {
    return res.status(403).json({ mensaje: 'Solo puedes ver tu propia disponibilidad laboral' });
  }

  try {
    const docente = await obtenerDocente(pool, id);
    if (!docente) return res.status(404).json({ mensaje: 'Docente no encontrado' });
    const { periodos, periodo, valido } = await resolverPeriodo(pool, req.query.periodo);
    if (!valido) return res.status(400).json({ mensaje: `El período ${periodo} no está disponible` });

    const tramos = await tramosGuardados(pool, id, periodo);
    const clases = await clasesDelDocente(pool, id, periodo);
    const resumen = await resumenSemanal(pool, id, periodo);
    // RF55: el horario de atención es semanal (sin período); se muestra en el período vigente
    const atencion = periodo === periodos.vigente ? await tramosDeAtencion(pool, id) : [];

    return res.json({
      docente: {
        Usuario_Id: docente.Usuario_Id,
        Usuario_Nombre_Completo: docente.Usuario_Nombre_Completo,
        Docente_Carga_Horaria_Semanal: docente.Docente_Carga_Horaria_Semanal,
      },
      periodo,
      periodos: { vigente: periodos.vigente, siguiente: periodos.siguiente },
      dias: DIAS_SEMANA,
      jornada: await jornadaInstitucional(pool),
      limites: { minimo: aHora(HORA_MINIMA), maximo: aHora(HORA_MAXIMA) },
      bloques: await bloquesDeJornada(pool),
      tramos: tramos.map(formatoTramo),
      clases,
      clasesFueraDeDisponibilidad: clasesFuera(clases, tramos),
      atencion: atencion.map(formatoTramo),
      atencionFueraDeDisponibilidad: atencionFuera(atencion, tramos),
      resumen,
      advertencia: advertenciaHorasAdeudadas(resumen, docente.Usuario_Nombre_Completo),
      puedeEditar: esAdmin,
    });
  } catch (error) {
    console.error('getDisponibilidad:', error);
    return res.status(500).json({ mensaje: 'No fue posible obtener la disponibilidad del docente' });
  }
};

/**
 * Valida el campo `Docente_Disponibilidad` de una solicitud.
 * @returns {{ ok: true, periodo?: string, tramos: {dia, inicio, fin}[] } | { ok: false, mensaje: string }}
 */
function leerDisponibilidad(valor) {
  const lista = Array.isArray(valor) ? valor : valor?.tramos;
  const normalizados = normalizarTramos(lista);
  if (!normalizados.ok) return normalizados;
  return { ok: true, periodo: Array.isArray(valor) ? undefined : valor?.periodo, tramos: normalizados.tramos };
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
 * Lanza ErrorDisponibilidad (con `status`) si el período no es válido.
 * @param {{ periodo?: string, tramos: {dia, inicio, fin}[] }} disponibilidad salida de leerDisponibilidad
 */
async function guardarDisponibilidadDocente(conn, { docenteId, disponibilidad, responsableId }) {
  const { periodos, periodo, valido } = await resolverPeriodo(conn, disponibilidad.periodo);
  if (!valido) throw new ErrorDisponibilidad(400, `El período ${periodo} no está disponible para la disponibilidad laboral`);

  const antes = await resumenSemanal(conn, docenteId, periodo);
  const clavesAntes = (await tramosGuardados(conn, docenteId, periodo)).map(claveTramo).sort();
  const clavesDespues = disponibilidad.tramos.map(claveTramo).sort();

  await conn.query(
    'DELETE FROM disponibilidad_docente WHERE Docente_Usuario_Id = ? AND Disponibilidad_Docente_Periodo_Lectivo = ?',
    [docenteId, periodo]
  );
  if (disponibilidad.tramos.length > 0) {
    await conn.query(
      `INSERT INTO disponibilidad_docente
         (Disponibilidad_Docente_Periodo_Lectivo, Disponibilidad_Docente_Dia_Semana,
          Disponibilidad_Docente_Hora_Inicio, Disponibilidad_Docente_Hora_Fin, Docente_Usuario_Id)
       VALUES ?`,
      [disponibilidad.tramos.map((t) => [periodo, t.dia, aHora(t.inicio), aHora(t.fin), Number(docenteId)])]
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

  // CU107: las clases ya asignadas y los tramos de atención (RF55) que quedan fuera se
  // mantienen, con advertencia
  const clases = await clasesDelDocente(conn, docenteId, periodo);
  const atencion = periodo === periodos.vigente ? await tramosDeAtencion(conn, docenteId) : [];
  return {
    periodo,
    resumen: despues,
    advertencia: advertenciaHorasAdeudadas(despues),
    clasesFueraDeDisponibilidad: clasesFuera(clases, disponibilidad.tramos),
    atencionFueraDeDisponibilidad: atencionFuera(atencion, disponibilidad.tramos),
  };
}

// GET /api/usuarios/disponibilidad/opciones
const getOpcionesDisponibilidad = async (req, res) => {
  try {
    const periodos = await obtenerPeriodos(pool);
    return res.json({
      periodos: { vigente: periodos.vigente, siguiente: periodos.siguiente },
      dias: DIAS_SEMANA,
      jornada: await jornadaInstitucional(pool),
      limites: { minimo: aHora(HORA_MINIMA), maximo: aHora(HORA_MAXIMA) },
      bloques: await bloquesDeJornada(pool),
      // RF55: el administrador puede dejar el horario de atención al registrar al docente
      atencion: opcionesAtencion(),
    });
  } catch (error) {
    console.error('getOpcionesDisponibilidad:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar los bloques horarios' });
  }
};

module.exports = {
  // Compartidos con el horario de atención de apoderados (RF55 / CU87, CU88)
  bloquesDeJornada,
  clasesDelDocente,
  tramosGuardados,
  getDisponibilidad,
  getOpcionesDisponibilidad,
  leerDisponibilidad,
  guardarDisponibilidadDocente,
  ErrorDisponibilidad,
};
