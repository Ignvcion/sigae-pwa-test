// Utilidades de tramos horarios "desde–hasta" por día (disponibilidad laboral CU107 y
// horario de atención de apoderados RF55). Las horas van como "HH:MM".

export const aMin = (h) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export const aHora = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Horario de atención de apoderados: duraciones sugeridas de un tramo (1 hora y 2 horas).
// El servidor las envía como `duracionesSugeridas`; estas son el respaldo.
export const DURACIONES_SUGERIDAS = [60, 120];

export const redondear = (h) => Math.round(h * 100) / 100;

/** Tramos de un día como minutos, unidos si se tocan o se superponen. */
export function tramosUnidos(tramos, dia) {
  const orden = tramos
    .filter((t) => t.dia === dia)
    .map((t) => ({ inicio: aMin(t.hora_inicio), fin: aMin(t.hora_fin) }))
    .filter((t) => t.fin > t.inicio)
    .sort((a, b) => a.inicio - b.inicio);
  const unidos = [];
  for (const t of orden) {
    const u = unidos[unidos.length - 1];
    if (u && t.inicio <= u.fin) u.fin = Math.max(u.fin, t.fin);
    else unidos.push({ ...t });
  }
  return unidos;
}

/** ¿El intervalo [inicio, fin) cabe completo en alguno de los tramos unidos? */
export const cubre = (unidos, inicio, fin) => unidos.some((t) => t.inicio <= aMin(inicio) && aMin(fin) <= t.fin);

/** ¿El intervalo [inicio, fin) toca alguno de los tramos unidos? */
export const toca = (unidos, inicio, fin) => unidos.some((t) => t.inicio < aMin(fin) && aMin(inicio) < t.fin);

/** Horas de los tramos de un día (sin contar dos veces lo superpuesto). */
export const horasDelDia = (tramos, dia) =>
  redondear(tramosUnidos(tramos, dia).reduce((acc, t) => acc + (t.fin - t.inicio) / 60, 0));

/** Primer error de los tramos (para bloquear el guardado), o "" si están bien. */
export function errorTramos(tramos, dias, { minDuracion = 15 } = {}) {
  for (const dia of dias) {
    const delDia = tramos.filter((t) => t.dia === dia);
    for (const t of delDia) {
      const i = aMin(t.hora_inicio);
      const f = aMin(t.hora_fin);
      if (Number.isNaN(i) || Number.isNaN(f)) return `Completa las horas de los tramos del ${dia}`;
      if (f - i < minDuracion) {
        return `El ${dia} tiene un tramo que no dura al menos ${minDuracion} minutos (revisa que el término sea posterior al inicio)`;
      }
    }
    const orden = delDia.map((t) => [aMin(t.hora_inicio), aMin(t.hora_fin)]).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < orden.length; k += 1) {
      if (orden[k][0] < orden[k - 1][1]) return `El ${dia} tiene tramos que se superponen`;
    }
  }
  return "";
}

/**
 * Agrega el intervalo de un bloque a los tramos del día: si toca o se superpone con un
 * tramo existente lo extiende; si no, crea uno nuevo.
 */
export function sumarIntervalo(tramos, dia, horaInicio, horaFin) {
  const i0 = aMin(horaInicio);
  const f0 = aMin(horaFin);
  const k = tramos.findIndex((t) => t.dia === dia && aMin(t.hora_inicio) <= f0 && i0 <= aMin(t.hora_fin));
  if (k === -1) return [...tramos, { dia, hora_inicio: horaInicio, hora_fin: horaFin }];
  return tramos.map((t, j) => (j === k
    ? { ...t, hora_inicio: aHora(Math.min(aMin(t.hora_inicio), i0)), hora_fin: aHora(Math.max(aMin(t.hora_fin), f0)) }
    : t));
}
