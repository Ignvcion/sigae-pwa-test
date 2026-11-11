import EditorTramos from "./tramos/EditorTramos";
import { DURACIONES_SUGERIDAS, aMin, cubre, errorTramos, horasDelDia, redondear, tramosUnidos } from "./tramos/tramos";
import "./DisponibilidadSemanal.css";

// RF55: horario de atención de apoderados que el administrador deja al registrar al docente.
// Mismas reglas que la edición del propio docente (HorarioAtencionSemanal), salvo los
// choques con clases: un docente nuevo todavía no tiene clases asignadas.
//   - entre 08:00 y 18:00, sin superponerse y con espacio para al menos una citación de 30 min;
//   - dentro de la disponibilidad laboral que se ingresa en el mismo formulario (si tiene).
// Cada tramo sugiere duraciones de 1 hora y 2 horas.

const LIMITES = { minimo: "08:00", maximo: "18:00" };
const DURACION_CITACION = 30;

/** Citaciones de 30 minutos (en punto o y media) que caben en un tramo. */
const citasEnTramo = (inicio, fin, paso = DURACION_CITACION) => {
  let n = 0;
  for (let t = Math.ceil(inicio / paso) * paso; t + paso <= fin; t += paso) n += 1;
  return n;
};

/** Problemas del horario de atención (vacío si se puede guardar). */
export function erroresHorarioAtencion(tramos, dias, { limites = LIMITES, disponibilidad = [], duracionCitacion = DURACION_CITACION } = {}) {
  const error = errorTramos(tramos, dias, { minDuracion: duracionCitacion });
  if (error) return [error];
  const conDisponibilidad = disponibilidad.length > 0;
  const avisos = [];
  for (const t of tramos) {
    const i = aMin(t.hora_inicio);
    const f = aMin(t.hora_fin);
    const tramo = `${t.dia} ${t.hora_inicio}–${t.hora_fin}`;
    if (i < aMin(limites.minimo) || f > aMin(limites.maximo)) {
      avisos.push(`${tramo}: debe estar entre las ${limites.minimo} y las ${limites.maximo}`);
    } else if (citasEnTramo(i, f, duracionCitacion) === 0) {
      avisos.push(`${tramo}: no incluye ninguna citación de ${duracionCitacion} minutos (en punto o y media)`);
    }
    if (conDisponibilidad && !cubre(tramosUnidos(disponibilidad, t.dia), t.hora_inicio, t.hora_fin)) {
      avisos.push(`${tramo}: queda fuera de la disponibilidad laboral del docente`);
    }
  }
  return avisos;
}

function HorarioAtencionRegistro({ dias, tramos, onChange, disponibilidad = [], opciones }) {
  const limites = opciones?.limites || LIMITES;
  const duraciones = opciones?.duracionesSugeridas || DURACIONES_SUGERIDAS;
  const duracionCitacion = opciones?.duracionCitacion || DURACION_CITACION;

  const avisos = erroresHorarioAtencion(tramos, dias, { limites, disponibilidad, duracionCitacion });
  const citasDia = (d) => tramosUnidos(tramos, d).reduce((acc, t) => acc + citasEnTramo(t.inicio, t.fin, duracionCitacion), 0);
  const totalCitas = dias.reduce((acc, d) => acc + citasDia(d), 0);
  const horas = redondear(dias.reduce((acc, d) => acc + horasDelDia(tramos, d), 0));

  // El primer tramo de cada día parte al inicio de la disponibilidad (o a las 14:00) y dura 1 hora
  const primeraDisp = [...disponibilidad].sort((a, b) => aMin(a.hora_inicio) - aMin(b.hora_inicio))[0];
  const sugerencia = { inicio: primeraDisp?.hora_inicio || "14:00", fin: primeraDisp?.hora_fin || "15:00" };

  return (
    <div className="disp-semanal disp-semanal--atencion">
      <div className="disp-encabezado">
        <span className="disp-periodo">
          {disponibilidad.length > 0
            ? "Debe quedar dentro de la disponibilidad laboral indicada arriba."
            : `Entre las ${limites.minimo} y las ${limites.maximo}.`}
        </span>
        <div className="disp-acciones">
          <button
            type="button"
            className="disp-accion"
            disabled={!tramos.some((t) => t.dia === dias[0])}
            title={`Copia los tramos del ${dias[0]} al resto de los días`}
            onClick={() => {
              const base = tramos.filter((t) => t.dia === dias[0]);
              onChange([...base, ...dias.slice(1).flatMap((dia) => base.map((t) => ({ ...t, dia })))]);
            }}
          >
            Copiar {dias[0]?.toLowerCase()} al resto
          </button>
          <button type="button" className="disp-accion" onClick={() => onChange([])} disabled={tramos.length === 0}>
            Limpiar
          </button>
        </div>
      </div>

      <EditorTramos
        dias={dias}
        tramos={tramos}
        onChange={onChange}
        limites={limites}
        variante="disp-tramo--atencion"
        sugerencia={sugerencia}
        duraciones={duraciones}
        vacio="Sin atención"
        detalleDia={(d) => (citasDia(d) > 0 ? `${horasDelDia(tramos, d)} h · ${citasDia(d)} ${citasDia(d) === 1 ? "cita" : "citas"}` : "")}
      />

      {avisos.length > 0 && (
        <div className="disp-aviso" role="alert">
          {avisos.map((a) => <div key={a}>⚠ {a}</div>)}
        </div>
      )}

      <div className="disp-resumen">
        {tramos.length === 0 ? (
          <p className="disp-nota">Sin horario de atención: el docente podrá configurarlo después desde su perfil.</p>
        ) : (
          <p>
            Atiende <strong>{horas} h</strong> a la semana · los apoderados podrán elegir entre{" "}
            <strong>{totalCitas}</strong> {totalCitas === 1 ? "citación" : "citaciones"} de {duracionCitacion} minutos por semana.
          </p>
        )}
      </div>
    </div>
  );
}

export default HorarioAtencionRegistro;
