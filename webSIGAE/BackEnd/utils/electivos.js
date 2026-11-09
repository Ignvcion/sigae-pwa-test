// utils/electivos.js
// Electivos de 3° y 4° medio (RF27, RF28, RF33, RF34, RF35; CU47, CU53, CU54, CU106, CU108).
//
// - Una asignatura marcada como electiva (asignatura.Asignatura_Es_Electiva) solo va en el
//   plan de electivos: no entra en planes regulares (RF27) ni se asocia a cursos (RF33).
// - El plan de electivos es único por período y común a 3° y 4° medio: asignaturas por
//   ruta (Científica o Humanística), horas semanales y docentes habilitados (CU108).
// - Los electivos se programan en bloques COMPARTIDOS por todos los cursos de 3° y 4° medio
//   del período (CU106). Un bloque admite varios electivos simultáneos: no son conflicto
//   para el curso (RNF17). Un bloque con electivos no admite clases regulares de esos
//   cursos, y viceversa (CU54, CU106 Excepción 4).
// - Para el docente, un electivo es una clase normal: choca con sus otras clases del mismo
//   día, bloque y período, cuenta en su carga horaria semanal y respeta su disponibilidad.
// - En la completitud de cada curso de 3° y 4° medio, las horas del plan de electivos se
//   suman una vez (las de una ruta) y cada bloque de electivo cuenta una vez.
const { nivelConElectivosSQL } = require('./rutaFormacion');

const DURACION_SQL = (b = 'bh') =>
  `TIME_TO_SEC(TIMEDIFF(${b}.Bloque_Horario_Hora_Fin, ${b}.Bloque_Horario_Hora_Inicio)) / 3600`;

/** SQL booleano: el curso `c` es de 3° o 4° medio. */
const cursoConElectivosSQL = (c = 'c') => `EXISTS (
    SELECT 1 FROM nivel_educativo ne_el
     WHERE ne_el.Nivel_Educativo_Id = ${c}.Nivel_Educativo_Id AND ${nivelConElectivosSQL('ne_el')})`;

/** ¿El curso es de 3° o 4° medio? Devuelve { tiene, periodo } o null si no existe. */
async function cursoTieneElectivos(db, cursoId) {
  const [[fila]] = await db.query(
    `SELECT c.Curso_Periodo_Lectivo AS periodo, ${cursoConElectivosSQL('c')} AS tiene
       FROM curso c WHERE c.Curso_Id = ?`,
    [cursoId]
  );
  return fila ? { tiene: Number(fila.tiene) === 1, periodo: fila.periodo } : null;
}

/** Electivos programados en un día y bloque del período (con su asignatura y docente). */
async function electivosEnBloque(db, { periodo, dia, bloqueId }) {
  const [filas] = await db.query(
    `SELECT ce.Clase_Electivo_Id, ce.Clase_Electivo_Ruta AS ruta, a.Asignatura_Nombre AS asignatura,
            ce.Docente_Usuario_Id, u.Usuario_Nombre_Completo AS docente
       FROM clase_electivo ce
       JOIN asignatura a ON a.Asignatura_Id = ce.Asignatura_Id
       JOIN usuario u    ON u.Usuario_Id = ce.Docente_Usuario_Id
      WHERE ce.Clase_Electivo_Periodo_Lectivo = ? AND ce.Clase_Electivo_Dia_Semana = ? AND ce.Bloque_Horario_Id = ?`,
    [periodo, dia, bloqueId]
  );
  return Array.isArray(filas) ? filas : [];
}

/**
 * CU54 / CU106: conflictos de una clase REGULAR con los electivos del mismo período.
 * - Si el curso es de 3° o 4° medio, el bloque no puede estar ocupado por un electivo.
 * - El docente no puede tener un electivo ese día y bloque.
 * Devuelve el mensaje de error o null.
 */
async function conflictoRegularConElectivos(db, { cursoId, docenteId, dia, bloqueId }) {
  const curso = await cursoTieneElectivos(db, cursoId);
  if (!curso) return null;
  const electivos = await electivosEnBloque(db, { periodo: curso.periodo, dia, bloqueId });
  if (electivos.length === 0) return null;
  if (curso.tiene) {
    return `El bloque del ${dia} está ocupado por electivos de 3° y 4° medio `
      + `(${electivos.map((e) => `${e.asignatura} · ${e.ruta}`).join('; ')}): no admite clases regulares.`;
  }
  const delDocente = docenteId && electivos.find((e) => Number(e.Docente_Usuario_Id) === Number(docenteId));
  if (delDocente) {
    return `El docente ya tiene el electivo ${delDocente.asignatura} (${delDocente.ruta}) ese ${dia} en ese bloque`;
  }
  return null;
}

/** Bloques distintos con electivos ese día (cuentan en el límite diario de un curso de 3° o 4° medio). */
async function bloquesElectivoDelDia(db, cursoId, dia) {
  const [[fila]] = await db.query(
    `SELECT COUNT(DISTINCT ce.Bloque_Horario_Id) AS n
       FROM curso c
       JOIN clase_electivo ce ON ce.Clase_Electivo_Periodo_Lectivo = c.Curso_Periodo_Lectivo
      WHERE c.Curso_Id = ? AND ce.Clase_Electivo_Dia_Semana = ? AND ${cursoConElectivosSQL('c')}`,
    [cursoId, dia]
  );
  return Number(fila?.n || 0);
}

/** Horas semanales de electivos del docente en el período (para la carga horaria semanal). */
async function horasElectivoDocente(db, docenteId, periodo, { excluirId = null } = {}) {
  const [[fila]] = await db.query(
    `SELECT COALESCE(SUM(${DURACION_SQL('bh')}), 0) AS horas
       FROM clase_electivo ce JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ce.Bloque_Horario_Id
      WHERE ce.Docente_Usuario_Id = ? AND ce.Clase_Electivo_Periodo_Lectivo = ?
        ${excluirId ? 'AND ce.Clase_Electivo_Id <> ?' : ''}`,
    excluirId ? [docenteId, periodo, excluirId] : [docenteId, periodo]
  );
  return Number(fila?.horas || 0);
}

/**
 * Completitud de electivos del período para los cursos de 3° y 4° medio:
 * requeridas = horas de la ruta con más horas del plan; programadas = bloques distintos
 * con electivos × su duración (cada bloque cuenta una vez).
 */
async function completitudElectivos(db, periodo) {
  const [[req]] = await db.query(
    `SELECT COALESCE(MAX(t.horas), 0) AS horas FROM (
        SELECT SUM(pea.Plan_Electivos_Asignatura_Horas) AS horas
          FROM plan_electivos pe
          JOIN plan_electivos_asignatura pea ON pea.Plan_Electivos_Id = pe.Plan_Electivos_Id
         WHERE pe.Plan_Electivos_Periodo_Lectivo = ?
         GROUP BY pea.Plan_Electivos_Asignatura_Ruta) t`,
    [periodo]
  );
  const [[prog]] = await db.query(
    `SELECT COALESCE(SUM(t.duracion), 0) AS horas FROM (
        SELECT DISTINCT ce.Clase_Electivo_Dia_Semana, ce.Bloque_Horario_Id, ${DURACION_SQL('bh')} AS duracion
          FROM clase_electivo ce JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ce.Bloque_Horario_Id
         WHERE ce.Clase_Electivo_Periodo_Lectivo = ?) t`,
    [periodo]
  );
  return { requeridas: Number(req?.horas || 0), programadas: Math.round(Number(prog?.horas || 0) * 100) / 100 };
}

module.exports = {
  DURACION_SQL,
  cursoConElectivosSQL,
  cursoTieneElectivos,
  electivosEnBloque,
  conflictoRegularConElectivos,
  bloquesElectivoDelDia,
  horasElectivoDocente,
  completitudElectivos,
};
