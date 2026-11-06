import { useEffect, useState } from "react";
import { getSemanaAtencion, guardarSemanaAtencion } from "../services/api";
import EditorTramos from "./tramos/EditorTramos";
import VistaBloques from "./tramos/VistaBloques";
import { aMin, cubre, errorTramos, horasDelDia, redondear, sumarIntervalo, toca, tramosUnidos } from "./tramos/tramos";
import "./DisponibilidadSemanal.css";

// RF55 / CU87, CU88: el docente configura su horario de atención de apoderados en tramos
// "desde–hasta" por día, con la vista por bloques de 45 minutos. Los apoderados solicitan
// citaciones de 30 minutos dentro de estos tramos (RF56 / CU89).
// Reglas (las valida también el servidor): entre 08:00 y 18:00, sin superponerse con sus
// clases ni entre sí, dentro de su disponibilidad laboral (CU107) y con espacio para al
// menos una citación. Si un cambio deja fuera citaciones a futuro, pide confirmación.

const DURACION = 30;

/** Citaciones de 30 minutos (en punto o y media) que caben en un tramo. */
const citasEnTramo = (inicio, fin) => {
  let n = 0;
  for (let t = Math.ceil(inicio / DURACION) * DURACION; t + DURACION <= fin; t += DURACION) n += 1;
  return n;
};

function HorarioAtencionSemanal({ onGuardado }) {
  const [datos, setDatos] = useState(null);
  const [tramos, setTramos] = useState([]);
  const [errorCarga, setErrorCarga] = useState("");
  const [estado, setEstado] = useState({ guardando: false, exito: "", error: "", conflictos: [], citaciones: null });
  const [modificado, setModificado] = useState(false);

  useEffect(() => {
    let vigente = true;
    getSemanaAtencion()
      .then((d) => { if (vigente) { setDatos(d); setTramos(d.tramos || []); } })
      .catch((e) => vigente && setErrorCarga(e.message || "No fue posible cargar tu horario de atención"));
    return () => { vigente = false; };
  }, []);

  if (errorCarga) return <div className="usuarios-empty" style={{ color: "#dc2626" }}>{errorCarga}</div>;
  if (!datos) return <p>Cargando horario de atención…</p>;

  const { dias, bloques, clases, disponibilidadLaboral, limites } = datos;
  const cambiar = (nuevos) => {
    setTramos(nuevos);
    setModificado(true);
    setEstado((e) => ({ ...e, exito: "", error: "", conflictos: [], citaciones: null }));
  };

  const dispPorDia = new Map(dias.map((d) => [d, tramosUnidos(disponibilidadLaboral, d)]));
  const atencionPorDia = new Map(dias.map((d) => [d, tramosUnidos(tramos, d)]));
  const conDisponibilidad = disponibilidadLaboral.length > 0;
  const citasDia = (d) => atencionPorDia.get(d).reduce((acc, t) => acc + citasEnTramo(t.inicio, t.fin), 0);
  const totalCitas = dias.reduce((acc, d) => acc + citasDia(d), 0);
  const horas = redondear(dias.reduce((acc, d) => acc + horasDelDia(tramos, d), 0));

  // Avisos en vivo (el servidor los valida igual)
  const avisos = [];
  const error = errorTramos(tramos, dias, { minDuracion: DURACION });
  if (!error) {
    for (const t of tramos) {
      const i = aMin(t.hora_inicio);
      const f = aMin(t.hora_fin);
      if (i < aMin(limites.minimo) || f > aMin(limites.maximo)) avisos.push(`${t.dia} ${t.hora_inicio}–${t.hora_fin}: debe estar entre las ${limites.minimo} y las ${limites.maximo}`);
      else if (citasEnTramo(i, f) === 0) avisos.push(`${t.dia} ${t.hora_inicio}–${t.hora_fin}: no incluye ninguna citación de 30 minutos (en punto o y media)`);
      const choque = clases.find((c) => c.dia === t.dia && aMin(c.hora_inicio) < f && i < aMin(c.hora_fin));
      if (choque) avisos.push(`${t.dia} ${t.hora_inicio}–${t.hora_fin}: se superpone con tu clase de ${choque.asignatura} (${choque.curso}, ${choque.hora_inicio}–${choque.hora_fin})`);
      if (conDisponibilidad && !cubre(dispPorDia.get(t.dia), t.hora_inicio, t.hora_fin)) avisos.push(`${t.dia} ${t.hora_inicio}–${t.hora_fin}: queda fuera de tu disponibilidad laboral`);
    }
  }
  const bloqueado = Boolean(error) || avisos.length > 0;

  const guardar = async (confirmar = false) => {
    setEstado({ guardando: true, exito: "", error: "", conflictos: [], citaciones: null });
    try {
      const r = await guardarSemanaAtencion(tramos, confirmar);
      setEstado({ guardando: false, exito: r.mensaje, error: "", conflictos: [], citaciones: null });
      setModificado(false);
      if (onGuardado) onGuardado(r.bloques || []);
    } catch (e) {
      const data = e.data || {};
      setEstado({
        guardando: false,
        exito: "",
        error: e.message || "No fue posible guardar tu horario de atención",
        conflictos: data.conflictos?.length > 1 ? data.conflictos : [],
        citaciones: data.requiereConfirmacion ? data.citaciones || [] : null,
      });
    }
  };

  const clasesPorCelda = new Map();
  for (const c of clases) {
    const k = `${c.dia}|${c.Bloque_Horario_Id}`;
    clasesPorCelda.set(k, [...(clasesPorCelda.get(k) || []), c]);
  }
  const celda = (d, b) => {
    const enCelda = clasesPorCelda.get(`${d}|${b.Bloque_Horario_Id}`) || [];
    if (enCelda.length > 0) {
      return { estado: "clase", texto: "Clase", titulo: enCelda.map((c) => `${c.asignatura} · ${c.curso}`).join("\n") };
    }
    if (cubre(atencionPorDia.get(d), b.hora_inicio, b.hora_fin)) return { estado: "atencion", texto: "Atención", titulo: "Atención de apoderados" };
    const dentroDisp = !conDisponibilidad || cubre(dispPorDia.get(d), b.hora_inicio, b.hora_fin);
    const dentroLimites = aMin(b.hora_inicio) >= aMin(limites.minimo) && aMin(b.hora_fin) <= aMin(limites.maximo);
    if (!dentroDisp || !dentroLimites) {
      return { estado: "bloqueada", texto: "", titulo: dentroDisp ? `Fuera del horario de atención (${limites.minimo}–${limites.maximo})` : "Fuera de tu disponibilidad laboral" };
    }
    const parcial = toca(atencionPorDia.get(d), b.hora_inicio, b.hora_fin);
    return {
      estado: parcial ? "parcial" : "",
      texto: "",
      titulo: "Sumar este bloque a la atención",
      etiqueta: `Sumar ${d} ${b.hora_inicio} a ${b.hora_fin} a la atención`,
      onClick: () => cambiar(sumarIntervalo(tramos, d, b.hora_inicio, b.hora_fin)),
    };
  };

  const primeraDisp = disponibilidadLaboral[0];
  return (
    <div className="disp-semanal disp-semanal--atencion">
      <div className="disp-encabezado">
        <span className="disp-periodo">
          {conDisponibilidad
            ? "Debe quedar dentro de tu disponibilidad laboral y fuera de tus clases."
            : `Entre las ${limites.minimo} y las ${limites.maximo}, fuera de tus clases.`}
        </span>
        <div className="disp-acciones">
          <button
            type="button"
            className="disp-accion"
            disabled={!tramos.some((t) => t.dia === dias[0])}
            title={`Copia los tramos del ${dias[0]} al resto de los días`}
            onClick={() => {
              const base = tramos.filter((t) => t.dia === dias[0]);
              cambiar([...base, ...dias.slice(1).flatMap((dia) => base.map((t) => ({ ...t, dia })))]);
            }}
          >
            Copiar {dias[0]?.toLowerCase()} al resto
          </button>
          <button type="button" className="disp-accion" onClick={() => cambiar([])} disabled={tramos.length === 0}>
            Limpiar
          </button>
        </div>
      </div>

      <EditorTramos
        dias={dias}
        tramos={tramos}
        onChange={cambiar}
        limites={limites}
        variante="disp-tramo--atencion"
        sugerencia={primeraDisp
          ? { inicio: primeraDisp.hora_inicio, fin: primeraDisp.hora_fin < limites.maximo ? primeraDisp.hora_fin : limites.maximo }
          : { inicio: "14:00", fin: "16:00" }}
        vacio="Sin atención"
        detalleDia={(d) => (citasDia(d) > 0 ? `${horasDelDia(tramos, d)} h · ${citasDia(d)} ${citasDia(d) === 1 ? "cita" : "citas"}` : "")}
      />

      {error && <p className="input-error-msg" role="alert">{error}</p>}
      {avisos.length > 0 && (
        <div className="disp-aviso" role="alert">
          {avisos.map((a) => <div key={a}>⚠ {a}</div>)}
        </div>
      )}

      <div className="disp-resumen">
        {tramos.length === 0 ? (
          <p className="disp-nota">Sin horario de atención: los apoderados no pueden solicitarte citaciones.</p>
        ) : (
          <p>
            Atiendes <strong>{horas} h</strong> a la semana · los apoderados pueden elegir entre{" "}
            <strong>{totalCitas}</strong> {totalCitas === 1 ? "citación" : "citaciones"} de 30 minutos por semana.
          </p>
        )}
      </div>

      <VistaBloques
        dias={dias}
        bloques={bloques}
        celda={celda}
        nota="Haz clic en un bloque libre para sumarlo a tu atención. Las citaciones duran 30 minutos y empiezan en punto o y media."
        leyenda={[
          { estado: "atencion", texto: "Atención de apoderados" },
          { estado: "clase", texto: "Clase" },
          ...(conDisponibilidad ? [{ estado: "bloqueada", texto: "Fuera de tu disponibilidad" }] : []),
        ]}
      />

      {estado.exito && <div className="msg-exito" role="status">{estado.exito}</div>}
      {estado.error && (
        <div className="msg-error-form" role="alert">
          {estado.error}
          {estado.conflictos.length > 0 && <ul>{estado.conflictos.slice(1).map((c) => <li key={c}>{c}</li>)}</ul>}
          {estado.citaciones && (
            <ul>
              {estado.citaciones.map((c) => (
                <li key={c.Citacion_Id}>
                  {c.Citacion_Fecha} · {c.Citacion_Tramo_Horario} · {c.Estudiante_Nombre_Completo} ({c.Apoderado_Nombre}) · {c.Citacion_Estado}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="disp-botones">
        <button type="button" className="btn-primario" onClick={() => guardar(false)} disabled={estado.guardando || bloqueado || !modificado}>
          {estado.guardando ? "Guardando..." : "Guardar horario de atención"}
        </button>
        {estado.citaciones && (
          <button type="button" className="btn-primario btn-confirmar" onClick={() => guardar(true)} disabled={estado.guardando}>
            Confirmar y guardar
          </button>
        )}
      </div>
    </div>
  );
}

export default HorarioAtencionSemanal;
