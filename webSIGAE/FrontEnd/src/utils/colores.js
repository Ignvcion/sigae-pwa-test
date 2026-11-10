// Colores de asignaturas y docentes. Debe coincidir con BackEnd/utils/colores.js.

export const PALETA_BASICA = [
  { hex: "#DC2626", nombre: "Rojo" },
  { hex: "#EA580C", nombre: "Naranja" },
  { hex: "#CA8A04", nombre: "Amarillo" },
  { hex: "#65A30D", nombre: "Lima" },
  { hex: "#16A34A", nombre: "Verde" },
  { hex: "#0D9488", nombre: "Turquesa" },
  { hex: "#0284C7", nombre: "Celeste" },
  { hex: "#2563EB", nombre: "Azul" },
  { hex: "#4F46E5", nombre: "Índigo" },
  { hex: "#7C3AED", nombre: "Violeta" },
  { hex: "#C026D3", nombre: "Fucsia" },
  { hex: "#DB2777", nombre: "Rosa" },
];
const HEX_PALETA = PALETA_BASICA.map((c) => c.hex);

/** "#a1b2c3" o "a1b2c3" → "#A1B2C3"; cualquier otra cosa → null. */
export function normalizarColor(valor) {
  const m = String(valor ?? "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toUpperCase()}` : null;
}

/** Color aleatorio de la paleta, entre los menos usados por `usados`. */
export function colorAleatorio(usados = []) {
  const cuenta = new Map(HEX_PALETA.map((hex) => [hex, 0]));
  usados.forEach((c) => {
    const hex = normalizarColor(c);
    if (cuenta.has(hex)) cuenta.set(hex, cuenta.get(hex) + 1);
  });
  const minimo = Math.min(...cuenta.values());
  const candidatos = HEX_PALETA.filter((hex) => cuenta.get(hex) === minimo);
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}

/** Nombre del color si es de la paleta ("Azul"); si no, el hexadecimal. */
export function nombreColor(hex) {
  const n = normalizarColor(hex);
  return PALETA_BASICA.find((c) => c.hex === n)?.nombre || n || "";
}

// ── Tonos derivados ──────────────────────────────────────────────────────────
const aRGB = (hex) => {
  const n = normalizarColor(hex) || "#2563EB";
  return [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const aHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const mezclar = (rgb, con, proporcion) => rgb.map((v, i) => v + (con[i] - v) * proporcion);
const BLANCO = [255, 255, 255];
const NEGRO = [0, 0, 0];

function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texto legible (blanco o casi negro) sobre un fondo del color `hex`. */
export function textoSobre(hex) {
  const rgb = aRGB(hex);
  return contraste(rgb, BLANCO) >= contraste(rgb, [17, 24, 39]) ? "#FFFFFF" : "#111827";
}

const cacheTonos = new Map();
/**
 * Tonos para pintar un bloque de horario con el color `hex`:
 * { bg: fondo claro, border: borde intermedio, text: texto oscuro legible (contraste ≥ 4.5), solido: hex }.
 * Mismo formato que la antigua paleta COLORES_ASIGNATURA de utils/horarios.js.
 */
export function tonosDesdeHex(hex) {
  const solido = normalizarColor(hex) || "#2563EB";
  if (cacheTonos.has(solido)) return cacheTonos.get(solido);
  const rgb = aRGB(solido);
  const bg = mezclar(rgb, BLANCO, 0.85);
  const border = mezclar(rgb, BLANCO, 0.5);
  // Se oscurece hasta que el texto se lea bien sobre el fondo claro
  let proporcion = 0.35;
  let text = mezclar(rgb, NEGRO, proporcion);
  while (contraste(text, bg) < 4.5 && proporcion < 0.95) {
    proporcion += 0.05;
    text = mezclar(rgb, NEGRO, proporcion);
  }
  const tonos = { bg: aHex(bg), border: aHex(border), text: aHex(text), solido };
  cacheTonos.set(solido, tonos);
  return tonos;
}
