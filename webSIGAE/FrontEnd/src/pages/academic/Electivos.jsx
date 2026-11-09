import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPlanElectivos,
  crearPlanElectivos,
  editarPlanElectivos,
  clonarPlanElectivos,
  getProgramacionElectivos,
  programarElectivo,
  eliminarElectivo,
} from "../../services/api";
import EtiquetaPeriodo from "../../components/horarios/EtiquetaPeriodo";
import "./Electivos.css";

// Electivos de 3° y 4° medio (RF27, RF28, RF33–RF35).
//   Plan del período (CU108): asignaturas electivas por ruta, horas semanales y docentes habilitados.
//   Programación (CU106): bloques compartidos por todos los cursos de 3° y 4° medio; un bloque
//   admite varios electivos a la vez y no admite clases regulares de esos cursos.
const RUTAS = ["Científica", "Humanística"];
const hhmm = (t) => String(t ?? "").slice(0, 5);
let siguienteClave = 0;

function SelectorPeriodo({ periodo, periodos, onCambiar }) {
  if (!periodos?.siguiente) {
    return <EtiquetaPeriodo periodo={periodo} estado="Vigente" />;
  }
  return (
    <label className="el-periodo">
      Período
      <select value={periodo} onChange={(e) => onCambiar(e.target.value)}>
        <option value={periodos.vigente}>{periodos.vigente} · Vigente</option>
        <option value={periodos.siguiente}>{periodos.siguiente} · Futuro</option>
      </select>
    </label>
  );
}

// ── CU108: plan de electivos del período ──────────────────────────────
function filaVacia(ruta) {
  siguienteClave += 1;
  return { clave: `nueva-${siguienteClave}`, Asignatura_Id: "", ruta, horas: 2, docentes: [], horas_programadas: 0 };
}

function aFilas(plan) {
  return (plan?.asignaturas || []).map((a) => ({
    clave: `${a.Asignatura_Id}-${a.ruta}`,
    Asignatura_Id: String(a.Asignatura_Id),
    ruta: a.ruta,
    horas: a.horas,
    docentes: a.docentes.map((d) => d.Usuario_Id),
    horas_programadas: a.horas_programadas,
  }));
}

function SelectorDocentes({ docentes, seleccionados, onCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const nombres = docentes.filter((d) => seleccionados.includes(d.Usuario_Id));
  const alternar = (id) =>
    onCambiar(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id]);
  return (
    <div className="el-docentes">
      <div className="el-chips">
        {nombres.length === 0 && <span className="el-suave">Sin docentes habilitados</span>}
        {nombres.map((d) => (
          <span key={d.Usuario_Id} className="el-chip">
            {d.Usuario_Nombre_Completo}
            <button type="button" aria-label={`Quitar a ${d.Usuario_Nombre_Completo}`} onClick={() => alternar(d.Usuario_Id)}>×</button>
          </span>
        ))}
        <button type="button" className="el-btn-link" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Listo" : "+ Docente"}
        </button>
      </div>
      {abierto && (
        <div className="el-lista-docentes">
          {docentes.map((d) => (
            <label key={d.Usuario_Id}>
              <input
                type="checkbox"
                checked={seleccionados.includes(d.Usuario_Id)}
                onChange={() => alternar(d.Usuario_Id)}
              />
              <span>{d.Usuario_Nombre_Completo}</span>
              {d.Docente_Especialidad && <span className="el-suave"> · {d.Docente_Especialidad}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanElectivos({ periodo, setPeriodo }) {
  const [datos, setDatos] = useState(null);
  const [filas, setFilas] = useState([]);
  const [editando, setEditando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [advertencia, setAdvertencia] = useState("");

  const cargar = useCallback(async (p) => {
    setCargando(true);
    setError("");
    try {
      const d = await getPlanElectivos(p);
      setDatos(d);
      setFilas(aFilas(d.plan));
      setAdvertencia(d.advertencia || "");
      setEditando(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar(periodo); }, [cargar, periodo]);

  const totales = useMemo(() => Object.fromEntries(
    RUTAS.map((r) => [r, filas.filter((f) => f.ruta === r).reduce((a, f) => a + (Number(f.horas) || 0), 0)])
  ), [filas]);

  const cambiarFila = (clave, cambios) =>
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));

  const guardar = async () => {
    setGuardando(true);
    setError("");
    setExito("");
    const asignaturas = filas.map((f) => ({
      Asignatura_Id: Number(f.Asignatura_Id),
      ruta: f.ruta,
      horas: Number(f.horas),
      docentes: f.docentes,
    }));
    try {
      const r = datos.plan
        ? await editarPlanElectivos(datos.plan.Plan_Electivos_Id, asignaturas)
        : await crearPlanElectivos(datos.periodo, asignaturas);
      setExito(r.mensaje);
      await cargar(datos.periodo);
      setAdvertencia(r.advertencia || "");
    } catch (e) {
      // CU108 Excepción 3: ya existe un plan del período; se recarga para editarlo
      if (e.data?.Plan_Electivos_Id) {
        setError(`${e.message}`);
        await cargar(datos.periodo);
      } else {
        setError(e.message);
      }
    } finally {
      setGuardando(false);
    }
  };

  const clonar = async () => {
    setGuardando(true);
    setError("");
    try {
      const r = await clonarPlanElectivos(datos.periodo, datos.periodoAnterior);
      setExito(r.mensaje);
      await cargar(datos.periodo);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando && !datos) return <p>Cargando plan de electivos...</p>;
  if (!datos) return error ? <p className="msg-error">{error}</p> : null;

  const sinPlan = !datos.plan;
  const enEdicion = editando || (sinPlan && filas.length > 0);
  const electivas = datos.electivas || [];

  return (
    <section className="el-seccion">
      <div className="el-barra">
        <div>
          <h2>Plan de electivos {datos.periodo}</h2>
          <p className="el-suave">
            Único para 3° y 4° medio. Cada ruta tiene sus asignaturas, horas semanales y docentes habilitados.
          </p>
        </div>
        <SelectorPeriodo periodo={datos.periodo} periodos={datos.periodos} onCambiar={setPeriodo} />
      </div>

      {exito && <p className="msg-exito">{exito}</p>}
      {error && <p className="msg-error">{error}</p>}
      {advertencia && <p className="el-aviso">⚠ {advertencia}</p>}

      {electivas.length === 0 && (
        <p className="el-aviso">
          Aún no hay asignaturas marcadas como electivas. Márcalas en <strong>Asignaturas</strong> (CU47) para armar el plan.
        </p>
      )}

      {sinPlan && !enEdicion && (
        <div className="el-vacio">
          <p>No hay plan de electivos para {datos.periodo}.</p>
          <div className="el-acciones">
            <button
              type="button"
              className="btn-primary"
              disabled={electivas.length === 0}
              onClick={() => setFilas([filaVacia("Científica"), filaVacia("Humanística")])}
            >
              Crear plan
            </button>
            {datos.periodoAnterior && (
              <button type="button" className="btn-secundario" disabled={guardando} onClick={clonar}>
                Clonar plan {datos.periodoAnterior}
              </button>
            )}
          </div>
        </div>
      )}

      {(enEdicion || !sinPlan) && (
        <div className="el-rutas">
          {RUTAS.map((ruta) => {
            const delaRuta = filas.filter((f) => f.ruta === ruta);
            return (
              <div key={ruta} className={`el-ruta el-ruta--${ruta === "Científica" ? "c" : "h"}`}>
                <div className="el-ruta-titulo">
                  <h3>Ruta {ruta}</h3>
                  <span className="el-total">{totales[ruta]} h semanales</span>
                </div>
                {delaRuta.length === 0 && <p className="el-suave">Sin asignaturas en esta ruta.</p>}
                {delaRuta.map((f) => {
                  const usadas = filas.filter((x) => x.ruta === ruta && x.clave !== f.clave).map((x) => x.Asignatura_Id);
                  const nombre = electivas.find((a) => String(a.Asignatura_Id) === f.Asignatura_Id)?.Asignatura_Nombre;
                  return (
                    <div key={f.clave} className="el-fila">
                      {enEdicion ? (
                        <>
                          <div className="el-fila-principal">
                            <select
                              value={f.Asignatura_Id}
                              onChange={(e) => cambiarFila(f.clave, { Asignatura_Id: e.target.value })}
                              aria-label="Asignatura electiva"
                            >
                              <option value="">Asignatura electiva...</option>
                              {electivas
                                .filter((a) => !usadas.includes(String(a.Asignatura_Id)))
                                .map((a) => (
                                  <option key={a.Asignatura_Id} value={a.Asignatura_Id}>{a.Asignatura_Nombre}</option>
                                ))}
                            </select>
                            <label className="el-horas">
                              <input
                                type="number"
                                min={Math.max(1, Math.ceil(f.horas_programadas))}
                                step={1}
                                value={f.horas}
                                onChange={(e) => cambiarFila(f.clave, { horas: e.target.value })}
                                aria-label="Horas semanales"
                              />
                              h/sem
                            </label>
                            <button
                              type="button"
                              className="el-btn-quitar"
                              disabled={f.horas_programadas > 0}
                              title={f.horas_programadas > 0 ? "Tiene clases programadas" : "Quitar del plan"}
                              onClick={() => setFilas((prev) => prev.filter((x) => x.clave !== f.clave))}
                            >
                              Quitar
                            </button>
                          </div>
                          <SelectorDocentes
                            docentes={datos.docentes || []}
                            seleccionados={f.docentes}
                            onCambiar={(docentes) => cambiarFila(f.clave, { docentes })}
                          />
                        </>
                      ) : (
                        <>
                          <div className="el-fila-principal">
                            <strong>{nombre || "—"}</strong>
                            <span className="el-progreso" title="Horas programadas / horas del plan">
                              {f.horas_programadas} / {f.horas} h programadas
                            </span>
                          </div>
                          <div className="el-chips">
                            {(datos.plan.asignaturas.find((a) => `${a.Asignatura_Id}-${a.ruta}` === f.clave)?.docentes || [])
                              .map((d) => <span key={d.Usuario_Id} className="el-chip el-chip--fijo">{d.Usuario_Nombre_Completo}</span>)}
                            {f.docentes.length === 0 && <span className="el-suave">Sin docentes habilitados</span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {enEdicion && (
                  <button type="button" className="el-btn-link" onClick={() => setFilas((prev) => [...prev, filaVacia(ruta)])}>
                    + Agregar asignatura a la ruta {ruta}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="el-acciones">
        {!sinPlan && !editando && (
          <button type="button" className="btn-primary" onClick={() => { setEditando(true); setExito(""); }}>
            Editar plan
          </button>
        )}
        {enEdicion && (
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={guardando || filas.length === 0 || filas.some((f) => !f.Asignatura_Id)}
              onClick={guardar}
            >
              {guardando ? "Guardando..." : sinPlan ? "Registrar plan" : "Guardar cambios"}
            </button>
            <button type="button" className="btn-secundario" disabled={guardando} onClick={() => cargar(datos.periodo)}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// ── CU106: programación en bloques compartidos ────────────────────────
function FormProgramar({ celda, plan, onCerrar, onProgramado }) {
  const [ruta, setRuta] = useState(RUTAS[0]);
  const [asignaturaId, setAsignaturaId] = useState("");
  const [docenteId, setDocenteId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const items = (plan?.asignaturas || []).filter((a) => a.ruta === ruta);
  const item = items.find((a) => String(a.Asignatura_Id) === asignaturaId);
  const ocupadas = celda.clases.filter((c) => c.ruta === ruta).map((c) => c.Asignatura_Id);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const r = await programarElectivo({
        periodo: celda.periodo,
        dia: celda.dia,
        Bloque_Horario_Id: celda.bloque.Bloque_Horario_Id,
        Asignatura_Id: Number(asignaturaId),
        ruta,
        Docente_Usuario_Id: Number(docenteId),
      });
      onProgramado(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="el-form-titulo" onClick={onCerrar}>
      <form className="el-modal" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <h3 id="el-form-titulo">Programar electivo</h3>
        <p className="el-suave">
          {celda.dia} {hhmm(celda.bloque.hora_inicio)}–{hhmm(celda.bloque.hora_fin)} · todos los cursos de 3° y 4° medio
        </p>
        {error && <p className="msg-error">{error}</p>}

        <label>Ruta</label>
        <div className="el-segmentos">
          {RUTAS.map((r) => (
            <button
              key={r}
              type="button"
              className={r === ruta ? "activo" : ""}
              onClick={() => { setRuta(r); setAsignaturaId(""); setDocenteId(""); }}
            >
              {r}
            </button>
          ))}
        </div>

        <label htmlFor="el-asig">Asignatura del plan</label>
        <select id="el-asig" value={asignaturaId} onChange={(e) => { setAsignaturaId(e.target.value); setDocenteId(""); }} required>
          <option value="">Seleccionar...</option>
          {items.map((a) => {
            const llena = a.horas_programadas >= a.horas;
            const yaEnBloque = ocupadas.includes(a.Asignatura_Id);
            return (
              <option key={a.Asignatura_Id} value={a.Asignatura_Id} disabled={llena || yaEnBloque}>
                {a.Asignatura_Nombre} ({a.horas_programadas}/{a.horas} h){yaEnBloque ? " · ya en este bloque" : llena ? " · completa" : ""}
              </option>
            );
          })}
        </select>

        <label htmlFor="el-doc">Docente habilitado</label>
        <select id="el-doc" value={docenteId} onChange={(e) => setDocenteId(e.target.value)} required disabled={!item}>
          <option value="">{item ? "Seleccionar..." : "Elige primero la asignatura"}</option>
          {(item?.docentes || []).map((d) => (
            <option key={d.Usuario_Id} value={d.Usuario_Id}>{d.Usuario_Nombre_Completo}</option>
          ))}
        </select>
        {item && item.docentes.length === 0 && (
          <p className="el-aviso">Esta asignatura no tiene docentes habilitados en el plan.</p>
        )}

        <div className="el-acciones">
          <button type="submit" className="btn-primary" disabled={enviando || !asignaturaId || !docenteId}>
            {enviando ? "Programando..." : "Programar"}
          </button>
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function ProgramacionElectivos({ periodo, setPeriodo }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [celda, setCelda] = useState(null);

  const cargar = useCallback(async (p) => {
    setCargando(true);
    try {
      const d = await getProgramacionElectivos(p);
      setDatos(d);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar(periodo); }, [cargar, periodo]);

  const quitar = async (clase) => {
    if (!window.confirm(`¿Quitar ${clase.asignatura} (${clase.ruta}) del ${clase.dia} ${clase.hora_inicio}?`)) return;
    try {
      const r = await eliminarElectivo(clase.Clase_Electivo_Id);
      setAvisos([{ tipo: "exito", texto: r.mensaje }]);
      cargar(datos.periodo);
    } catch (e) {
      setAvisos([{ tipo: "error", texto: e.message }]);
    }
  };

  if (cargando && !datos) return <p>Cargando programación...</p>;
  if (!datos) return error ? <p className="msg-error">{error}</p> : null;

  const bloques = datos.bloques || [];
  const clasesEn = (dia, bloqueId) => datos.clases.filter((c) => c.dia === dia && c.Bloque_Horario_Id === bloqueId);
  const regularesEn = (dia, bloqueId) => datos.ocupadas.filter((o) => o.dia === dia && o.Bloque_Horario_Id === bloqueId);
  const { requeridas, programadas } = datos.completitud || {};

  return (
    <section className="el-seccion">
      <div className="el-barra">
        <div>
          <h2>Programación de electivos {datos.periodo}</h2>
          <p className="el-suave">
            Los bloques son compartidos por {datos.cursos.length > 0
              ? datos.cursos.map((c) => c.Curso_Nombre).join(", ")
              : "los cursos de 3° y 4° medio"}. Un bloque admite varios electivos a la vez.
          </p>
        </div>
        <SelectorPeriodo periodo={datos.periodo} periodos={datos.periodos} onCambiar={setPeriodo} />
      </div>

      {avisos.map((a, i) => (
        <p key={i} className={a.tipo === "exito" ? "msg-exito" : a.tipo === "error" ? "msg-error" : "el-aviso"}>{a.texto}</p>
      ))}
      {error && <p className="msg-error">{error}</p>}

      {!datos.plan ? (
        <p className="el-aviso">Primero registra el plan de electivos de {datos.periodo} en la pestaña Plan del período.</p>
      ) : (
        <>
          <div className="el-resumen">
            <div>
              <span className="el-resumen-num">{programadas ?? 0} / {requeridas ?? 0} h</span>
              <span className="el-suave">bloques de electivos programados (cada bloque cuenta una vez por curso)</span>
            </div>
            {RUTAS.map((r) => {
              const items = datos.plan.asignaturas.filter((a) => a.ruta === r);
              const prog = items.reduce((a, x) => a + x.horas_programadas, 0);
              const tot = items.reduce((a, x) => a + x.horas, 0);
              return (
                <div key={r}>
                  <span className={`el-ruta-pill el-ruta-pill--${r === "Científica" ? "c" : "h"}`}>{r}</span>
                  <span className="el-suave"> {Math.round(prog * 100) / 100} / {tot} h</span>
                </div>
              );
            })}
          </div>

          <div className="el-grilla-scroll">
            <table className="el-grilla">
              <thead>
                <tr>
                  <th>Bloque</th>
                  {datos.dias.map((d) => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {bloques.map((b) => (
                  <tr key={b.Bloque_Horario_Id} className={b.tipo !== "Clase" ? "el-recreo" : ""}>
                    <td className="el-bloque">
                      <strong>{b.hora_inicio}–{b.hora_fin}</strong>
                      <span className="el-suave">{b.tipo === "Clase" ? b.jornada : b.tipo}</span>
                    </td>
                    {datos.dias.map((dia) => {
                      if (b.tipo !== "Clase") return <td key={dia} className="el-celda el-celda--recreo" />;
                      const clases = clasesEn(dia, b.Bloque_Horario_Id);
                      const regulares = regularesEn(dia, b.Bloque_Horario_Id);
                      return (
                        <td key={dia} className="el-celda">
                          {regulares.length > 0 ? (
                            <div className="el-ocupado" title={regulares.map((r) => `${r.curso}: ${r.asignatura}`).join("\n")}>
                              Clases regulares
                              <span>{regulares.map((r) => r.curso).join(", ")}</span>
                            </div>
                          ) : (
                            <>
                              {clases.map((c) => (
                                <div key={c.Clase_Electivo_Id} className={`el-clase el-clase--${c.ruta === "Científica" ? "c" : "h"}`}>
                                  <div>
                                    <strong>{c.asignatura}</strong>
                                    <span>{c.ruta} · {c.docente}</span>
                                  </div>
                                  <button type="button" aria-label={`Quitar ${c.asignatura}`} onClick={() => quitar(c)}>×</button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="el-agregar"
                                onClick={() => { setAvisos([]); setCelda({ dia, bloque: b, clases, periodo: datos.periodo }); }}
                              >
                                + Electivo
                              </button>
                            </>
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

      {celda && (
        <FormProgramar
          celda={celda}
          plan={datos.plan}
          onCerrar={() => setCelda(null)}
          onProgramado={(r) => {
            setCelda(null);
            setAvisos([
              { tipo: "exito", texto: r.mensaje },
              ...(r.sugerencia ? [{ tipo: "aviso", texto: r.sugerencia }] : []),
              ...(r.advertencia ? [{ tipo: "aviso", texto: r.advertencia }] : []),
            ]);
            cargar(datos.periodo);
          }}
        />
      )}
    </section>
  );
}

function Electivos() {
  const [pestana, setPestana] = useState("plan");
  const [periodo, setPeriodo] = useState("");

  return (
    <div className="page-container el-pagina">
      <div className="page-header">
        <div>
          <h1>Electivos de 3° y 4° medio</h1>
          <p>Plan de electivos del período y su programación en bloques compartidos</p>
        </div>
      </div>

      <div className="el-pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === "plan"} className={pestana === "plan" ? "activo" : ""} onClick={() => setPestana("plan")}>
          Plan del período
        </button>
        <button type="button" role="tab" aria-selected={pestana === "programacion"} className={pestana === "programacion" ? "activo" : ""} onClick={() => setPestana("programacion")}>
          Programación
        </button>
      </div>

      {pestana === "plan"
        ? <PlanElectivos periodo={periodo} setPeriodo={setPeriodo} />
        : <ProgramacionElectivos periodo={periodo} setPeriodo={setPeriodo} />}
    </div>
  );
}

export default Electivos;
