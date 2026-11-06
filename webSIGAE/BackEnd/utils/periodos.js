// utils/periodos.js
// Períodos lectivos (RF61; docs/decisiones-rf60-rf61-periodos.txt, punto 5).
//
// Cada curso pertenece a un período (curso.Curso_Periodo_Lectivo, p. ej. "2026").
// parametro_institucional guarda:
//   - Periodo_Vigente: el año escolar en curso (el día a día).
//   - Periodo_Siguiente: el año que se está preparando; se llena con "Iniciar
//     cierre" y vuelve a NULL con "Iniciar nuevo período".
// Un curso con período menor al vigente es "antiguo": solo quedan en él
// egresados, estudiantes en práctica y retirados, y no aparece en los listados.
//
// Durante el cierre conviven dos períodos (las clases del vigente siguen
// mientras se arman los horarios del siguiente). Por eso:
//   - Los choques y la carga horaria del docente se comparan solo entre clases
//     del MISMO período (mismoPeriodoQueCurso).
//   - Lo del día a día (Mi horario, exportaciones, disponibilidad) mira solo
//     el período vigente (enPeriodoVigente).

// Período vigente como subconsulta SQL (sin parámetros). Si aún no está
// configurado, el año actual. El COLLATE evita "Illegal mix of collations"
// al comparar con la columna (utf8mb4_unicode_ci).
const PERIODO_VIGENTE_SQL = `(SELECT COALESCE(MAX(pi_pv.Parametro_Institucional_Periodo_Vigente),
  CAST(YEAR(CURDATE()) AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci)
  FROM parametro_institucional pi_pv)`;

/** Período del curso indicado por una expresión SQL (columna o '?'). */
const periodoDeCursoSQL = (cursoExpr) =>
  `(SELECT c_pc.Curso_Periodo_Lectivo FROM curso c_pc WHERE c_pc.Curso_Id = ${cursoExpr})`;

/**
 * Condición: la clase `alias` (horario_asignatura) es de un curso del mismo
 * período que el curso pasado como parámetro. UN parámetro: el Curso_Id.
 */
const mismoPeriodoQueCurso = (alias = 'ha') =>
  `${periodoDeCursoSQL(`${alias}.Curso_Id`)} = ${periodoDeCursoSQL('?')}`;

/** Condición: la clase `alias` es de un curso del período vigente. Sin parámetros. */
const enPeriodoVigente = (alias = 'ha') =>
  `${periodoDeCursoSQL(`${alias}.Curso_Id`)} = ${PERIODO_VIGENTE_SQL}`;

/** Condición sobre la tabla curso `alias`: no es de un período antiguo. Sin parámetros. */
const cursoNoArchivado = (alias = 'c') => `${alias}.Curso_Periodo_Lectivo >= ${PERIODO_VIGENTE_SQL}`;

const anioActual = () => String(new Date().getFullYear());

/** "2026" -> "2027". */
const periodoSiguienteDe = (periodo) => String(Number(periodo) + 1);

/**
 * { vigente, siguiente, cierreIniciado, parametroId } desde parametro_institucional.
 * `bloquear` agrega FOR UPDATE (para usar dentro de una transacción).
 */
async function obtenerPeriodos(conn, { bloquear = false } = {}) {
  const [filas] = await conn.query(
    `SELECT Parametro_Institucional_Id, Parametro_Institucional_Periodo_Vigente,
            Parametro_Institucional_Periodo_Siguiente
       FROM parametro_institucional ORDER BY Parametro_Institucional_Id LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`
  );
  const fila = Array.isArray(filas) ? filas[0] : undefined;
  const vigente = fila?.Parametro_Institucional_Periodo_Vigente || anioActual();
  const siguiente = fila?.Parametro_Institucional_Periodo_Siguiente || null;
  return {
    vigente,
    siguiente,
    cierreIniciado: Boolean(siguiente),
    parametroId: fila?.Parametro_Institucional_Id ?? null,
  };
}

module.exports = {
  PERIODO_VIGENTE_SQL,
  mismoPeriodoQueCurso,
  enPeriodoVigente,
  cursoNoArchivado,
  periodoSiguienteDe,
  obtenerPeriodos,
  anioActual,
};
