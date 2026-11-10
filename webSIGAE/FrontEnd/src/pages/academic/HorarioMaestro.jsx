import { useEffect, useMemo, useState } from "react";
import { getHorarioMaestro } from "../../services/api";
import ExportMenu from "../../components/ExportMenu";
import { COLORES_ASIGNATURA, COLOR_PENDIENTE, DIAS_SEMANA, aMinutos, hhmm } from "../../utils/horarios";

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const COLOR_DEFAULT = { bg: "#f1f5f9", border: "#cbd5e1", text: "#334155" };

// Día de la semana actual (o lunes si es fin de semana) para abrir la vista por día
function diaInicial() {
  const indice = new Date().getDay(); // 0 = domingo
  return indice >= 1 && indice <= 5 ? DIAS_SEMANA[indice - 1] : DIAS_SEMANA[0];
}

// CU57: Visualizando horario maestro — vista consolidada de todos los
// bloques, cursos y docentes de la institución (solo Super Admin/Admin).
// Se muestra como grilla: por día (bloques × cursos) o la semana completa
// (bloques × días), con los mismos colores por asignatura en ambas vistas.
function HorarioMaestro() {
  const [horario, setHorario] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [vista, setVista] = useState("dia"); // "dia" | "semana"
  const [dia, setDia] = useState(diaInicial);
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroDocente, setFiltroDocente] = useState("");

  useEffect(() => {
    let vigente = true;
    Promise.all([
      getHorarioMaestro(),
      fetch("/api/horarios/bloques", { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([data, bh]) => {
        if (!vigente) return;
        setHorario(Array.isArray(data) ? data : []);
        setBloques(Array.isArray(bh) ? bh : []);
      })
      .catch((error) => {
        // Excepción "No existen datos suficientes" y errores técnicos
        if (vigente) setErrorCarga(error.message || "No es posible generar el horario maestro");
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, []);

  // Catálogos derivados del horario
  const { cursos, docentes, colorAsig, asignaturas } = useMemo(() => {
    const cursosMap = new Map();
    const docentesMap = new Map();
    const asigMap = new Map();
    horario.forEach((h) => {
      if (h.Curso_Id) cursosMap.set(h.Curso_Id, h.curso || h.Curso_Nombre || ("Curso " + h.Curso_Id));
      if (h.Usuario_Id) docentesMap.set(h.Usuario_Id, h.docente || h.Docente_Nombre || ("Docente " + h.Usuario_Id));
      if (h.Asignatura_Id) asigMap.set(h.Asignatura_Id, h.asignatura || h.Asignatura_Nombre || ("Asignatura " + h.Asignatura_Id));
    });
    const porNombre = (a, b) => String(a?.[1] || "").localeCompare(String(b?.[1] || ""), "es");
    const asigOrdenadas = [...asigMap.entries()].sort(porNombre);
    return {
      cursos: [...cursosMap.entries()].sort(porNombre).map(([id, nombre]) => ({ id, nombre })),
      docentes: [...docentesMap.entries()].sort(porNombre).map(([id, nombre]) => ({ id, nombre })),
      asignaturas: asigOrdenadas.map(([id, nombre]) => ({ id, nombre })),
      colorAsig: Object.fromEntries(
        asigOrdenadas.map(([id], i) => [id, COLORES_ASIGNATURA[i % COLORES_ASIGNATURA.length]])
      ),
    };
  }, [horario]);

  const filtradas = horario.filter(
    (h) =>
      (!filtroCurso || String(h.Curso_Id) === filtroCurso) &&
      (!filtroDocente || String(h.Usuario_Id) === filtroDocente)
  );

  // Filas: bloques vigentes (clases y recreos) y los desajustados que aún tengan clases
  const conClases = new Set(horario.map((h) => h.Bloque_Horario_Id));
  const filas = bloques
    .filter((b) => Number(b.desajustado) !== 1 || conClases.has(b.Bloque_Horario_Id))
    .sort((a, b) => aMinutos(a.Bloque_Horario_Hora_Inicio || a.Bloque_Hora_Inicio) - aMinutos(b.Bloque_Horario_Hora_Inicio || b.Bloque_Hora_Inicio));

  const columnasCurso = filtroCurso ? cursos.filter((c) => String(c.id) === filtroCurso) : cursos;
  const clasesPorDia = (d) => filtradas.filter((h) => h.dia === d).length;

  const totalSinDocente = horario.filter((h) => !h.Usuario_Id).length;
  const hayFiltros = filtroCurso || filtroDocente;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Horario Maestro</h1>
          <p style={s.subtitulo}>Vista consolidada de todos los bloques, cursos y docentes de la institución</p>
        </div>
        {!loading && !errorCarga && (
          <ExportMenu label="Exportar maestro" url="/api/horarios/exportar/maestro" filenameBase="horario_maestro" />
        )}
      </div>

      {loading && <p style={s.textoSuave}>Generando horario maestro...</p>}

      {!loading && errorCarga && (
        <div style={s.vacio}>
          <span style={{ fontSize: "2.2rem" }}>📅</span>
          <p style={{ margin: 0, color: "#991b1b" }}>{errorCarga}</p>
        </div>
      )}

      {!loading && !errorCarga && (
        <>
          <div style={s.stats}>
            <Stat valor={horario.length} etiqueta="Clases programadas" />
            <Stat valor={cursos.length} etiqueta="Cursos con horario" />
            <Stat valor={docentes.length} etiqueta="Docentes" />
            <Stat valor={totalSinDocente} etiqueta="Sin docente" alerta={totalSinDocente > 0} />
          </div>

          <div style={s.toolbar}>
            <div style={s.segmento}>
              <BotonSegmento activo={vista === "dia"} onClick={() => setVista("dia")}>Por día</BotonSegmento>
              <BotonSegmento activo={vista === "semana"} onClick={() => setVista("semana")}>Semana completa</BotonSegmento>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)} style={s.select}>
                <option value="">Todos los cursos</option>
                {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select value={filtroDocente} onChange={(e) => setFiltroDocente(e.target.value)} style={s.select}>
                <option value="">Todos los docentes</option>
                {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              {hayFiltros && (
                <button type="button" style={s.btnLimpiar} onClick={() => { setFiltroCurso(""); setFiltroDocente(""); }}>
                  ✕ Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {vista === "dia" && (
            <div style={s.tabsDias}>
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDia(d)}
                  style={{ ...s.tabDia, ...(dia === d ? s.tabDiaActivo : {}) }}
                >
                  {d}
                  <span style={{ ...s.tabContador, ...(dia === d ? s.tabContadorActivo : {}) }}>{clasesPorDia(d)}</span>
                </button>
              ))}
            </div>
          )}

          <div style={s.grillaWrap}>
            <table
            style={{
              ...s.tabla,
              minWidth: vista === "semana" ? 780 : Math.max(780, columnasCurso.length * 135 + 115),
            }}
          >
              <thead>
                <tr>
                  <th style={{ ...s.th, ...s.thBloque }}>Bloque</th>
                  {(vista === "dia" ? columnasCurso.map((c) => c.nombre) : DIAS_SEMANA).map((col) => (
                    <th key={col} style={{ ...s.th, minWidth: 130 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((b) => {
                  const columnas = vista === "dia" ? columnasCurso.length : DIAS_SEMANA.length;
                  if (b.Bloque_Horario_Tipo === "Recreo") {
                    return (
                      <tr key={b.Bloque_Horario_Id}>
                        <td style={{ ...s.tdBloque, ...s.recreo }}>
                          <div style={s.horaBloque}>{hhmm(b.Bloque_Horario_Hora_Inicio || b.Bloque_Hora_Inicio)} – {hhmm(b.Bloque_Horario_Hora_Fin || b.Bloque_Hora_Fin)}</div>
                        </td>
                        <td colSpan={columnas} style={{ ...s.recreo, ...s.recreoBanda }}>⛹ Recreo</td>
                      </tr>
                    );
                  }

                  const desajustado = Number(b.desajustado) === 1;
                  const clasesBloque = filtradas.filter((h) => h.Bloque_Horario_Id === b.Bloque_Horario_Id);

                  return (
                    <tr key={b.Bloque_Horario_Id}>
                      <td style={{ ...s.tdBloque, ...(desajustado ? { background: COLOR_PENDIENTE.bg } : {}) }}>
                        <div style={s.horaBloque}>{hhmm(b.Bloque_Horario_Hora_Inicio || b.Bloque_Hora_Inicio)} – {hhmm(b.Bloque_Horario_Hora_Fin || b.Bloque_Hora_Fin)}</div>
                        <div style={s.jornada}>{b.Bloque_Horario_Jornada}</div>
                        {desajustado && (
                          <div style={{ fontSize: "0.62rem", fontWeight: 700, color: COLOR_PENDIENTE.text }}>⚠ {b.motivo_desajuste}</div>
                        )}
                      </td>

                      {vista === "dia"
                        ? columnasCurso.map((c) => {
                            const clase = clasesBloque.find((h) => h.dia === dia && h.Curso_Id === c.id);
                            return (
                              <td key={c.id} style={s.td}>
                                {clase ? <TarjetaClase clase={clase} color={colorAsig[clase.Asignatura_Id]} /> : <Vacio />}
                              </td>
                            );
                          })
                        : DIAS_SEMANA.map((d) => {
                            const delDia = clasesBloque
                              .filter((h) => h.dia === d)
                              .sort((x, y) => String(x.curso || x.Curso_Nombre || "").localeCompare(String(y.curso || y.Curso_Nombre || ""), "es"));
                            return (
                              <td key={d} style={{ ...s.td, minWidth: 130 }}>
                                {delDia.length === 0 ? (
                                  <Vacio />
                                ) : filtroCurso ? (
                                  <TarjetaClase clase={delDia[0]} color={colorAsig[delDia[0].Asignatura_Id]} />
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                    {delDia.map((h) => (
                                      <ChipClase key={h.Horario_Asignatura_Id} clase={h} color={colorAsig[h.Asignatura_Id]} />
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {vista === "dia" && columnasCurso.length === 0 && (
              <p style={{ ...s.textoSuave, padding: "1rem" }}>No hay cursos que coincidan con el filtro.</p>
            )}
          </div>

          {asignaturas.length > 0 && (
            <div style={s.leyenda}>
              {asignaturas.map((a) => {
                const c = colorAsig[a.id] || COLOR_DEFAULT;
                return (
                  <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "#475569" }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, border: `1px solid ${c.border}` }} />
                    {a.nombre}
                  </span>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TarjetaClase({ clase, color }) {
  const c = color || COLOR_DEFAULT;
  return (
    <div
      title={`${clase.curso} · ${clase.asignatura} · ${clase.docente || "Sin docente"} (${clase.dia} ${hhmm(clase.hora_inicio)}–${hhmm(clase.hora_fin)})`}
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderLeft: `3px solid ${c.text}`,
        borderRadius: 6,
        padding: "5px 7px",
        minHeight: 40,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: "0.74rem", fontWeight: 700, color: c.text, lineHeight: 1.25 }}>{clase.asignatura}</div>
      <div style={{ fontSize: "0.66rem", color: clase.docente ? "#475569" : "#b91c1c", marginTop: 2, lineHeight: 1.2 }}>
        {clase.docente || "Sin docente"}
      </div>
    </div>
  );
}

function ChipClase({ clase, color }) {
  const c = color || COLOR_DEFAULT;
  return (
    <div
      title={`${clase.curso} · ${clase.asignatura} · ${clase.docente || "Sin docente"}`}
      style={{
        background: c.bg,
        borderLeft: `3px solid ${c.text}`,
        borderRadius: 6,
        padding: "4px 6px",
        fontSize: "0.7rem",
        lineHeight: 1.25,
        color: c.text,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "0.72rem", marginBottom: 2 }}>
        {clase.curso}
      </div>
      <div style={{ wordBreak: "break-word", lineHeight: 1.2 }}>
        {clase.asignatura}
      </div>
      {clase.docente && (
        <div style={{ fontSize: "0.62rem", color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          👤 {clase.docente}
        </div>
      )}
    </div>
  );
}

function Vacio() {
  return <div style={{ textAlign: "center", color: "#cbd5e1", fontSize: "0.8rem" }}>—</div>;
}

function Stat({ valor, etiqueta, alerta }) {
  return (
    <div style={{ ...s.stat, ...(alerta ? { borderColor: "#fecaca", background: "#fff5f5" } : {}) }}>
      <div style={{ fontSize: "1.45rem", fontWeight: 800, color: alerta ? "#b91c1c" : "#1e3a5f", lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>{etiqueta}</div>
    </div>
  );
}

function BotonSegmento({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "0.4rem 0.9rem",
        border: "none",
        cursor: "pointer",
        fontSize: "0.82rem",
        fontWeight: 600,
        background: activo ? "#1e3a5f" : "#fff",
        color: activo ? "#fff" : "#475569",
      }}
    >
      {children}
    </button>
  );
}

const s = {
  page: { padding: "1.25rem 1rem", maxWidth: "100%", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem" },
  titulo: { margin: 0, fontSize: "1.6rem", color: "#1e3a5f" },
  subtitulo: { margin: "4px 0 0", color: "#64748b", fontSize: "0.9rem" },
  textoSuave: { color: "#6b7280", fontStyle: "italic" },
  vacio: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
    padding: "3rem 1rem", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
  },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", marginBottom: "1rem" },
  stat: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "0.8rem 1rem" },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" },
  segmento: { display: "flex", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" },
  select: {
    width: "auto", minWidth: 190, flex: "0 0 auto", margin: 0,
    padding: "0.4rem 0.6rem", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.82rem", background: "#fff",
  },
  btnLimpiar: { padding: "0.4rem 0.7rem", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#475569", fontSize: "0.8rem", cursor: "pointer" },
  tabsDias: { display: "flex", gap: 4, borderBottom: "2px solid #e5e7eb", marginBottom: "0.75rem", overflowX: "auto" },
  tabDia: {
    padding: "0.5rem 0.95rem", border: "none", background: "transparent", cursor: "pointer",
    fontSize: "0.85rem", fontWeight: 600, color: "#64748b", borderBottom: "3px solid transparent",
    marginBottom: -2, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  },
  tabDiaActivo: { color: "#1e3a5f", borderBottomColor: "#1e3a5f" },
  tabContador: { fontSize: "0.68rem", padding: "1px 7px", borderRadius: 999, background: "#f1f5f9", color: "#64748b" },
  tabContadorActivo: { background: "#1e3a5f", color: "#fff" },
  grillaWrap: { overflow: "auto", maxHeight: "70vh", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" },
  tabla: { borderCollapse: "separate", borderSpacing: 0, width: "100%" },
  th: {
    position: "sticky", top: 0, zIndex: 2, background: "#1e3a5f", color: "#fff",
    padding: "0.6rem 0.5rem", fontSize: "0.75rem", fontWeight: 700, textAlign: "center",
    textTransform: "uppercase", letterSpacing: "0.03em", minWidth: 140, whiteSpace: "nowrap",
    borderLeft: "1px solid rgba(255,255,255,0.12)",
  },
  thBloque: { position: "sticky", left: 0, zIndex: 3, minWidth: 115, width: 115, textAlign: "left", background: "#1e3a5f" },
  tdBloque: {
    position: "sticky", left: 0, zIndex: 1, background: "#f8fafc",
    minWidth: 115, width: 115,
    padding: "0.5rem 0.65rem", borderTop: "1px solid #eef2f7", borderRight: "1px solid #e5e7eb",
    verticalAlign: "middle", whiteSpace: "nowrap",
  },
  horaBloque: { fontSize: "0.78rem", fontWeight: 700, color: "#1e3a5f", fontVariantNumeric: "tabular-nums" },
  jornada: { fontSize: "0.66rem", color: "#94a3b8", marginTop: 2 },
  td: { padding: 4, borderTop: "1px solid #eef2f7", borderLeft: "1px solid #f1f5f9", verticalAlign: "top", minWidth: 140 },
  recreo: { background: "#f0fdf4" },
  recreoBanda: {
    textAlign: "center", fontSize: "0.72rem", fontWeight: 600, color: "#15803d",
    letterSpacing: "0.08em", padding: "0.35rem", borderTop: "1px solid #dcfce7",
  },
  leyenda: { display: "flex", flexWrap: "wrap", gap: "0.4rem 1rem", marginTop: "0.85rem" },
};

export default HorarioMaestro;
