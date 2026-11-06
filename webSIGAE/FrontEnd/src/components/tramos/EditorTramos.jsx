import { aHora, aMin, tramosUnidos } from "./tramos";

// Editor de tramos "desde–hasta" por día (lunes a viernes). En solo lectura muestra los
// tramos como etiquetas. `detalleDia(dia)` agrega un texto a la derecha de cada día
// (horas, citaciones posibles, etc.).
function EditorTramos({
  dias,
  tramos,
  onChange,
  soloLectura = false,
  limites = { minimo: "06:00", maximo: "23:00" },
  sugerencia = { inicio: "08:00", fin: "17:00" },
  vacio = "No disponible",
  detalleDia,
  variante = "",
}) {
  const conIndices = tramos.map((t, i) => ({ ...t, i }));
  const actualizar = (i, cambios) => onChange(tramos.map((t, k) => (k === i ? { ...t, ...cambios } : t)));
  const quitar = (i) => onChange(tramos.filter((_, k) => k !== i));
  const agregar = (dia) => {
    const unidos = tramosUnidos(tramos, dia);
    const ultimo = unidos[unidos.length - 1];
    const max = aMin(limites.maximo);
    // Sugerencia: el horario por defecto o, si ya hay tramos, una hora después del último
    const inicio = ultimo ? Math.min(ultimo.fin + 30, max - 60) : aMin(sugerencia.inicio);
    const fin = ultimo ? Math.min(inicio + 60, max) : aMin(sugerencia.fin);
    onChange([...tramos, { dia, hora_inicio: aHora(inicio), hora_fin: aHora(fin) }]);
  };

  return (
    <ul className="disp-dias">
      {dias.map((dia) => {
        const delDia = conIndices.filter((t) => t.dia === dia);
        return (
          <li key={dia} className="disp-dia">
            <span className="disp-dia-nombre">{dia}</span>
            <div className="disp-tramos">
              {delDia.length === 0 && <span className="disp-sin-tramos">{vacio}</span>}
              {delDia.map((t) =>
                soloLectura ? (
                  <span key={t.i} className={`disp-tramo disp-tramo--lectura ${variante}`}>{t.hora_inicio}–{t.hora_fin}</span>
                ) : (
                  <span key={t.i} className={`disp-tramo ${variante}`}>
                    <input
                      type="time"
                      step="300"
                      min={limites.minimo}
                      max={limites.maximo}
                      value={t.hora_inicio}
                      aria-label={`${dia}: desde`}
                      onChange={(e) => actualizar(t.i, { hora_inicio: e.target.value })}
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="time"
                      step="300"
                      min={limites.minimo}
                      max={limites.maximo}
                      value={t.hora_fin}
                      aria-label={`${dia}: hasta`}
                      onChange={(e) => actualizar(t.i, { hora_fin: e.target.value })}
                    />
                    <button type="button" className="disp-quitar" aria-label={`Quitar tramo del ${dia}`} onClick={() => quitar(t.i)}>
                      ×
                    </button>
                  </span>
                )
              )}
              {!soloLectura && (
                <button type="button" className="disp-agregar" onClick={() => agregar(dia)}>+ Tramo</button>
              )}
            </div>
            <span className="disp-dia-horas">{detalleDia ? detalleDia(dia) : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default EditorTramos;
