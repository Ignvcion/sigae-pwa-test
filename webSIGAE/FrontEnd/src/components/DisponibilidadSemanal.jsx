import "./DisponibilidadSemanal.css";
import EditorTramos from "./tramos/EditorTramos";
import VistaBloques from "./tramos/VistaBloques";
import { cubre, errorTramos, horasDelDia, redondear, sumarIntervalo, tramosUnidos } from "./tramos/tramos";

export { errorTramos };

// CU107: disponibilidad laboral semanal del docente, en tramos "desde–hasta" por día.
// Los tramos incluyen recreos y horas sin clases (corregir pruebas, reuniones).
// Debajo, la vista por bloques de 45 minutos muestra qué bloques de clase quedan
// cubiertos (un bloque está disponible si cae completo dentro de un tramo), las clases
// y el horario de atención de apoderados (RF55).
// El patrón se repite todas las semanas del período, igual que la carga horaria semanal.
// Solo el administrador la edita; el docente la ve en su perfil (soloLectura).

function DisponibilidadSemanal({
  dias = [],
  bloques = [],
  jornada,
  limites = { minimo: "06:00", maximo: "23:00" },
  tramos = [],
  onChange,
  cargaSemanal,
  clases = [],
  atencion = [],
  periodo,
  periodos,
  onCambiarPeriodo,
  soloLectura = false,
}) {
  const unidosPorDia = new Map(dias.map((d) => [d, tramosUnidos(tramos, d)]));
  const atencionPorDia = new Map(dias.map((d) => [d, tramosUnidos(atencion, d)]));
  const horasDisponibles = redondear(dias.reduce((acc, d) => acc + horasDelDia(tramos, d), 0));
  const carga = cargaSemanal === "" || cargaSemanal === null || cargaSemanal === undefined ? null : Number(cargaSemanal);
  const sinRestriccion = tramos.length === 0;
  const adeudadas = !sinRestriccion && carga !== null && !Number.isNaN(carga) ? redondear(Math.max(0, carga - horasDisponibles)) : 0;
  const fueraDe = (lista) => (sinRestriccion ? [] : lista.filter((c) => !cubre(unidosPorDia.get(c.dia) || [], c.hora_inicio, c.hora_fin)));
  const clasesFuera = fueraDe(clases);
  const atencionFuera = fueraDe(atencion);
  const error = soloLectura ? "" : errorTramos(tramos, dias);

  const clasesPorCelda = new Map();
  for (const c of clases) {
    const k = `${c.dia}|${c.Bloque_Horario_Id}`;
    clasesPorCelda.set(k, [...(clasesPorCelda.get(k) || []), c]);
  }

  const celda = (d, b) => {
    const cubierto = cubre(unidosPorDia.get(d), b.hora_inicio, b.hora_fin);
    const enCelda = clasesPorCelda.get(`${d}|${b.Bloque_Horario_Id}`) || [];
    const deAtencion = cubre(atencionPorDia.get(d), b.hora_inicio, b.hora_fin);
    // Sin tramos registrados no hay restricción: nada se marca como fuera
    const fuera = (enCelda.length > 0 || deAtencion) && !cubierto && !sinRestriccion;
    let estado = cubierto ? "on" : "";
    let texto = cubierto ? "✓" : "";
    if (deAtencion) { estado = fuera ? "fuera" : "atencion"; texto = fuera ? "⚠ Atención" : "Atención"; }
    if (enCelda.length > 0) { estado = fuera ? "fuera" : "on"; texto = fuera ? "⚠ Clase" : "Clase"; }
    const titulo = enCelda.map((c) => `${c.asignatura} · ${c.curso}`).join("\n") || (deAtencion ? "Atención de apoderados" : undefined);
    const puedeSumar = !soloLectura && b.tipo !== "Recreo" && !cubierto;
    return {
      estado,
      texto,
      titulo: titulo || (puedeSumar ? "Sumar este bloque" : undefined),
      etiqueta: `Sumar ${d} ${b.hora_inicio} a ${b.hora_fin}`,
      onClick: puedeSumar ? () => onChange(sumarIntervalo(tramos, d, b.hora_inicio, b.hora_fin)) : undefined,
    };
  };

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
              <button
                type="button"
                className="disp-accion"
                title="Reemplaza todos los tramos"
                onClick={() => onChange(dias.map((dia) => ({ dia, hora_inicio: jornada.inicio, hora_fin: jornada.fin })))}
              >
                Jornada {jornada.inicio}–{jornada.fin} toda la semana
              </button>
            )}
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
        )}
      </div>

      <EditorTramos
        dias={dias}
        tramos={tramos}
        onChange={onChange}
        soloLectura={soloLectura}
        limites={limites}
        sugerencia={jornada ? { inicio: jornada.inicio, fin: jornada.fin } : undefined}
        vacio={sinRestriccion ? "—" : "No disponible"}
        detalleDia={(d) => (horasDelDia(tramos, d) > 0 ? `${horasDelDia(tramos, d)} h` : "")}
      />

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
        {atencionFuera.length > 0 && (
          <p className="disp-aviso" role="status">
            ⚠ Horario de atención de apoderados fuera de la disponibilidad
            {!soloLectura && " (se mantiene; el docente debe ajustarlo)"}: {atencionFuera.map((a) => `${a.dia} ${a.hora_inicio}–${a.hora_fin}`).join("; ")}.
          </p>
        )}
      </div>

      <VistaBloques
        dias={dias}
        bloques={bloques}
        celda={celda}
        nota={`Un bloque está disponible si cae completo dentro de un tramo.${soloLectura ? "" : " Haz clic en un bloque libre para sumarlo a la disponibilidad."}`}
        leyenda={[
          { estado: "on", texto: "Disponible" },
          ...(atencion.length > 0 ? [{ estado: "atencion", texto: "Atención de apoderados" }] : []),
          { estado: "fuera", texto: "Fuera de la disponibilidad" },
        ]}
      />
      <p className="disp-nota">La disponibilidad se repite todas las semanas del período.</p>
    </div>
  );
}

export default DisponibilidadSemanal;
