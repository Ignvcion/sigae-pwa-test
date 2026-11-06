import "./DisponibilidadSemanal.css";

// CU107: disponibilidad laboral semanal del docente. Grilla de días × bloques de clase:
// cada celda marcada es un bloque en que el docente puede trabajar en el colegio.
// El patrón se repite todas las semanas del período, igual que la carga horaria semanal.
// Solo la edita el administrador (registro de docente y edición de su perfil).

const clave = (dia, bloqueId) => `${dia}|${Number(bloqueId)}`;
const redondear = (h) => Math.round(h * 100) / 100;

function DisponibilidadSemanal({
  dias = [],
  bloques = [],
  seleccion = [],
  onChange,
  cargaSemanal,
  clases = [],
  periodo,
  periodos,
  onCambiarPeriodo,
}) {
  const marcadas = new Set(seleccion.map((s) => clave(s.dia, s.Bloque_Horario_Id)));
  const clasesPorCelda = new Map();
  for (const c of clases) {
    const k = clave(c.dia, c.Bloque_Horario_Id);
    clasesPorCelda.set(k, [...(clasesPorCelda.get(k) || []), c]);
  }

  const horasDisponibles = redondear(
    bloques.reduce(
      (acc, b) => acc + dias.filter((d) => marcadas.has(clave(d, b.Bloque_Horario_Id))).length * Number(b.duracion || 0),
      0
    )
  );
  const carga = cargaSemanal === "" || cargaSemanal === null || cargaSemanal === undefined ? null : Number(cargaSemanal);
  const sinRestriccion = marcadas.size === 0;
  const adeudadas = !sinRestriccion && carga !== null && !Number.isNaN(carga) ? redondear(Math.max(0, carga - horasDisponibles)) : 0;
  const clasesFuera = sinRestriccion ? [] : clases.filter((c) => !marcadas.has(clave(c.dia, c.Bloque_Horario_Id)));

  const emitir = (set) => {
    onChange(
      [...set].map((k) => {
        const [dia, id] = k.split("|");
        return { dia, Bloque_Horario_Id: Number(id) };
      })
    );
  };

  const alternar = (claves) => {
    const set = new Set(marcadas);
    const todasMarcadas = claves.every((k) => set.has(k));
    for (const k of claves) {
      if (todasMarcadas) set.delete(k);
      else set.add(k);
    }
    emitir(set);
  };

  const todas = dias.flatMap((d) => bloques.map((b) => clave(d, b.Bloque_Horario_Id)));

  if (bloques.length === 0) {
    return (
      <div className="disp-semanal">
        <p className="disp-nota">No hay bloques de clase configurados. Configura los bloques horarios para registrar la disponibilidad.</p>
      </div>
    );
  }

  return (
    <div className="disp-semanal">
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
        <div className="disp-acciones">
          <button type="button" className="disp-accion" onClick={() => emitir(new Set(todas))}>Marcar todo</button>
          <button type="button" className="disp-accion" onClick={() => emitir(new Set())}>Limpiar</button>
        </div>
      </div>

      <div className="disp-tabla-wrap">
        <table className="disp-tabla">
          <thead>
            <tr>
              <th scope="col">Bloque</th>
              {dias.map((d) => (
                <th key={d} scope="col">
                  <button
                    type="button"
                    className="disp-cabecera"
                    title={`Marcar o desmarcar todo el ${d}`}
                    onClick={() => alternar(bloques.map((b) => clave(d, b.Bloque_Horario_Id)))}
                  >
                    {d.slice(0, 3)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bloques.map((b) => (
              <tr key={b.Bloque_Horario_Id}>
                <th scope="row">
                  <button
                    type="button"
                    className="disp-cabecera"
                    title="Marcar o desmarcar este bloque toda la semana"
                    onClick={() => alternar(dias.map((d) => clave(d, b.Bloque_Horario_Id)))}
                  >
                    {b.hora_inicio}–{b.hora_fin}
                  </button>
                </th>
                {dias.map((d) => {
                  const k = clave(d, b.Bloque_Horario_Id);
                  const marcada = marcadas.has(k);
                  const enCelda = clasesPorCelda.get(k) || [];
                  const fuera = enCelda.length > 0 && !marcada && !sinRestriccion;
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        className={`disp-celda${marcada ? " disp-celda--on" : ""}${fuera ? " disp-celda--fuera" : ""}`}
                        aria-pressed={marcada}
                        aria-label={`${d} ${b.hora_inicio} a ${b.hora_fin}: ${marcada ? "disponible" : "no disponible"}`}
                        title={enCelda.map((c) => `${c.asignatura} · ${c.curso}`).join("\n") || undefined}
                        onClick={() => alternar([k])}
                      >
                        {enCelda.length > 0 ? (fuera ? "⚠ Clase" : "Clase") : marcada ? "✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="disp-resumen">
        {sinRestriccion ? (
          <p className="disp-nota">
            Sin disponibilidad registrada: el docente puede asignarse en cualquier bloque.
          </p>
        ) : (
          <p>
            Disponible <strong>{horasDisponibles} h</strong> a la semana
            {carga !== null && !Number.isNaN(carga) && <> · carga horaria semanal <strong>{carga} h</strong></>}
          </p>
        )}
        {adeudadas > 0 && (
          <p className="disp-aviso" role="status">
            ⚠ Debe {adeudadas} h: su disponibilidad no alcanza su carga horaria semanal. Se puede guardar igual.
          </p>
        )}
        {clasesFuera.length > 0 && (
          <p className="disp-aviso" role="status">
            ⚠ {clasesFuera.length} clase(s) ya asignada(s) quedan fuera de la disponibilidad y se mantienen:{" "}
            {clasesFuera.map((c) => `${c.dia} ${c.hora_inicio} ${c.asignatura} (${c.curso})`).join("; ")}.
          </p>
        )}
        <p className="disp-nota">La disponibilidad se repite todas las semanas del período.</p>
      </div>
    </div>
  );
}

export default DisponibilidadSemanal;
