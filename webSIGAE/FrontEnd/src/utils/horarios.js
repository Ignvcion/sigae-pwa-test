// Utilidades compartidas por las vistas de horario semanal (docente / estudiante)

export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

// Paleta por asignatura del creador de horarios: el índice es la posición de
// la asignatura en el plan del curso (/api/horarios/asignaturas-curso)
export const COLORES_ASIGNATURA = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#9d174d" },
  { bg: "#d1fae5", border: "#6ee7b7", text: "#064e3b" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#5b21b6" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
  { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
  { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  { bg: "#ffedd5", border: "#fdba74", text: "#9a3412" },
];

// Clase pendiente de reubicar (su bloque fue reemplazado o quedó fuera de la jornada)
export const COLOR_PENDIENTE = { bg: "#fefce8", border: "#fde047", text: "#854d0e" };

export function aMinutos(hora) {
  if (!hora) return 0;
  const [h, m] = String(hora).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function hhmm(hora) {
  return hora ? String(hora).slice(0, 5) : "";
}

export function minutosAHHMM(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function seSolapan(a, b) {
  return aMinutos(a.horaInicio) < aMinutos(b.horaFin) && aMinutos(b.horaInicio) < aMinutos(a.horaFin);
}

/**
 * Topes de horario: pares de clases activas del mismo día cuyos horarios se
 * solapan (ej. un docente con dos clases al mismo tiempo en cursos distintos).
 * Las clases suspendidas o inactivas no generan tope.
 */
export function detectarTopes(clases) {
  const activas = clases.filter((c) => !c.estado || c.estado === "Activo");
  const topes = [];

  for (let i = 0; i < activas.length; i++) {
    for (let j = i + 1; j < activas.length; j++) {
      const a = activas[i];
      const b = activas[j];
      // RNF17: electivos simultáneos de 3° y 4° medio no son tope (cada estudiante cursa uno)
      if (a.electivo && b.electivo) continue;
      if (a.dia === b.dia && seSolapan(a, b)) {
        topes.push({ dia: a.dia, clases: [a, b] });
      }
    }
  }

  return topes;
}
