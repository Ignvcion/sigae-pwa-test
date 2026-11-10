// utils/colores.js
// Colores de asignaturas y docentes (asignatura.Asignatura_Color,
// usuario.Docente_Color): un hexadecimal "#RRGGBB" que identifica a cada uno
// en los horarios y listados.
//
// - Al crear una asignatura o un docente se le asigna un color ALEATORIO de la
//   paleta básica, eligiendo entre los menos usados (así no se repiten mientras
//   queden colores libres).
// - El administrador lo cambia por otro de la paleta o por cualquier hexadecimal.
//
// La misma paleta está en FrontEnd/src/utils/colores.js.

const PALETA_BASICA = [
  { hex: '#DC2626', nombre: 'Rojo' },
  { hex: '#EA580C', nombre: 'Naranja' },
  { hex: '#CA8A04', nombre: 'Amarillo' },
  { hex: '#65A30D', nombre: 'Lima' },
  { hex: '#16A34A', nombre: 'Verde' },
  { hex: '#0D9488', nombre: 'Turquesa' },
  { hex: '#0284C7', nombre: 'Celeste' },
  { hex: '#2563EB', nombre: 'Azul' },
  { hex: '#4F46E5', nombre: 'Índigo' },
  { hex: '#7C3AED', nombre: 'Violeta' },
  { hex: '#C026D3', nombre: 'Fucsia' },
  { hex: '#DB2777', nombre: 'Rosa' },
];
const HEX_PALETA = PALETA_BASICA.map((c) => c.hex);

/** "#a1b2c3" o "a1b2c3" → "#A1B2C3"; cualquier otra cosa → null. */
function normalizarColor(valor) {
  const texto = String(valor ?? '').trim();
  const m = texto.match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toUpperCase()}` : null;
}

/**
 * Color aleatorio de la paleta, entre los menos usados.
 * @param usados lista de colores ya asignados (se ignoran los que no son de la paleta)
 * @param azar función que devuelve un número en [0, 1) (para las pruebas)
 */
function colorAleatorio(usados = [], azar = Math.random) {
  const cuenta = new Map(HEX_PALETA.map((hex) => [hex, 0]));
  for (const color of usados) {
    const hex = normalizarColor(color);
    if (cuenta.has(hex)) cuenta.set(hex, cuenta.get(hex) + 1);
  }
  const minimo = Math.min(...cuenta.values());
  const candidatos = HEX_PALETA.filter((hex) => cuenta.get(hex) === minimo);
  return candidatos[Math.floor(azar() * candidatos.length)];
}

/** Color aleatorio para una asignatura nueva, según los que ya usan las demás. */
async function colorAleatorioAsignatura(db) {
  const [filas] = await db.query('SELECT Asignatura_Color AS color FROM asignatura');
  return colorAleatorio(filas.map((f) => f.color));
}

/** Color aleatorio para un docente nuevo, según los que ya usan los demás docentes. */
async function colorAleatorioDocente(db) {
  const [filas] = await db.query('SELECT Docente_Color AS color FROM usuario WHERE Es_Docente = 1');
  return colorAleatorio(filas.map((f) => f.color));
}

/** Color de respaldo (estable por id) si una fila quedó sin color. */
function colorPorDefecto(id) {
  return HEX_PALETA[Math.abs(Number(id) || 0) % HEX_PALETA.length];
}

const MENSAJE_COLOR_INVALIDO = 'El color debe ser un hexadecimal de 6 dígitos (ej: #2563EB)';

module.exports = {
  PALETA_BASICA,
  normalizarColor,
  colorAleatorio,
  colorAleatorioAsignatura,
  colorAleatorioDocente,
  colorPorDefecto,
  MENSAJE_COLOR_INVALIDO,
};
