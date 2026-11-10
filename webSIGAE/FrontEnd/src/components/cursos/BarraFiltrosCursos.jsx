import "./BarraFiltrosCursos.css";

// Barra del listado de cursos:
//   | Ver todo | Kinder | Básica | Media |  ———  | Cambiar período |
// Los tramos filtran por el nivel del curso. "Cambiar período" alterna entre el
// período anterior y el nuevo (durante el cierre conviven el vigente y el
// siguiente); su ícono son dos tarjetas que intercambian lugar con una animación.

export const TRAMOS_CURSO = ["Kinder", "Básica", "Media"];

/** Tramo del curso: el que entrega la API o, si falta, el que corresponde a su nivel. */
export function tramoDelCurso(curso) {
  if (curso.Nivel_Educativo_Tramo) return curso.Nivel_Educativo_Tramo;
  const orden = Number(curso.Nivel_Educativo_Orden);
  if (!orden) return null;
  return orden <= 2 ? "Kinder" : orden <= 8 ? "Básica" : "Media";
}

/**
 * tramo:       "" (todos) | "Kinder" | "Básica" | "Media"
 * conteos:     { "": total, Kinder: n, Básica: n, Media: n } del período que se ve
 * periodos:    [{ valor: "2026", etiqueta: "Vigente" }, { valor: "2027", etiqueta: "Siguiente" }]
 * periodo:     el período que se ve
 * giro:        contador que cambia en cada intercambio (reinicia la animación)
 */
export default function BarraFiltrosCursos({ tramo, onTramo, conteos, periodos, periodo, onCambiarPeriodo, giro }) {
  const opciones = [["", "Ver todo"], ...TRAMOS_CURSO.map((t) => [t, t])];
  const actual = periodos.find((p) => p.valor === periodo) || periodos[0];
  const otro = periodos.find((p) => p.valor !== actual?.valor);
  const puedeCambiar = Boolean(otro);

  return (
    <div className="cursos-barra">
      <div className="cursos-tramos" role="group" aria-label="Filtrar cursos por tramo">
        {opciones.map(([valor, texto]) => (
          <button
            key={valor || "todos"}
            type="button"
            className={`cursos-tramo-btn${tramo === valor ? " activo" : ""}`}
            aria-pressed={tramo === valor}
            onClick={() => onTramo(valor)}
          >
            {texto}
            <span className="cursos-tramo-cuenta">{conteos[valor] ?? 0}</span>
          </button>
        ))}
      </div>

      <span className="cursos-barra-espacio" aria-hidden="true" />

      <button
        type="button"
        className="cursos-cambiar-periodo"
        onClick={onCambiarPeriodo}
        disabled={!puedeCambiar}
        aria-label={puedeCambiar
          ? `Cambiar período: viendo ${actual.valor}, cambiar a ${otro.valor}`
          : `Período ${actual?.valor ?? ""}: no hay otro período para cambiar`}
        title={puedeCambiar
          ? `Ver los cursos de ${otro.valor} (${otro.etiqueta.toLowerCase()})`
          : "Durante el cierre de período se puede cambiar entre el período vigente y el siguiente"}
      >
        <span className="tarjetas-periodo" aria-hidden="true">
          {/* key = giro: cada intercambio vuelve a correr la animación */}
          {otro && (
            <span key={`atras-${giro}`} className={`tarjeta-periodo atras${giro > 0 ? " va-atras" : ""}`}>
              <strong>{otro.valor}</strong>
              <small>{otro.etiqueta}</small>
            </span>
          )}
          {actual && (
            <span key={`frente-${giro}`} className={`tarjeta-periodo frente${giro > 0 ? " viene-al-frente" : ""}`}>
              <strong>{actual.valor}</strong>
              <small>{actual.etiqueta}</small>
            </span>
          )}
        </span>
        <span className="cursos-cambiar-texto">
          Cambiar período
          <small>{puedeCambiar ? `Viendo ${actual.valor} · ⇄ ${otro.valor}` : `Solo ${actual?.valor ?? "—"}`}</small>
        </span>
      </button>
    </div>
  );
}
