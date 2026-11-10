// utils/cargaLectiva.js
// Horas P.I.E. (Programa de Integración Escolar) y regla 65/35 de la carga del docente.
//
// - El administrador asigna al docente una cantidad de horas P.I.E.
//   (usuario.Docente_Horas_PIE) y puede ubicarlas en bloques de su horario
//   semanal (tabla bloque_pie_docente, por período). Un bloque P.I.E. ocupa
//   ese día y bloque: no se le puede asignar una clase ahí.
// - Las horas P.I.E. se restan de la carga horaria semanal; sobre lo que queda
//   se aplica la regla 65/35: el 65 % son horas lectivas (clases) y el 35 %,
//   no lectivas. Ejemplo: 44 h − 3 h P.I.E. = 41 h → 26 lectivas y 15 no lectivas.
// - Las horas lectivas se cuentan en horas PEDAGÓGICAS: cada bloque de clase
//   (regular o electivo) vale 1, sin importar sus minutos. El 65 % se redondea
//   hacia abajo (65 % de 41 = 26,65 → 26 clases como máximo).
// - Asignar clases por sobre el máximo lectivo se rechaza (reemplaza al límite
//   anterior, que era la carga completa en horas reloj).

const PORCENTAJE_LECTIVO = 0.65;

/**
 * Reparto 65/35 de la carga del docente.
 * @returns null si el docente no tiene carga registrada (sin límite), o
 *          { carga, horasPIE, disponibles, maxLectivas, noLectivas }
 */
function calcularCargaLectiva(carga, horasPIE = 0) {
  if (carga === null || carga === undefined || carga === '') return null;
  const total = Number(carga);
  if (!Number.isFinite(total)) return null;
  const pie = Math.max(0, Number(horasPIE) || 0);
  const disponibles = Math.max(0, total - pie);
  // El epsilon evita que 0,65 × 20 = 12,999… quede en 12
  const maxLectivas = Math.floor(disponibles * PORCENTAJE_LECTIVO + 1e-9);
  return { carga: total, horasPIE: pie, disponibles, maxLectivas, noLectivas: disponibles - maxLectivas };
}

const clases = (n) => `${n} ${n === 1 ? 'clase' : 'clases'}`;

/** Texto del reparto: "44 h − 3 h P.I.E. = 41 h → 26 clases (65 %) y 15 h no lectivas (35 %)". */
function textoReparto(info) {
  const base = info.horasPIE > 0
    ? `${info.carga} h − ${info.horasPIE} h P.I.E. = ${info.disponibles} h`
    : `${info.carga} h`;
  return `${base} → ${clases(info.maxLectivas)} (65 %) y ${info.noLectivas} h no lectivas (35 %)`;
}

/**
 * Clases lectivas (bloques) de cada docente en un período: clases regulares
 * activas y electivos. Devuelve Map(docenteId → cantidad).
 * excluirHorarioId: la clase que se está editando (no cuenta dos veces).
 */
async function clasesLectivas(db, docenteIds, periodo, { excluirHorarioId = null, excluirElectivoId = null } = {}) {
  const ids = [...new Set(docenteIds.map(Number))].filter(Boolean);
  const mapa = new Map(ids.map((id) => [id, 0]));
  if (ids.length === 0) return mapa;
  const [regulares] = await db.query(
    `SELECT ha.Usuario_Id AS id, COUNT(*) AS n
       FROM horario_asignatura ha JOIN curso c ON c.Curso_Id = ha.Curso_Id
      WHERE ha.Usuario_Id IN (?) AND ha.Horario_Asignatura_Estado = 'Activo' AND c.Curso_Periodo_Lectivo = ?
        ${excluirHorarioId ? 'AND ha.Horario_Asignatura_Id <> ?' : ''}
      GROUP BY ha.Usuario_Id`,
    excluirHorarioId ? [ids, periodo, excluirHorarioId] : [ids, periodo]
  );
  const [electivos] = await db.query(
    `SELECT Docente_Usuario_Id AS id, COUNT(*) AS n
       FROM clase_electivo
      WHERE Docente_Usuario_Id IN (?) AND Clase_Electivo_Periodo_Lectivo = ?
        ${excluirElectivoId ? 'AND Clase_Electivo_Id <> ?' : ''}
      GROUP BY Docente_Usuario_Id`,
    excluirElectivoId ? [ids, periodo, excluirElectivoId] : [ids, periodo]
  );
  for (const f of [...(regulares || []), ...(electivos || [])]) {
    mapa.set(Number(f.id), (mapa.get(Number(f.id)) || 0) + Number(f.n));
  }
  return mapa;
}

/** Carga y horas P.I.E. de los docentes: Map(docenteId → { nombre, carga, horasPIE }). */
async function datosCarga(db, docenteIds) {
  const ids = [...new Set(docenteIds.map(Number))].filter(Boolean);
  if (ids.length === 0) return new Map();
  const [filas] = await db.query(
    `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Carga_Horaria_Semanal, Docente_Horas_PIE
       FROM usuario WHERE Usuario_Id IN (?)`,
    [ids]
  );
  return new Map((filas || []).map((f) => [Number(f.Usuario_Id), {
    nombre: f.Usuario_Nombre_Completo,
    carga: f.Docente_Carga_Horaria_Semanal,
    horasPIE: f.Docente_Horas_PIE,
  }]));
}

/** Mensaje cuando una asignación supera el máximo lectivo. */
function mensajeExcede(nombre, info, actuales, nuevas) {
  return `${nombre || 'El docente'} superaría su máximo semanal de ${clases(info.maxLectivas)} `
    + `(${textoReparto(info)}). Ya tiene ${clases(actuales)} y quedaría con ${actuales + nuevas}.`;
}

/**
 * Comprueba que el docente pueda sumar `nuevas` clases en el período.
 * @returns null si puede, o el mensaje de error (422).
 */
async function verificarCargaLectiva(db, docenteId, periodo, opciones = {}) {
  const { nuevas = 1, excluirHorarioId = null, excluirElectivoId = null } = opciones;
  const datos = (await datosCarga(db, [docenteId])).get(Number(docenteId));
  const info = datos && calcularCargaLectiva(datos.carga, datos.horasPIE);
  if (!info) return null;
  const actuales = (await clasesLectivas(db, [docenteId], periodo, { excluirHorarioId, excluirElectivoId }))
    .get(Number(docenteId)) || 0;
  return actuales + nuevas > info.maxLectivas ? mensajeExcede(datos.nombre, info, actuales, nuevas) : null;
}

/** Docentes (de docenteIds) que tienen un bloque P.I.E. ese día y bloque del período. */
async function docentesConPIEEnBloque(db, docenteIds, periodo, dia, bloqueId) {
  const ids = [...new Set(docenteIds.map(Number))].filter(Boolean);
  if (ids.length === 0) return new Set();
  const [filas] = await db.query(
    `SELECT DISTINCT Docente_Usuario_Id AS id FROM bloque_pie_docente
      WHERE Docente_Usuario_Id IN (?) AND Bloque_Pie_Periodo_Lectivo = ?
        AND Bloque_Pie_Dia_Semana = ? AND Bloque_Horario_Id = ?`,
    [ids, periodo, dia, bloqueId]
  );
  return new Set((filas || []).map((f) => Number(f.id)));
}

const MENSAJE_BLOQUE_PIE = 'El docente tiene horas P.I.E. en ese día y bloque horario';

module.exports = {
  PORCENTAJE_LECTIVO,
  calcularCargaLectiva,
  textoReparto,
  clasesLectivas,
  datosCarga,
  mensajeExcede,
  verificarCargaLectiva,
  docentesConPIEEnBloque,
  MENSAJE_BLOQUE_PIE,
};
