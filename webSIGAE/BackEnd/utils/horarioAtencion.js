// utils/horarioAtencion.js
// Reglas del horario de atención de apoderados del docente (RF55 / CU87, CU88) que
// comparten la edición por el propio docente (controllers/horarioAtencionController.js)
// y el registro del docente por un administrador (usuarioController.createUsuario).
const { normalizarTramos, unirTramos, cabeEnTramos, aHora } = require('./disponibilidadLaboral');
const { DIAS_SEMANA } = require('./disponibilidadDocente');

const INICIO_ATENCION = 8 * 60;   // 08:00
const FIN_ATENCION = 18 * 60;     // 18:00
const PASO_MINUTOS = 30;          // duración de una citación (en punto o y media)
// Duraciones que se sugieren al armar un tramo de atención: 1 hora y 2 horas
const DURACIONES_SUGERIDAS = [60, 120];

/** ¿El tramo [inicio, fin) incluye al menos una citación de 30 minutos en punto o y media? */
const alcanzaParaCitacion = (inicio, fin) => Math.ceil(inicio / PASO_MINUTOS) * PASO_MINUTOS + PASO_MINUTOS <= fin;

/** Límites y sugerencias que usa el frontend para armar los tramos de atención. */
const opcionesAtencion = () => ({
  limites: { minimo: aHora(INICIO_ATENCION), maximo: aHora(FIN_ATENCION) },
  duracionCitacion: PASO_MINUTOS,
  duracionesSugeridas: DURACIONES_SUGERIDAS,
});

/**
 * Normaliza los tramos de atención (lista o { tramos }): días hábiles, entre 08:00 y 18:00,
 * sin superponerse y con espacio para al menos una citación.
 * Devuelve { ok: true, tramos: [{ dia, inicio, fin }] } o { ok: false, mensaje }.
 */
function normalizarHorarioAtencion(valor) {
  const lista = Array.isArray(valor) ? valor : valor?.tramos;
  const normalizados = normalizarTramos(lista, {
    minimo: INICIO_ATENCION,
    maximo: FIN_ATENCION,
    minDuracion: PASO_MINUTOS,
    nombre: 'El horario de atención',
  });
  if (!normalizados.ok) return normalizados;
  const sinCitacion = normalizados.tramos.find((t) => !alcanzaParaCitacion(t.inicio, t.fin));
  if (sinCitacion) {
    return {
      ok: false,
      mensaje: `El tramo ${sinCitacion.dia} ${aHora(sinCitacion.inicio)}–${aHora(sinCitacion.fin)} no incluye `
        + 'ninguna citación de 30 minutos (en punto o y media)',
    };
  }
  return normalizados;
}

/**
 * CU107: mensajes de los tramos de atención que quedan fuera de la disponibilidad laboral
 * (`disponibilidad`: tramos { dia, inicio, fin }). Sin disponibilidad no hay restricción.
 */
function tramosFueraDeDisponibilidad(tramos, disponibilidad) {
  if (!disponibilidad || disponibilidad.length === 0) return [];
  const porDia = new Map(DIAS_SEMANA.map((d) => [d, unirTramos(disponibilidad.filter((t) => t.dia === d))]));
  return tramos
    .filter((t) => !cabeEnTramos(porDia.get(t.dia) || [], t.inicio, t.fin))
    .map((t) => {
      const libres = (porDia.get(t.dia) || []).map((x) => `${aHora(x.inicio)}–${aHora(x.fin)}`).join(' y ');
      return { tramo: t, libres };
    });
}

/** Reemplaza el horario de atención del docente. Usar dentro de una transacción. */
async function guardarHorarioAtencionDocente(conn, docenteId, tramos) {
  await conn.query('DELETE FROM horario_atencion WHERE Docente_Usuario_Id = ?', [docenteId]);
  if (tramos.length > 0) {
    await conn.query(
      `INSERT INTO horario_atencion
         (Horario_Atencion_Dia_Semana, Horario_Atencion_Hora_Inicio, Horario_Atencion_Hora_Fin, Docente_Usuario_Id)
       VALUES ?`,
      [tramos.map((t) => [t.dia, aHora(t.inicio), aHora(t.fin), docenteId])]
    );
  }
}

module.exports = {
  INICIO_ATENCION,
  FIN_ATENCION,
  PASO_MINUTOS,
  DURACIONES_SUGERIDAS,
  alcanzaParaCitacion,
  opcionesAtencion,
  normalizarHorarioAtencion,
  tramosFueraDeDisponibilidad,
  guardarHorarioAtencionDocente,
};
