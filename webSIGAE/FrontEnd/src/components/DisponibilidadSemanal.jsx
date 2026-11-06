import "./DisponibilidadSemanal.css";

// CU107: disponibilidad laboral semanal del docente, en tramos "desde–hasta" por día.
// Los tramos incluyen recreos y horas sin clases (corregir pruebas, reuniones).
// Debajo, la vista por bloques de 45 minutos muestra qué bloques de clase quedan
// cubiertos: un bloque está disponible si cae completo dentro de un tramo.
// El patrón se repite todas las semanas del período, igual que la carga horaria semanal.
// Solo el administrador la edita; el docente la ve en su perfil (soloLectura).

const aMin = (h) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const redondear = (h) => Math.round(h * 100) / 100;

/** Tramos de un día como minutos, unidos si se tocan o superponen. */
function tramosUnidos(tramos, dia) {
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

const cubre = (unidos, inicio, fin) => unidos.some((t) => t.inicio <= aMin(inicio) && aMin(fin) <= t.fin);

/** Primer error de los tramos (para bloquear el guardado), o "" si están bien. */
export function errorTramos(tramos, dias) {
  for (const dia of dias) {
    const delDia = tramos.filter((t) => t.dia === dia);
    for (const t of delDia) {
      const i = aMin(t.hora_inicio);
      const f = aMin(t.hora_fin);
      if (Number.isNaN(i) || Number.isNaN(f)) return `Completa las horas de los tramos del ${dia}`;
      if (f - i < 15) return `El ${dia} tiene un tramo cuya hora de término no es posterior a la de inicio`;
    }
    const orden = delDia.map((t) => [aMin(t.hora_inicio), aMin(t.hora_fin)]).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < orden.length; k += 1) {
      if (orden[k][0] < orden[k - 1][1]) return `El ${dia} tiene tramos que se superponen`;
    }
  }
  return "";
}

function DisponibilidadSemanal({
  dias = [],
  bloques = [],
  jornada,
  limites = { minimo: "06:00", maximo: "23:00" },
  tramos = [],
  onChange,
  cargaSemanal,
  clases = [],
  periodo,
  periodos,
  onCambiarPeriodo,
  soloLectura = false,
}) {
  const unidosPorDia = new Map(dias.map((d) => [d, tramosUnidos(tramos, d)]));
  const horasDia = (d) => redondear(unidosPorDia.get(d).reduce((acc, t) => acc + (t.fin - t.inicio) / 60, 0));
  const horasDisponibles = redondear(dias.reduce((acc, d) => acc + horasDia(d), 0));
  const carga = cargaSemanal === "" || cargaSemanal === null || cargaSemanal === undefined ? null : Number(cargaSemanal);
  const sinRestriccion = tramos.length === 0;
  const adeudadas = !sinRestriccion && carga !== null && !Number.isNaN(carga) ? redondear(Math.max(0, carga - horasDisponibles)) : 0;
  const clasesFuera = sinRestriccion ? [] : clases.filter((c) => !cubre(unidosPorDia.get(c.dia) || [], c.hora_inicio, c.hora_fin));
  const error = soloLectura ? "" : errorTramos(tramos, dias);
  const jornadaTexto = jornada ? `${jornada.inicio}–${jornada.fin}` : "";

  const conIndices = tramos.map((t, i) => ({ ...t, i }));
  const actualizar = (i, cambios) => onChange(tramos.map((t, k) => (k === i ? { ...t, ...cambios } : t)));
  const quitar = (i) => onChange(tramos.filter((_, k) => k !== i));
  const agregar = (dia) => {
    const delDia = unidosPorDia.get(dia);
    const ultimo = delDia[delDia.length - 1];
    // Sugerencia: la jornada institucional o, si ya hay tramos, una hora después del último
    const inicio = ultimo ? Math.min(ultimo.fin + 30, aMin(limites.maximo) - 60) : aMin(jornada?.inicio || "08:00");
    const fin = ultimo ? Math.min(inicio + 60, aMin(limites.maximo)) : aMin(jornada?.fin || "17:00");
    onChange([...tramos, { dia, hora_inicio: aHora(inicio), hora_fin: aHora(fin) }]);
  };
  const jornadaCompleta = () => {
    if (!jornada) return;
    onChange(dias.map((dia) => ({ dia, hora_inicio: jornada.inicio, hora_fin: jornada.fin })));
  };
  const copiarPrimerDia = () => {
    const base = tramos.filter((t) => t.dia === dias[0]);
    onChange([...base, ...dias.slice(1).flatMap((dia) => base.map((t) => ({ ...t, dia })))]);
  };
  // Clic en un bloque no cubierto: agrega su horario, uniéndolo a un tramo vecino si lo toca
  const agregarBloque = (dia, b) => {
    const i0 = aMin(b.hora_inicio);
    const f0 = aMin(b.hora_fin);
    const vecino = conIndices.find((t) => t.dia === dia && aMin(t.hora_inicio) <= f0 && i0 <= aMin(t.hora_fin));
    if (vecino) {
      actualizar(vecino.i, {
        hora_inicio: aHora(Math.min(aMin(vecino.hora_inicio), i0)),
        hora_fin: aHora(Math.max(aMin(vecino.hora_fin), f0)),
      });
    } else {
      onChange([...tramos, { dia, hora_inicio: b.hora_inicio, hora_fin: b.hora_fin }]);
    }
  };

  const clasesPorCelda = new Map();
  for (const c of clases) {
    const k = `${c.dia}|${c.Bloque_Horario_Id}`;
    clasesPorCelda.set(k, [...(clasesPorCelda.get(k) || []), c]);
  }

  return (
    <div className={`disp-semanal${soloLectura ? " disp-semanal--lectura" : ""}`}>
      <div className="disp-encabezado">
        {periodos?.siguiente && onCambiarPeriodo ? (
          <label className="disp-periodo">
            Período
            <select value={periodo} onChange={(e) => onCambiarPeriodo(e.target.value)}>
              <option value={periodos.vigente}>{periodos.vigente} (vigente)</option>
              <option value={periodos.siguiente}>{periodos.siguiente} (siguiente)</option>
            </select>
          </label>
        ) : (
          periodo && <span className="disp-periodo">Período {periodo}</span>
        )}
        {!soloLectura && (
          <div className="disp-acciones">
            {jornada && (
              <button type="button" className="disp-accion" onClick={jornadaCompleta} title="Reemplaza todos los tramos">
                Jornada {jornadaTexto} toda la semana
              </button>
            )}
            <button
              type="button"
              className="disp-accion"
              onClick={copiarPrimerDia}
              disabled={!tramos.some((t) => t.dia === dias[0])}
              title={`Copia los tramos del ${dias[0]} al resto de los días`}
            >
              Copiar {dias[0]?.toLowerCase()} al resto
            </button>
            <button type="button" className="disp-accion" onClick={() => onChange([])} disabled={tramos.length === 0}>
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Tramos por día */}
      <ul className="disp-dias">
        {dias.map((dia) => {
          const delDia = conIndices.filter((t) => t.dia === dia);
          return (
            <li key={dia} className="disp-dia">
              <span className="disp-dia-nombre">{dia}</span>
              <div className="disp-tramos">
                {delDia.length === 0 && <span className="disp-sin-tramos">{sinRestriccion ? "—" : "No disponible"}</span>}
                {delDia.map((t) =>
                  soloLectura ? (
                    <span key={t.i} className="disp-tramo disp-tramo--lectura">{t.hora_inicio}–{t.hora_fin}</span>
                  ) : (
                    <span key={t.i} className="disp-tramo">
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
              <span className="disp-dia-horas">{horasDia(dia) > 0 ? `${horasDia(dia)} h` : ""}</span>
            </li>
          );
        })}
      </ul>

      {error && <p className="input-error-msg" role="alert">{error}</p>}

      <div className="disp-resumen">
        {sinRestriccion ? (
          <p className="disp-nota">
            {soloLectura
              ? "Sin disponibilidad registrada: se le pueden asignar clases en cualquier bloque."
              : "Sin disponibilidad registrada: el docente puede asignarse en cualquier bloque."}
          </p>
        ) : (
          <p>
            Disponible <strong>{horasDisponibles} h</strong> a la semana
            {carga !== null && !Number.isNaN(carga) && <> · carga horaria semanal <strong>{carga} h</strong></>}
          </p>
        )}
        {adeudadas > 0 && (
          <p className="disp-aviso" role="status">
            ⚠ Debe {adeudadas} h: la disponibilidad no alcanza la carga horaria semanal.{!soloLectura && " Se puede guardar igual."}
          </p>
        )}
        {clasesFuera.length > 0 && (
          <p className="disp-aviso" role="status">
            ⚠ {clasesFuera.length} clase(s) asignada(s) quedan fuera de la disponibilidad
            {!soloLectura && " y se mantienen"}: {clasesFuera.map((c) => `${c.dia} ${c.hora_inicio} ${c.asignatura} (${c.curso})`).join("; ")}.
          </p>
        )}
      </div>

      {/* Vista por bloques de 45 minutos */}
      {bloques.length > 0 && (
        <details className="disp-vista-bloques" open>
          <summary>Vista por bloques de clase</summary>
          <p className="disp-nota">
            Un bloque está disponible si cae completo dentro de un tramo.
            {!soloLectura && " Haz clic en un bloque libre para sumarlo a la disponibilidad."}
          </p>
          <div className="disp-tabla-wrap">
            <table className="disp-tabla">
              <thead>
                <tr>
                  <th scope="col">Bloque</th>
                  {dias.map((d) => <th key={d} scope="col">{d.slice(0, 3)}</th>)}
                </tr>
              </thead>
              <tbody>
                {bloques.map((b) => {
                  const recreo = b.tipo === "Recreo";
                  return (
                    <tr key={b.Bloque_Horario_Id} className={recreo ? "disp-fila-recreo" : ""}>
                      <th scope="row">
                        {b.hora_inicio}–{b.hora_fin}
                        {recreo && <span className="disp-etiqueta-recreo">Recreo</span>}
                      </th>
                      {dias.map((d) => {
                        // Sin tramos registrados no hay restricción: nada se marca como fuera
                        const cubierto = cubre(unidosPorDia.get(d), b.hora_inicio, b.hora_fin);
                        const enCelda = clasesPorCelda.get(`${d}|${b.Bloque_Horario_Id}`) || [];
                        const fuera = enCelda.length > 0 && !cubierto && !sinRestriccion;
                        const texto = enCelda.length > 0 ? (fuera ? "⚠ Clase" : "Clase") : cubierto ? "✓" : "";
                        const clase = `disp-celda${cubierto ? " disp-celda--on" : ""}${fuera ? " disp-celda--fuera" : ""}`;
                        const titulo = enCelda.map((c) => `${c.asignatura} · ${c.curso}`).join("\n") || undefined;
                        const puedeSumar = !soloLectura && !recreo && !cubierto;
                        return (
                          <td key={d}>
                            {puedeSumar ? (
                              <button
                                type="button"
                                className={clase}
                                title={titulo || "Sumar este bloque"}
                                aria-label={`Sumar ${d} ${b.hora_inicio} a ${b.hora_fin}`}
                                onClick={() => agregarBloque(d, b)}
                              >
                                {texto}
                              </button>
                            ) : (
                              <span className={clase} title={titulo}>{texto}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="disp-nota">La disponibilidad se repite todas las semanas del período.</p>
    </div>
  );
}

export default DisponibilidadSemanal;
