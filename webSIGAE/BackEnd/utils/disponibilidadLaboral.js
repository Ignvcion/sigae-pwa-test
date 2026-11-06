// utils/disponibilidadLaboral.js
// Disponibilidad laboral del docente (CU107; RF04 y RF35).
//
// - Es un patrón SEMANAL por período lectivo: por cada día (lunes a viernes), uno o
//   más tramos "desde–hasta" en que el docente está en el colegio. Incluye recreos y
//   horas sin clases (corregir pruebas, reuniones), no solo los bloques de clase.
// - Las clases se siguen asignando por bloques de 45 minutos: un bloque está
//   disponible si cae COMPLETO dentro de un tramo (los tramos contiguos se unen).
// - Un docente sin tramos registrados en un período no tiene restricción: puede
//   asignarse en cualquier bloque (así siguen funcionando los horarios ya armados).
// - Asignar una clase fuera de la disponibilidad se bloquea; el administrador
//   levanta el bloqueo editando la disponibilidad en el perfil del docente. Solo el
//   administrador edita la disponibilidad y la carga horaria semanal; el docente la ve.
// - Horas disponibles = suma de los tramos de la semana. Horas adeudadas = carga
//   horaria semanal − horas disponibles. Solo advierte: no impide armar el horario.
// - No debe confundirse con utils/disponibilidadDocente.js, que calcula los
//   horarios libres del docente para citaciones.

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

// Límites de un tramo: el colegio puede abrir temprano y cerrar tarde
const HORA_MINIMA = 6 * 60;  // 06:00
const HORA_MAXIMA = 23 * 60; // 23:00
const MIN_DURACION_TRAMO = 15;
const MAX_TRAMOS_POR_DIA = 6;

const pad = (n) => String(n).padStart(2, '0');
const redondear = (horas) => Math.round(Number(horas || 0) * 100) / 100;

/** "09:15" o "09:15:00" → 555; NaN si no es una hora válida. */
function aMinutos(hora) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(hora ?? '').trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

const aHora = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Une tramos que se tocan o se superponen: [[540,720],[720,780]] → [[540,780]]. */
function unirTramos(tramos) {
  const orden = [...tramos].sort((a, b) => a.inicio - b.inicio);
  const unidos = [];
  for (const t of orden) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && t.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, t.fin);
    else unidos.push({ ...t });
  }
  return unidos;
}

/** ¿El intervalo [inicio, fin) cabe completo en alguno de los tramos (ya unidos)? */
const cabeEnTramos = (tramos, inicio, fin) => tramos.some((t) => t.inicio <= inicio && fin <= t.fin);

/**
 * Valida y normaliza los tramos que envía el cliente:
 * [{ dia: 'Lunes', hora_inicio: '08:00', hora_fin: '13:00' }, ...]
 * @returns {{ ok: true, tramos: {dia, inicio, fin}[] } | { ok: false, mensaje: string }}
 */
function normalizarTramos(lista) {
  if (!Array.isArray(lista)) {
    return { ok: false, mensaje: 'La disponibilidad laboral debe indicar sus tramos como una lista (vacía para quitar la restricción)' };
  }
  const porDia = new Map();
  for (const t of lista) {
    const dia = t?.dia;
    const inicio = aMinutos(t?.hora_inicio);
    const fin = aMinutos(t?.hora_fin);
    if (!DIAS_SEMANA.includes(dia)) {
      return { ok: false, mensaje: 'Cada tramo debe indicar un día hábil (lunes a viernes)' };
    }
    if (Number.isNaN(inicio) || Number.isNaN(fin)) {
      return { ok: false, mensaje: `El ${dia} tiene un tramo con una hora no válida (formato HH:MM)` };
    }
    if (fin - inicio < MIN_DURACION_TRAMO) {
      return { ok: false, mensaje: `El ${dia} tiene un tramo cuya hora de término no es al menos ${MIN_DURACION_TRAMO} minutos posterior a la de inicio` };
    }
    if (inicio < HORA_MINIMA || fin > HORA_MAXIMA) {
      return { ok: false, mensaje: `Los tramos deben estar entre las ${aHora(HORA_MINIMA)} y las ${aHora(HORA_MAXIMA)}` };
    }
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push({ dia, inicio, fin });
  }
  const tramos = [];
  for (const dia of DIAS_SEMANA) {
    const delDia = (porDia.get(dia) || []).sort((a, b) => a.inicio - b.inicio);
    if (delDia.length > MAX_TRAMOS_POR_DIA) {
      return { ok: false, mensaje: `El ${dia} puede tener como máximo ${MAX_TRAMOS_POR_DIA} tramos` };
    }
    for (let i = 1; i < delDia.length; i += 1) {
      if (delDia[i].inicio < delDia[i - 1].fin) {
        return {
          ok: false,
          mensaje: `El ${dia} tiene tramos que se superponen (${aHora(delDia[i - 1].inicio)}–${aHora(delDia[i - 1].fin)} `
            + `y ${aHora(delDia[i].inicio)}–${aHora(delDia[i].fin)})`,
        };
      }
    }
    tramos.push(...delDia);
  }
  return { ok: true, tramos };
}

/** Período lectivo del curso, o null si el curso no existe. */
async function periodoDelCurso(db, cursoId) {
  const [filas] = await db.query('SELECT Curso_Periodo_Lectivo FROM curso WHERE Curso_Id = ?', [cursoId]);
  return Array.isArray(filas) && filas[0] ? filas[0].Curso_Periodo_Lectivo : null;
}

/**
 * Tramos de varios docentes en varios períodos, en una consulta.
 * @returns {Promise<Map<string, Map<string, {inicio, fin}[]>>>} "docenteId|periodo" → día → tramos unidos.
 *   Un par ausente del mapa significa "sin disponibilidad registrada" (sin restricción).
 */
async function mapaDisponibilidad(db, docenteIds, periodos) {
  const docentes = [...new Set(docenteIds.filter(Boolean).map(Number))];
  const pers = [...new Set(periodos.filter(Boolean).map(String))];
  const mapa = new Map();
  if (docentes.length === 0 || pers.length === 0) return mapa;
  const [filas] = await db.query(
    `SELECT Docente_Usuario_Id, Disponibilidad_Docente_Periodo_Lectivo AS periodo,
            Disponibilidad_Docente_Dia_Semana AS dia,
            Disponibilidad_Docente_Hora_Inicio AS hora_inicio, Disponibilidad_Docente_Hora_Fin AS hora_fin
       FROM disponibilidad_docente
      WHERE Docente_Usuario_Id IN (?) AND Disponibilidad_Docente_Periodo_Lectivo IN (?)`,
    [docentes, pers]
  );
  for (const f of Array.isArray(filas) ? filas : []) {
    const k = `${Number(f.Docente_Usuario_Id)}|${f.periodo}`;
    if (!mapa.has(k)) mapa.set(k, new Map());
    const dias = mapa.get(k);
    if (!dias.has(f.dia)) dias.set(f.dia, []);
    dias.get(f.dia).push({ inicio: aMinutos(f.hora_inicio), fin: aMinutos(f.hora_fin) });
  }
  for (const dias of mapa.values()) {
    for (const [dia, tramos] of dias) dias.set(dia, unirTramos(tramos));
  }
  return mapa;
}

/**
 * true si el bloque [horaInicio, horaFin) del día cae dentro de un tramo del docente
 * (o si el docente no tiene disponibilidad registrada en el período).
 */
function estaDisponible(mapa, { docenteId, periodo, dia, horaInicio, horaFin }) {
  const dias = mapa.get(`${Number(docenteId)}|${periodo}`);
  if (!dias) return true;
  return cabeEnTramos(dias.get(dia) || [], aMinutos(horaInicio), aMinutos(horaFin));
}

/**
 * Verifica un bloque para un docente. Devuelve null si puede asignarse o el mensaje
 * de error si queda fuera de su disponibilidad laboral. Si no se dan horaInicio y
 * horaFin, se leen del bloque.
 */
async function validarDisponibilidad(db, { docenteId, periodo, dia, bloqueId, horaInicio, horaFin }) {
  if (!docenteId || !periodo) return null;
  const mapa = await mapaDisponibilidad(db, [docenteId], [periodo]);
  if (!mapa.has(`${Number(docenteId)}|${periodo}`)) return null; // sin restricción
  let inicio = horaInicio;
  let fin = horaFin;
  if (!inicio || !fin) {
    const [filas] = await db.query(
      'SELECT Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin FROM bloque_horario WHERE Bloque_Horario_Id = ?',
      [bloqueId]
    );
    const b = Array.isArray(filas) ? filas[0] : null;
    if (!b) return null; // el bloque no existe: otra validación lo informa
    inicio = b.Bloque_Horario_Hora_Inicio;
    fin = b.Bloque_Horario_Hora_Fin;
  }
  if (estaDisponible(mapa, { docenteId, periodo, dia, horaInicio: inicio, horaFin: fin })) return null;
  const tramos = mapa.get(`${Number(docenteId)}|${periodo}`).get(dia) || [];
  const disponibleEseDia = tramos.length > 0
    ? `ese día está disponible ${tramos.map((t) => `${aHora(t.inicio)}–${aHora(t.fin)}`).join(' y ')}`
    : 'ese día no tiene tramos disponibles';
  return `El docente no está disponible el ${dia} ${String(inicio).slice(0, 5)}–${String(fin).slice(0, 5)} `
    + `según su disponibilidad laboral de ${periodo} (${disponibleEseDia}). `
    + 'Para asignarlo, un administrador debe editar su disponibilidad en el perfil del docente.';
}

/**
 * Horas semanales de un docente en un período: carga contratada, disponibles,
 * asignadas en clases y adeudadas.
 */
async function resumenSemanal(db, docenteId, periodo) {
  const [[docente]] = await db.query(
    'SELECT Docente_Carga_Horaria_Maxima FROM usuario WHERE Usuario_Id = ?',
    [docenteId]
  );
  const [[disp]] = await db.query(
    `SELECT COUNT(*) AS tramos,
            COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(Disponibilidad_Docente_Hora_Fin, Disponibilidad_Docente_Hora_Inicio))), 0) / 3600 AS horas
       FROM disponibilidad_docente
      WHERE Docente_Usuario_Id = ? AND Disponibilidad_Docente_Periodo_Lectivo = ?`,
    [docenteId, periodo]
  );
  const [[asig]] = await db.query(
    `SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600), 0) AS horas
       FROM horario_asignatura ha
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
       JOIN curso c ON c.Curso_Id = ha.Curso_Id
      WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo' AND c.Curso_Periodo_Lectivo = ?`,
    [docenteId, periodo]
  );
  const carga = docente?.Docente_Carga_Horaria_Maxima ?? null;
  const configurada = Number(disp?.tramos || 0) > 0;
  const horasDisponibles = redondear(disp?.horas);
  const horasAdeudadas = configurada && carga != null ? redondear(Math.max(0, Number(carga) - horasDisponibles)) : 0;
  return {
    periodo,
    cargaSemanal: carga == null ? null : Number(carga),
    configurada,
    tramos: Number(disp?.tramos || 0),
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
  HORA_MINIMA,
  HORA_MAXIMA,
  aMinutos,
  aHora,
  unirTramos,
  cabeEnTramos,
  normalizarTramos,
  periodoDelCurso,
  mapaDisponibilidad,
  estaDisponible,
  validarDisponibilidad,
  resumenSemanal,
  advertenciaHorasAdeudadas,
};
