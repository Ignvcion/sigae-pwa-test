// RF36, RF38, RF43, RF44: identifica el período de un curso en las vistas de gestión
// del administrador. "Vigente" es el año en curso; "Futuro" es el período siguiente que
// se prepara durante el cierre. `esquina` la ubica arriba a la derecha de su contenedor
// (que debe tener position: relative).
function EtiquetaPeriodo({ periodo, estado, esquina = false, compacta = false }) {
  if (!estado || estado === "Anterior") return null;
  const futuro = estado === "Futuro";
  const texto = futuro ? "Futuro" : "Vigente";
  return (
    <span
      className={`etiqueta-periodo etiqueta-periodo--${futuro ? "futuro" : "vigente"}${esquina ? " etiqueta-periodo--esquina" : ""}`}
      title={futuro ? `Período ${periodo}: siguiente, en preparación durante el cierre` : `Período ${periodo}: vigente`}
    >
      {compacta ? texto : `${texto} ${periodo}`}
    </span>
  );
}

/** Texto para un <option>, donde no caben etiquetas: " · Futuro 2027". */
export const textoPeriodo = (periodo, estado) =>
  !estado || estado === "Anterior" ? "" : ` · ${estado === "Futuro" ? "Futuro" : "Vigente"} ${periodo}`;

export default EtiquetaPeriodo;
