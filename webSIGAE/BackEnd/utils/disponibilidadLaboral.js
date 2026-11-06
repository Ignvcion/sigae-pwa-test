// utils/disponibilidadLaboral.js
// Disponibilidad laboral del docente (CU107; RF04 y RF35).
//
// - Es un patrón SEMANAL por período lectivo: los días y bloques en que el docente
//   puede trabajar en el colegio. Se repite igual todas las semanas del período,
//   igual que su carga horaria, que también es semanal.
// - Un docente sin bloques registrados en un período no tiene restricción: puede
//   asignarse en cualquier bloque (así siguen funcionando los horarios ya armados).
// - Asignar una clase fuera de la disponibilidad se bloquea; el administrador
//   levanta el bloqueo editando la disponibilidad en el perfil del docente. Solo el
//   administrador ve y edita la disponibilidad y la carga horaria semanal.
// - Horas adeudadas = carga horaria semanal − horas disponibles a la semana. Solo
//   advierte: no impide armar el horario.
// - No debe confundirse con utils/disponibilidadDocente.js, que calcula los
//   horarios libres del docente para citaciones.
const { condicionDesajustado } = require('./bloquesDesajustados');

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const DURACION_SQL = (b = 'bh') =>
  `TIME_TO_SEC(TIMEDIFF(${b}.Bloque_Horario_Hora_Fin, ${b}.Bloque_Horario_Hora_Inicio)) / 3600`;

const claveBloque = (dia, bloqueId) => `${dia}|${Number(bloqueId)}`;
const redondear = (horas) => Math.round(Number(horas || 0) * 100) / 100;
const hhmm = (t) => String(t ?? '').slice(0, 5);

/** Período lectivo del curso, o null si el curso no existe. */
async function periodoDelCurso(db, cursoId) {
  const [filas] = await db.query('SELECT Curso_Periodo_Lectivo FROM curso WHERE Curso_Id = ?', [cursoId]);
  return Array.isArray(filas) && filas[0] ? filas[0].Curso_Periodo_Lectivo : null;
}

/**
 * Disponibilidad de varios docentes en varios períodos, en una consulta.
 * @returns {Promise<Map<string, Set<string>>>} clave "docenteId|periodo" → claves "dia|bloqueId".
 *   Un par ausente del mapa significa "sin disponibilidad registrada" (sin restricción).
 */
async function mapaDisponibilidad(db, docenteIds, periodos) {
  const docentes = [...new Set(docenteIds.filter(Boolean).map(Number))];
  const pers = [...new Set(periodos.filter(Boolean).map(String))];
  const mapa = new Map();
  if (docentes.length === 0 || pers.length === 0) return mapa;
  const [filas] = await db.query(
    `SELECT Docente_Usuario_Id, Disponibilidad_Docente_Periodo_Lectivo AS periodo,
            Disponibilidad_Docente_Dia_Semana AS dia, Bloque_Horario_Id
       FROM disponibilidad_docente
      WHERE Docente_Usuario_Id IN (?) AND Disponibilidad_Docente_Periodo_Lectivo IN (?)`,
    [docentes, pers]
  );
  for (const f of Array.isArray(filas) ? filas : []) {
    const k = `${Number(f.Docente_Usuario_Id)}|${f.periodo}`;
    if (!mapa.has(k)) mapa.set(k, new Set());
    mapa.get(k).add(claveBloque(f.dia, f.Bloque_Horario_Id));
  }
  return mapa;
}

/** true si el docente puede trabajar ese día y bloque (o si no tiene disponibilidad registrada). */
function estaDisponible(mapa, { docenteId, periodo, dia, bloqueId }) {
  const set = mapa.get(`${Number(docenteId)}|${periodo}`);
  return !set || set.has(claveBloque(dia, bloqueId));
}

/**
 * Verifica un día y bloque para un docente. Devuelve null si puede asignarse
 * o el mensaje de error si queda fuera de su disponibilidad laboral.
 */
async function validarDisponibilidad(db, { docenteId, periodo, dia, bloqueId }) {
  if (!docenteId || !periodo) return null;
  const mapa = await mapaDisponibilidad(db, [docenteId], [periodo]);
  if (estaDisponible(mapa, { docenteId, periodo, dia, bloqueId })) return null;
  const [filas] = await db.query(
    'SELECT Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin FROM bloque_horario WHERE Bloque_Horario_Id = ?',
    [bloqueId]
  );
  const b = Array.isArray(filas) ? filas[0] : null;
  const tramo = b ? ` ${hhmm(b.Bloque_Horario_Hora_Inicio)}–${hhmm(b.Bloque_Horario_Hora_Fin)}` : '';
  return `El docente no está disponible el ${dia}${tramo} según su disponibilidad laboral de ${periodo}. `
    + 'Para asignarlo, un administrador debe editar su disponibilidad en el perfil del docente.';
}

/**
 * Horas semanales de un docente en un período: carga contratada, disponibles,
 * asignadas y adeudadas.
 */
async function resumenSemanal(db, docenteId, periodo) {
  const [[docente]] = await db.query(
    'SELECT Docente_Carga_Horaria_Maxima FROM usuario WHERE Usuario_Id = ?',
    [docenteId]
  );
  const [[disp]] = await db.query(
    `SELECT COUNT(*) AS bloques, COALESCE(SUM(${DURACION_SQL('bh')}), 0) AS horas
       FROM disponibilidad_docente dd
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = dd.Bloque_Horario_Id
      WHERE dd.Docente_Usuario_Id = ? AND dd.Disponibilidad_Docente_Periodo_Lectivo = ?
        AND bh.Bloque_Horario_Tipo = 'Clase' AND NOT ${condicionDesajustado('bh')}`,
    [docenteId, periodo]
  );
  const [[asig]] = await db.query(
    `SELECT COALESCE(SUM(${DURACION_SQL('bh')}), 0) AS horas
       FROM horario_asignatura ha
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
       JOIN curso c ON c.Curso_Id = ha.Curso_Id
      WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo' AND c.Curso_Periodo_Lectivo = ?`,
    [docenteId, periodo]
  );
  const carga = docente?.Docente_Carga_Horaria_Maxima ?? null;
  const configurada = Number(disp?.bloques || 0) > 0;
  const horasDisponibles = redondear(disp?.horas);
  const horasAdeudadas = configurada && carga != null ? redondear(Math.max(0, Number(carga) - horasDisponibles)) : 0;
  return {
    periodo,
    cargaSemanal: carga == null ? null : Number(carga),
    configurada,
    bloquesDisponibles: Number(disp?.bloques || 0),
    horasDisponibles,
    horasAsignadas: redondear(asig?.horas),
    horasAdeudadas,
  };
}

/** Texto de la advertencia de horas adeudadas, o null si no corresponde. */
function advertenciaHorasAdeudadas(resumen, nombre = 'El docente') {
  if (!resumen || resumen.horasAdeudadas <= 0) return null;
  return `${nombre} está disponible ${resumen.horasDisponibles} h a la semana y su carga horaria semanal `
    + `es de ${resumen.cargaSemanal} h: debe ${resumen.horasAdeudadas} h. Se puede seguir configurando el horario.`;
}

module.exports = {
  DIAS_SEMANA,
  claveBloque,
  periodoDelCurso,
  mapaDisponibilidad,
  estaDisponible,
  validarDisponibilidad,
  resumenSemanal,
  advertenciaHorasAdeudadas,
};
