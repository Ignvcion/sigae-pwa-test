// utils/tramos.js
// Tramos de las asignaturas: cada asignatura pertenece a UN tramo y solo se usa
// en planes educativos (y por ende en cursos, horarios y evaluaciones) de los
// niveles de ese tramo. El tramo de un nivel lo calcula la base desde su orden
// (nivel_educativo.Nivel_Educativo_Tramo):
//   Kinder: Pre-Kinder y Kinder
//   Básica: 1ero a 6to Básico
//   Media:  7mo Básico a 4to Medio (incluye los electivos de 3° y 4° medio)
// Reemplaza a la prioridad académica (Alta/Media/Baja), que se eliminó.

const TRAMOS = ['Kinder', 'Básica', 'Media'];

/** "basica", " Básica " → "Básica"; un valor que no es tramo → null. */
function normalizarTramo(valor) {
  const plano = String(valor ?? '').trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return TRAMOS.find((t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() === plano) || null;
}

const MENSAJE_TRAMO_INVALIDO = 'El tramo debe ser Kinder, Básica o Media';
const MENSAJE_ELECTIVA_MEDIA = 'Una asignatura electiva (3° y 4° medio) debe ser del tramo Media';

/**
 * Comprueba que las asignaturas sean del tramo del nivel.
 * @returns {{ nivel: { nombre, tramo } | null, fuera: [{ id, nombre, tramo }] }}
 *          nivel null si no existe; fuera: las que son de otro tramo.
 */
async function asignaturasFueraDeTramo(conn, nivelId, idsAsignaturas) {
  const [[nivel]] = await conn.execute(
    'SELECT Nivel_Educativo_Nombre AS nombre, Nivel_Educativo_Tramo AS tramo FROM nivel_educativo WHERE Nivel_Educativo_Id = ?',
    [nivelId]
  );
  if (!nivel) return { nivel: null, fuera: [] };
  const ids = [...new Set(idsAsignaturas.map(Number))];
  if (ids.length === 0) return { nivel, fuera: [] };
  const [filas] = await conn.execute(
    `SELECT Asignatura_Id AS id, Asignatura_Nombre AS nombre, Asignatura_Tramo AS tramo
       FROM asignatura WHERE Asignatura_Id IN (${ids.map(() => '?').join(',')}) AND Asignatura_Tramo <> ?`,
    [...ids, nivel.tramo]
  );
  return { nivel, fuera: filas };
}

/** Mensaje para la respuesta 422 cuando hay asignaturas de otro tramo. */
function mensajeFueraDeTramo(nivel, fuera) {
  const lista = fuera.map((a) => `"${a.nombre}" (${a.tramo})`).join(', ');
  const una = fuera.length === 1;
  return `${nivel.nombre} es del tramo ${nivel.tramo}: ${una ? 'la asignatura' : 'las asignaturas'} `
    + `${lista} ${una ? 'es de otro tramo y no se puede incluir' : 'son de otro tramo y no se pueden incluir'}`;
}

module.exports = {
  TRAMOS,
  normalizarTramo,
  asignaturasFueraDeTramo,
  mensajeFueraDeTramo,
  MENSAJE_TRAMO_INVALIDO,
  MENSAJE_ELECTIVA_MEDIA,
};
