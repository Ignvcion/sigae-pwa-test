// Regla 65/35 con horas P.I.E. Debe coincidir con BackEnd/utils/cargaLectiva.js:
// máximo de clases = 65 % de (carga − horas P.I.E.), redondeado hacia abajo y
// contado en horas pedagógicas (cada bloque de clase = 1).

export function calcularCargaLectiva(carga, horasPIE = 0) {
  if (carga === null || carga === undefined || carga === "") return null;
  const total = Number(carga);
  if (!Number.isFinite(total)) return null;
  const pie = Math.max(0, Number(horasPIE) || 0);
  const disponibles = Math.max(0, total - pie);
  const maxLectivas = Math.floor(disponibles * 0.65 + 1e-9);
  return { carga: total, horasPIE: pie, disponibles, maxLectivas, noLectivas: disponibles - maxLectivas };
}

export const textoClases = (n) => `${n} ${n === 1 ? "clase" : "clases"}`;

/** "44 h − 3 h P.I.E. = 41 h → 26 clases (65 %) y 15 h no lectivas (35 %)" */
export function textoReparto(info) {
  if (!info) return "";
  const base = info.horasPIE > 0
    ? `${info.carga} h − ${info.horasPIE} h P.I.E. = ${info.disponibles} h`
    : `${info.carga} h`;
  return `${base} → ${textoClases(info.maxLectivas)} (65 %) y ${info.noLectivas} h no lectivas (35 %)`;
}

/** Valida las horas P.I.E. (entero ≥ 0 que no supera la carga); "" si están bien. */
export function errorHorasPIE(valor, carga) {
  if (valor === "" || valor === null || valor === undefined) return "";
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) return "Las horas P.I.E. deben ser un número entero igual o mayor a 0";
  if (carga !== "" && carga != null && n > Number(carga)) return `No pueden superar la carga horaria semanal (${carga} h)`;
  return "";
}
