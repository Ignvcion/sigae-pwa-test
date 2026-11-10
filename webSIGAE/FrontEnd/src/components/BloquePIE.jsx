import { useEffect, useMemo, useState } from "react";
import { getPIEDocente, guardarPIEDocente, getBloquesInstitucionales } from "../services/api";
import { getEstadoPeriodo } from "../services/promocion";
import { calcularCargaLectiva, textoReparto, errorHorasPIE } from "../utils/cargaLectiva";
import "./BloquePIE.css";

// Horas P.I.E. del docente (edición de usuario, administración):
// - Cantidad de horas P.I.E.: se restan de la carga y sobre el resto se aplica
//   la regla 65/35 (máximo de clases = 65 %, en horas pedagógicas).
// - Ubicación en el horario: el administrador marca los bloques de la semana que
//   son P.I.E. (hasta la cantidad asignada). Un bloque P.I.E. no admite clases;
//   los bloques donde el docente ya tiene clase aparecen ocupados.

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const hhmm = (t) => String(t || "").slice(0, 5);
const clave = (dia, bloqueId) => `${dia}|${bloqueId}`;

export default function BloquePIE({ datos, onGuardado }) {
  const [periodos, setPeriodos] = useState(null);
  const [periodo, setPeriodo] = useState("");
  const [info, setInfo] = useState(null);
  const [bloques, setBloques] = useState([]);
  const [horas, setHoras] = useState(String(datos.Docente_Horas_PIE ?? 0));
  const [marcados, setMarcados] = useState(new Set());
  const [estado, setEstado] = useState({ cargando: true, guardando: false, error: "", exito: "", advertencia: "" });

  useEffect(() => {
    getEstadoPeriodo().then((d) => setPeriodos(d?.periodos || null)).catch(() => {});
    getBloquesInstitucionales()
      .then((lista) => setBloques((lista || []).filter((b) => b.Bloque_Horario_Tipo === "Clase" && !Number(b.desajustado))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: "" }));
    getPIEDocente(datos.Usuario_Id, periodo || undefined)
      .then((d) => {
        if (!vigente) return;
        setInfo(d);
        setHoras(String(d.horasPIE));
        setMarcados(new Set(d.bloques.map((b) => clave(b.dia, b.bloqueId))));
        setEstado((e) => ({ ...e, cargando: false }));
      })
      .catch((err) => vigente && setEstado((e) => ({ ...e, cargando: false, error: err.message || "No fue posible cargar las horas P.I.E." })));
    return () => { vigente = false; };
  }, [datos.Usuario_Id, periodo]);

  const ocupados = useMemo(
    () => new Map((info?.ocupados || []).map((o) => [clave(o.dia, o.bloqueId), o.descripcion])),
    [info]
  );

  const errorHoras = errorHorasPIE(horas, datos.Docente_Carga_Horaria_Semanal);
  const horasNum = errorHoras || horas === "" ? 0 : Number(horas);
  const reparto = calcularCargaLectiva(datos.Docente_Carga_Horaria_Semanal, horasNum);
  const sobran = marcados.size > horasNum;
  const excede = reparto && info && info.clasesAsignadas > reparto.maxLectivas;

  const alternar = (dia, bloqueId) => {
    const k = clave(dia, bloqueId);
    setMarcados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(k)) nuevo.delete(k);
      else if (nuevo.size < horasNum) nuevo.add(k);
      return nuevo;
    });
    setEstado((e) => ({ ...e, exito: "", error: "", advertencia: "" }));
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (errorHoras || sobran) return;
    setEstado((s) => ({ ...s, guardando: true, error: "", exito: "", advertencia: "" }));
    try {
      const bloquesPIE = [...marcados].map((k) => {
        const [dia, bloqueId] = k.split("|");
        return { dia, bloqueId: Number(bloqueId) };
      });
      const r = await guardarPIEDocente(datos.Usuario_Id, { horasPIE: horasNum, bloques: bloquesPIE, periodo: info?.periodo });
      setInfo(r);
      setEstado((s) => ({ ...s, guardando: false, exito: `Horas P.I.E. de ${r.periodo} guardadas`, advertencia: r.advertencia || "" }));
      if (onGuardado) onGuardado();
    } catch (err) {
      setEstado((s) => ({ ...s, guardando: false, error: err.message || "No fue posible guardar las horas P.I.E." }));
    }
  };

  return (
    <div className="perfil-card editar-bloque editar-bloque--ancho">
      <h2>Horas P.I.E. y regla 65/35</h2>
      <form className="cambiar-pwd-form" onSubmit={guardar}>
        <p className="etiquetas-ayuda">
          Las horas P.I.E. se restan de la carga horaria semanal; del resto, el 65 % son clases (cada bloque cuenta
          como una hora pedagógica) y el 35 %, horas no lectivas. Márcalas en el horario: esos bloques no admiten clases.
        </p>

        <div className="pie-fila">
          <div className="campo-pwd pie-campo-horas">
            <label htmlFor={`horas-pie-${datos.Usuario_Id}`}>Horas P.I.E.</label>
            <input
              id={`horas-pie-${datos.Usuario_Id}`}
              type="number"
              min="0"
              max={datos.Docente_Carga_Horaria_Semanal ?? undefined}
              value={horas}
              onChange={(e) => { setHoras(e.target.value); setEstado((s) => ({ ...s, exito: "", advertencia: "" })); }}
              className={errorHoras ? "input-invalid" : ""}
            />
            {errorHoras && <span className="input-error-msg">{errorHoras}</span>}
          </div>
          {periodos?.siguiente && (
            <div className="campo-pwd pie-campo-periodo">
              <label htmlFor={`periodo-pie-${datos.Usuario_Id}`}>Período</label>
              <select id={`periodo-pie-${datos.Usuario_Id}`} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="">{periodos.vigente} (vigente)</option>
                <option value={periodos.siguiente}>{periodos.siguiente} (siguiente)</option>
              </select>
            </div>
          )}
        </div>

        {reparto ? (
          <div className={`pie-reparto${excede ? " pie-reparto--excede" : ""}`} role="status">
            <strong>{textoReparto(reparto)}</strong>
            {info && (
              <span>
                Clases asignadas en {info.periodo}: {info.clasesAsignadas} de {reparto.maxLectivas}
                {excede && " — supera el máximo: reasigna clases a otro docente"}
              </span>
            )}
          </div>
        ) : (
          <p className="etiquetas-ayuda">Sin carga horaria semanal registrada: no se aplica el límite de clases.</p>
        )}

        {estado.error && <div className="msg-error-form">{estado.error}</div>}
        {estado.cargando && <span className="etiquetas-ayuda">Cargando horario…</span>}

        {!estado.cargando && info && bloques.length > 0 && (
          <>
            <p className="pie-contador">
              Bloques P.I.E. ubicados en el horario de {info.periodo}: <strong>{marcados.size} de {horasNum}</strong>
              {marcados.size < horasNum && (horasNum - marcados.size === 1
                ? " (queda 1 hora sin ubicar)"
                : ` (quedan ${horasNum - marcados.size} horas sin ubicar)`)}
              {sobran && <span className="input-error-msg"> Marcaste más bloques que horas P.I.E.: desmarca {marcados.size - horasNum}.</span>}
            </p>
            <div className="pie-grilla-envoltura">
              <table className="pie-grilla">
                <thead>
                  <tr>
                    <th scope="col">Bloque</th>
                    {DIAS.map((d) => <th key={d} scope="col">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bloques.map((b) => (
                    <tr key={b.Bloque_Horario_Id}>
                      <th scope="row">{hhmm(b.Bloque_Horario_Hora_Inicio)}–{hhmm(b.Bloque_Horario_Hora_Fin)}</th>
                      {DIAS.map((dia) => {
                        const k = clave(dia, b.Bloque_Horario_Id);
                        const ocupado = ocupados.get(k);
                        const esPIE = marcados.has(k);
                        const lleno = !esPIE && marcados.size >= horasNum;
                        return (
                          <td key={dia}>
                            {ocupado ? (
                              <span className="pie-celda pie-celda--clase" title={ocupado}>{ocupado}</span>
                            ) : (
                              <button
                                type="button"
                                className={`pie-celda${esPIE ? " pie-celda--pie" : ""}`}
                                aria-pressed={esPIE}
                                aria-label={`${dia} ${hhmm(b.Bloque_Horario_Hora_Inicio)}: ${esPIE ? "P.I.E. (quitar)" : "libre (marcar P.I.E.)"}`}
                                disabled={lleno}
                                title={lleno ? "Ya ubicaste todas las horas P.I.E." : undefined}
                                onClick={() => alternar(dia, b.Bloque_Horario_Id)}
                              >
                                {esPIE ? "P.I.E." : ""}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {estado.exito && <div className="msg-exito">{estado.exito}</div>}
        {estado.advertencia && <div className="msg-error-form">⚠ {estado.advertencia}</div>}

        <button type="submit" className="btn-primario" disabled={estado.guardando || !!errorHoras || sobran || !info}>
          {estado.guardando ? "Guardando…" : "Guardar horas P.I.E."}
        </button>
      </form>
    </div>
  );
}
