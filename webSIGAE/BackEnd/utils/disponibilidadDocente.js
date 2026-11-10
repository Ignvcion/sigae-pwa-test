// Disponibilidad horaria del docente, compartida por citaciones (C-11 / CU74, CU77)
// y por el horario de atención de apoderados (RF55, RF56 / CU87, CU88, CU89).
//
// Las horas se manejan como texto "HH:MM" y se comparan en minutos.
const { claseVigente } = require('./clasesEliminadas');
const { enPeriodoVigente, PERIODO_VIGENTE_SQL } = require('./periodos');

// Días tal como se guardan en horario_asignatura y horario_atencion (lunes a viernes)
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const pad = (n) => String(n).padStart(2, '0');

/** "09:15" o "09:15:00" → 555. Devuelve NaN si no es una hora válida. */
function aMinutos(hora) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(hora ?? '').trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** 555 → "09:15" */
function minutosAHora(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** "09:15:00" → "09:15" (normaliza lo que entrega MySQL para TIME) */
function hhmm(hora) {
  return minutosAHora(aMinutos(hora));
}

/** Tramo de citación "10:00 - 10:30" → { inicio: 600, fin: 630 }, o null si no tiene ese formato. */
function parsearTramo(tramo) {
  const m = /^(\d{2}:\d{2}) - (\d{2}:\d{2})$/.exec(String(tramo ?? ''));
  if (!m) return null;
  const inicio = aMinutos(m[1]);
  const fin = aMinutos(m[2]);
  if (Number.isNaN(inicio) || Number.isNaN(fin) || inicio >= fin) return null;
  return { inicio, fin };
}

/** Fecha "YYYY-MM-DD" → "Lunes".."Viernes", o null si cae en fin de semana. */
function diaSemanaDeFecha(fecha) {
  const [y, m, d] = String(fecha).split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay(); // 0 = domingo
  return dia >= 1 && dia <= 5 ? DIAS_SEMANA[dia - 1] : null;
}

/** Dos intervalos [inicio, fin) en minutos se superponen si cada uno empieza antes de que termine el otro. */
const seSuperponen = (a, b) => a.inicio < b.fin && b.inicio < a.fin;

/**
 * Todo lo que ocupa al docente en el período vigente: clases regulares (las eliminadas no
 * cuentan; las suspendidas sí, porque siguen siendo parte de su horario), electivos de 3° y
 * 4° medio (CU106) y bloques P.I.E. (tabla bloque_pie_docente). Un tramo de atención o una
 * citación no puede caer sobre ninguno de ellos.
 *
 * Opciones: `dia` y/o un intervalo `inicio`/`fin` (en minutos) para filtrar los que chocan.
 * Devuelve { id, tipo ('clase' | 'electivo' | 'pie'), dia, bloqueId, curso, asignatura,
 * horaInicio, horaFin }.
 */
async function ocupacionesDelDocente(conn, docenteId, { dia = null, inicio = null, fin = null } = {}) {
  if (!docenteId) return [];
  const filtro = (colDia) => `${dia ? ` AND ${colDia} = ?` : ''}${inicio !== null
    ? ' AND bh.Bloque_Horario_Hora_Inicio < ? AND bh.Bloque_Horario_Hora_Fin > ?' : ''}`;
  const extra = [...(dia ? [dia] : []), ...(inicio !== null ? [minutosAHora(fin), minutosAHora(inicio)] : [])];
  const [filas] = await conn.query(
    `SELECT ha.Horario_Asignatura_Id AS id, 'clase' AS tipo,
            ha.Horario_Asignatura_Dia_Semana AS dia, ha.Bloque_Horario_Id AS bloqueId,
            c.Curso_Nombre AS curso, a.Asignatura_Nombre AS asignatura,
            bh.Bloque_Horario_Hora_Inicio AS horaInicio, bh.Bloque_Horario_Hora_Fin AS horaFin
       FROM horario_asignatura ha
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
       LEFT JOIN curso c      ON c.Curso_Id = ha.Curso_Id
       LEFT JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
      WHERE ha.Usuario_Id = ? AND ${claseVigente('ha')} AND ${enPeriodoVigente('ha')}${filtro('ha.Horario_Asignatura_Dia_Semana')}
     UNION ALL
     SELECT ce.Clase_Electivo_Id, 'electivo', ce.Clase_Electivo_Dia_Semana, ce.Bloque_Horario_Id,
            '3° y 4° medio (electivo)', CONCAT(a.Asignatura_Nombre, ' · ', ce.Clase_Electivo_Ruta),
            bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin
       FROM clase_electivo ce
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ce.Bloque_Horario_Id
       JOIN asignatura a      ON a.Asignatura_Id = ce.Asignatura_Id
      WHERE ce.Docente_Usuario_Id = ? AND ce.Clase_Electivo_Periodo_Lectivo = ${PERIODO_VIGENTE_SQL}${filtro('ce.Clase_Electivo_Dia_Semana')}
     UNION ALL
     SELECT NULL, 'pie', bp.Bloque_Pie_Dia_Semana, bp.Bloque_Horario_Id,
            NULL, 'Horas P.I.E.',
            bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin
       FROM bloque_pie_docente bp
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = bp.Bloque_Horario_Id
      WHERE bp.Docente_Usuario_Id = ? AND bp.Bloque_Pie_Periodo_Lectivo = ${PERIODO_VIGENTE_SQL}${filtro('bp.Bloque_Pie_Dia_Semana')}
     ORDER BY horaInicio`,
    [docenteId, ...extra, docenteId, ...extra, docenteId, ...extra]
  );
  return filas.map((f) => ({ ...f, horaInicio: hhmm(f.horaInicio), horaFin: hhmm(f.horaFin) }));
}

/**
 * Lo que ocupa al docente (clases, electivos y bloques P.I.E.) en un día de la semana y que
 * se superpone con el intervalo [inicio, fin) (en minutos). Devuelve los elementos con curso,
 * asignatura y horas para informar el choque.
 */
async function buscarChoquesConClases(conn, { docenteId, dia, inicio, fin }) {
  if (!docenteId || !dia) return [];
  return ocupacionesDelDocente(conn, docenteId, { dia, inicio, fin });
}

/** Texto para informar un choque: "1ero Básico A — Matemática (09:15–10:00)" */
function describirClase(clase) {
  const nombre = [clase.curso, clase.asignatura].filter(Boolean).join(' — ') || 'Clase asignada';
  return `${nombre} (${clase.horaInicio}–${clase.horaFin})`;
}

/**
 * C-11: una citación en `fecha` y `tramo` no puede coincidir con una clase del docente.
 * Devuelve la primera clase que choca, o null si el tramo está libre.
 */
async function buscarClaseEnTramo(conn, { docenteId, fecha, tramo }) {
  const dia = diaSemanaDeFecha(fecha);
  const intervalo = parsearTramo(tramo);
  if (!dia || !intervalo) return null;
  const choques = await buscarChoquesConClases(conn, { docenteId, dia, ...intervalo });
  return choques[0] || null;
}

module.exports = {
  DIAS_SEMANA,
  aMinutos,
  minutosAHora,
  hhmm,
  parsearTramo,
  diaSemanaDeFecha,
  seSuperponen,
  ocupacionesDelDocente,
  buscarChoquesConClases,
  buscarClaseEnTramo,
  describirClase,
};
