// utils/rutaFormacion.js
// Ruta de formación del estudiante (CU105, RF23) y niveles con electivos (RF34, CU106).
//
// - La ruta se decide en 2° medio y se registra en la ficha: Científica, Humanística o
//   Técnica. La Técnica es solo una marca: no tiene efecto en horarios ni electivos.
// - Los niveles se identifican por su orden (Pre-Kinder = 1 … 4° medio = el máximo):
//   2° medio = máximo − 2, 3° medio = máximo − 1, 4° medio = máximo. Así no dependen
//   del nombre del nivel.
// - Los electivos son de 3° y 4° medio, por ruta Científica o Humanística.

const RUTAS = ['Científica', 'Humanística', 'Técnica'];
const RUTAS_ELECTIVO = ['Científica', 'Humanística'];

const ORDEN_MAXIMO_SQL = '(SELECT MAX(nm.Nivel_Educativo_Orden) FROM nivel_educativo nm)';

/** SQL booleano: el nivel `n` es 2°, 3° o 4° medio (admite ruta de formación). */
const nivelConRutaSQL = (n = 'n') => `(${n}.Nivel_Educativo_Orden >= ${ORDEN_MAXIMO_SQL} - 2)`;

/** SQL booleano: el nivel `n` es 3° o 4° medio (tiene electivos). */
const nivelConElectivosSQL = (n = 'n') => `(${n}.Nivel_Educativo_Orden >= ${ORDEN_MAXIMO_SQL} - 1)`;

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/** "cientifica" → "Científica"; null si no es una ruta válida. */
function normalizarRuta(valor, permitidas = RUTAS) {
  const clave = sinTildes(valor);
  return permitidas.find((r) => sinTildes(r) === clave) || null;
}

module.exports = {
  RUTAS,
  RUTAS_ELECTIVO,
  ORDEN_MAXIMO_SQL,
  nivelConRutaSQL,
  nivelConElectivosSQL,
  normalizarRuta,
};
