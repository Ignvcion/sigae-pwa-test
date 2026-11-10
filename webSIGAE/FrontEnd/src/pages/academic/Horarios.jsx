import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import ExportMenu from "../../components/ExportMenu";
import DetalleBloqueModal from "../../components/horarios/DetalleBloqueModal";
import PanelConflictos from "../../components/horarios/PanelConflictos";
import { COLOR_PENDIENTE } from "../../utils/horarios";

const API = "/api";
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DIAS_ABR = ["Lun", "Mar", "Mié", "Jue", "Vie"];

const ASIG_COLORS = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#9d174d" },
  { bg: "#d1fae5", border: "#6ee7b7", text: "#064e3b" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#5b21b6" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
  { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
  { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  { bg: "#ffedd5", border: "#fdba74", text: "#9a3412" },
];

const EMPTY_FORM = {
  Horario_Asignatura_Dia_Semana: "",
  Horario_Asignatura_Estado: "Activo",
  Curso_Id: "",
  Bloque_Horario_Id: "",
  Asignatura_Id: "",
  Usuario_Id: "",
};

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  };
}

// Las clases eliminadas no ocupan su bloque: solo figuran en el listado de clases
const ESTADO_ELIMINADO = "Eliminado";
const esEliminada = (h) => h.estado === ESTADO_ELIMINADO;

function tipoIcon(tipo) {
  if (tipo === "Recreo") return "⛹";
  if (tipo === "Evento Académico") return "🎓";
  return "📚";
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MiniGrid — compact schedule preview (blocks × days)          */
/* ═══════════════════════════════════════════════════════════════ */
function MiniGrid({ bloques, horarios, colorMap }) {
  const classBloques = bloques.filter(b => b.Bloque_Horario_Tipo === "Clase");
  if (classBloques.length === 0)
    return <p style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: 6 }}>Sin bloques de clase configurados.</p>;

  const lookup = {};
  for (const h of horarios) lookup[`${h.Bloque_Horario_Id}-${h.dia}`] = colorMap[h.Asignatura_Id];

  return (
    <div style={{ marginTop: 8, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `26px repeat(5, 1fr)`, gap: 2 }}>
        <div />
        {DIAS_ABR.map(d => (
          <div key={d} style={{ fontSize: "0.58rem", color: "#94a3b8", textAlign: "center", fontWeight: 700 }}>
            {d}
          </div>
        ))}
        {classBloques.map(bloque => (
          <React.Fragment key={bloque.Bloque_Horario_Id}>
            <div style={{ fontSize: "0.5rem", color: "#cbd5e1", textAlign: "right", paddingRight: 2, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {bloque.Bloque_Horario_Hora_Inicio.slice(0, 5)}
            </div>
            {DIAS.map(dia => {
              const color = lookup[`${bloque.Bloque_Horario_Id}-${dia}`];
              const asigNombre = horarios.find(h => h.Bloque_Horario_Id === bloque.Bloque_Horario_Id && h.dia === dia)?.asignatura || "";
              return (
                <div
                  key={`${bloque.Bloque_Horario_Id}-${dia}`}
                  title={asigNombre}
                  style={{ height: 13, borderRadius: 2, background: color ? color.bg : "#f8fafc", border: `1px solid ${color ? color.border : "#e2e8f0"}` }}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* Clases eliminadas de un curso, bajo la vista rápida del listado de cursos */
function ClasesEliminadasMini({ clases }) {
  if (clases.length === 0) return null;
  return (
    <div style={{ marginTop: 8, borderTop: "1px dashed #e2e8f0", paddingTop: 6 }}>
      <div style={{ fontSize: "0.64rem", fontWeight: 700, color: "#991b1b", marginBottom: 3 }}>
        🗑 Clases eliminadas ({clases.length})
      </div>
      {clases.map(c => (
        <div key={c.Horario_Asignatura_Id} style={{ fontSize: "0.62rem", color: "#64748b", textDecoration: "line-through", lineHeight: 1.45 }}>
          {c.dia.slice(0, 3)} {c.hora_inicio?.slice(0, 5)} · {c.asignatura}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ListadoCursosSidebar — panel that overlays the nav sidebar   */
/* ═══════════════════════════════════════════════════════════════ */
function ListadoCursosSidebar({ cursos, bloques, onClose, onRefresh, onSelectCurso, cursoSeleccionado }) {
  const [vistas, setVistas] = useState({});

  useEffect(() => {
    document.body.classList.add("horarios-listado-open");
    return () => document.body.classList.remove("horarios-listado-open");
  }, []);

  const toggleVista = async (cursoId) => {
    const cur = vistas[cursoId];
    if (cur && cur !== "loading") { setVistas(p => ({ ...p, [cursoId]: null })); return; }
    if (cur === "loading") return;
    setVistas(p => ({ ...p, [cursoId]: "loading" }));
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      const [rH, rA] = await Promise.all([
        fetch(`/api/horarios?curso_id=${cursoId}&incluir_eliminadas=1`, { headers: h }).then(r => r.json()),
        fetch(`/api/horarios/asignaturas-curso?curso_id=${cursoId}`, { headers: h }).then(r => r.json()),
      ]);
      const colorMap = {};
      (Array.isArray(rA) ? rA : []).forEach((a, i) => { colorMap[a.Asignatura_Id] = ASIG_COLORS[i % ASIG_COLORS.length]; });
      setVistas(p => ({ ...p, [cursoId]: { horarios: Array.isArray(rH) ? rH : [], colorMap } }));
    } catch {
      setVistas(p => ({ ...p, [cursoId]: null }));
    }
  };

  return (
    <>
      {/* Backdrop overlay para cerrar al tocar afuera en móvil y escritorio */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.55)",
          backdropFilter: "blur(2px)",
          zIndex: 1100,
        }}
      />

      {/* Drawer desplegable con z-index superior a la barra superior móvil (999) */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "min(340px, 86vw)",
          height: "100vh",
          background: "#fff",
          boxShadow: "4px 0 28px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          animation: "slideInLeft 0.22s ease",
          zIndex: 1101,
        }}
      >
        {/* Header visible con título y botón de cierre */}
        <div
          style={{
            background: "#0f172a",
            padding: "0.85rem 1.1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
              <span>📋</span> Listado de Cursos
            </div>
            <div style={{ color: "#94a3b8", fontSize: "0.7rem", marginTop: 2 }}>
              {cursos.length} cursos registrados
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={onRefresh}
              title="Actualizar datos"
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#cbd5e1",
                borderRadius: 6,
                width: 28,
                height: 28,
                cursor: "pointer",
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ↺
            </button>
            <button
              onClick={onClose}
              title="Cerrar panel"
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#fff",
                borderRadius: 6,
                width: 28,
                height: 28,
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Lista de Cursos */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {cursos.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "0.82rem", textAlign: "center", marginTop: "2rem" }}>Cargando cursos...</p>
          ) : cursos.map(curso => {
            const prog = Number(curso.total_horas_programadas) || 0;
            const req = Number(curso.total_horas_requeridas) || 0;
            const pct = req > 0 ? Math.min(100, Math.round((prog / req) * 100)) : (prog > 0 ? 100 : 0);
            const vistaData = vistas[curso.Curso_Id];
            const vistaAbierta = vistaData && vistaData !== "loading";
            const barColor = pct >= 100 ? "#22c55e" : pct > 50 ? "#6366f1" : "#f59e0b";
            const esSeleccionado = Number(cursoSeleccionado) === Number(curso.Curso_Id);

            return (
              <div
                key={curso.Curso_Id}
                style={{
                  background: esSeleccionado ? "#f0f7ff" : "#f8fafc",
                  borderRadius: 8,
                  border: `1px solid ${esSeleccionado ? "#3b82f6" : "#e2e8f0"}`,
                  padding: "0.55rem 0.65rem",
                  boxShadow: esSeleccionado ? "0 0 0 2px rgba(59, 130, 246, 0.25)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <div
                    onClick={() => onSelectCurso && onSelectCurso(curso.Curso_Id)}
                    style={{
                      fontWeight: 700,
                      fontSize: "0.84rem",
                      color: esSeleccionado ? "#1d4ed8" : "#1e293b",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    title="Clic para seleccionar este curso"
                  >
                    <span>{curso.Curso_Nombre}</span>
                    {esSeleccionado && (
                      <span style={{ fontSize: "0.62rem", background: "#3b82f6", color: "#fff", padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>
                        Seleccionado
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onSelectCurso && onSelectCurso(curso.Curso_Id)}
                    style={{
                      fontSize: "0.68rem",
                      padding: "2px 7px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      color: "#334155",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                    title="Ver horario de este curso"
                  >
                    Ver →
                  </button>
                </div>

                <div style={{ fontSize: "0.68rem", color: "#64748b", marginBottom: 5 }}>
                  {curso.Nivel_Educativo_Nombre || "Nivel"} · Periodo {curso.Curso_Periodo_Lectivo || "2026"}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: "0.66rem", color: "#6b7280" }}>
                    {prog.toFixed(1)}h {req > 0 ? `de ${req}h` : "programadas"}
                  </span>
                  <span style={{ fontSize: "0.66rem", fontWeight: 700, color: pct >= 100 ? "#166534" : "#6b7280" }}>
                    {pct}%
                  </span>
                </div>

                <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", marginBottom: 7 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
                </div>

                <button
                  onClick={() => toggleVista(curso.Curso_Id)}
                  style={{
                    width: "100%",
                    border: `1px solid ${vistaAbierta ? "#c4b5fd" : "#dbeafe"}`,
                    borderRadius: 5,
                    padding: "0.22rem 0.5rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: vistaAbierta ? "#ede9fe" : "#f0f4ff",
                    color: vistaAbierta ? "#5b21b6" : "#4f46e5",
                    transition: "all 0.15s",
                  }}
                >
                  {vistaData === "loading" ? "Cargando..." : vistaAbierta ? "▲ Ocultar vista rápida" : "▼ Vista rápida"}
                </button>

                {vistaAbierta && vistaData && vistaData !== "loading" && Array.isArray(vistaData.horarios) && (
                  <>
                    <MiniGrid bloques={bloques} horarios={vistaData.horarios.filter(h => !esEliminada(h))} colorMap={vistaData.colorMap} />
                    <ClasesEliminadasMini clases={vistaData.horarios.filter(esEliminada)} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function Horarios() {
  const { rolActivo, usuario } = useAuth();
  const rolEfectivo = rolActivo || usuario?.roles?.[0];
  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const esAdmin =
    rolEfectivo === "Administrador" ||
    esSuperAdmin ||
    usuario?.roles?.includes("Administrador");
  const esDocente = rolEfectivo === "Docente";
  const esApoderado = rolEfectivo === "Apoderado";

  // Master data
  const [cursos, setCursos] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [asignaturasCurso, setAsignaturasCurso] = useState([]);

  // View state
  const [cursoSeleccionado, setCursoSeleccionado] = useState("");
  const [asignaturaActiva, setAsignaturaActiva] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Panel state
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [idEditando, setIdEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [guardando, setGuardando] = useState(false);
  const [errorPanel, setErrorPanel] = useState("");

  // Bulk suspend
  const [suspendiendo, setSuspendiendo] = useState(false);

  // Selección múltiple de bloques (CU63 / CU64)
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState([]);
  const [modalMasivo, setModalMasivo] = useState(null); // "reasignar" | "editar" | "suspender" | null
  // CU69: Horario_Asignatura_Id del bloque cuyo detalle se está viendo
  const [detalleBloqueId, setDetalleBloqueId] = useState(null);
  const [exito, setExito] = useState("");

  // Listado sidebar
  const [listadoAbierto, setListadoAbierto] = useState(false);
  const [resumenCursos, setResumenCursos] = useState([]);

  // Sidebar collapse
  useEffect(() => {
    if (panelAbierto) document.body.classList.add("horarios-panel-open");
    else document.body.classList.remove("horarios-panel-open");
    return () => document.body.classList.remove("horarios-panel-open");
  }, [panelAbierto]);

  // Load master data
  useEffect(() => {
    if (esApoderado) return;
    Promise.all([
      fetch(`${API}/horarios/cursos`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API}/horarios/bloques`, { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([c, b]) => {
        setCursos(c);
        setBloques(b);
      })
      .catch(() => setError("Error al cargar datos de configuración."));
  }, [esApoderado]);

  const recargarBloques = useCallback(() => {
    fetch(`${API}/horarios/bloques`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((b) => { if (Array.isArray(b)) setBloques(b); })
      .catch(() => {});
  }, []);

  const cargarHorarios = useCallback(async (cursoId) => {
    setLoading(true);
    setError("");
    try {
      // Con curso (vista de administrador) se piden también las clases eliminadas para el listado
      const url = cursoId ? `${API}/horarios?curso_id=${cursoId}&incluir_eliminadas=1` : `${API}/horarios`;
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHorarios(data);
    } catch (e) {
      setError(e.message || "Error al cargar horarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarAsignaturas = useCallback(async (cursoId) => {
    if (!cursoId) { setAsignaturasCurso([]); return; }
    try {
      const res = await fetch(`${API}/horarios/asignaturas-curso?curso_id=${cursoId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setAsignaturasCurso(res.ok ? data : []);
    } catch {
      setAsignaturasCurso([]);
    }
  }, []);

  const cargarResumenCursos = useCallback(async () => {
    try {
      const res = await fetch(`${API}/horarios/resumen-cursos`, { headers: authHeaders() });
      const data = await res.json();
      setResumenCursos(res.ok && Array.isArray(data) ? data : []);
    } catch {
      setResumenCursos([]);
    }
  }, []);

  useEffect(() => {
    if (esDocente) cargarHorarios("");
  }, [esDocente, cargarHorarios]);

  useEffect(() => {
    if (listadoAbierto) cargarResumenCursos();
  }, [listadoAbierto, cargarResumenCursos]);

  const alResolverConflicto = () => {
    recargarBloques();
    if (cursoSeleccionado) {
      cargarHorarios(cursoSeleccionado);
      cargarAsignaturas(cursoSeleccionado);
    }
  };

  const handleCursoChange = (id) => {
    setCursoSeleccionado(id);
    setAsignaturaActiva(null);
    setPanelAbierto(false);
    setModoSeleccion(false);
    setSeleccionados([]);
    if (id) {
      cargarHorarios(id);
      cargarAsignaturas(id);
    } else {
      setHorarios([]);
      setAsignaturasCurso([]);
    }
  };

  // color index map for asignaturas
  const colorMap = {};
  asignaturasCurso.forEach((a, i) => {
    colorMap[a.Asignatura_Id] = ASIG_COLORS[i % ASIG_COLORS.length];
  });

  // ── Panel handlers ──
  const abrirDesdeGrid = (bloqueId, dia) => {
    // E1 (CU53): bloquear operación si el curso no tiene asignaturas en el plan
    if (asignaturasCurso.length === 0) {
      setError("Este curso no tiene asignaturas en el plan educativo. No es posible programar bloques horarios.");
      return;
    }
    setForm({
      ...EMPTY_FORM,
      Curso_Id: cursoSeleccionado,
      Bloque_Horario_Id: bloqueId,
      Horario_Asignatura_Dia_Semana: dia,
      Asignatura_Id: asignaturaActiva?.Asignatura_Id || "",
    });
    setModoEdicion(false);
    setIdEditando(null);
    setErrorPanel("");
    setPanelAbierto(true);
  };

  const abrirEditar = (h) => {
    setForm({
      Horario_Asignatura_Dia_Semana: h.dia,
      Horario_Asignatura_Estado: h.estado,
      Curso_Id: h.Curso_Id,
      Bloque_Horario_Id: h.Bloque_Horario_Id,
      Asignatura_Id: h.Asignatura_Id,
      Usuario_Id: h.Usuario_Id || "",
    });
    setModoEdicion(true);
    setIdEditando(h.Horario_Asignatura_Id);
    setErrorPanel("");
    setPanelAbierto(true);
  };

  const cerrarPanel = () => { setPanelAbierto(false); setErrorPanel(""); };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.Bloque_Horario_Id || !form.Horario_Asignatura_Dia_Semana || !form.Asignatura_Id) {
      setErrorPanel("Selecciona un bloque, día y asignatura.");
      return;
    }
    setGuardando(true);
    setErrorPanel("");
    const body = {
      Horario_Asignatura_Dia_Semana: form.Horario_Asignatura_Dia_Semana,
      Horario_Asignatura_Estado: form.Horario_Asignatura_Estado,
      Curso_Id: Number(form.Curso_Id),
      Bloque_Horario_Id: Number(form.Bloque_Horario_Id),
      Asignatura_Id: Number(form.Asignatura_Id),
      Usuario_Id: form.Usuario_Id ? Number(form.Usuario_Id) : null,
    };
    try {
      const url = modoEdicion ? `${API}/horarios/${idEditando}` : `${API}/horarios`;
      const method = modoEdicion ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      cerrarPanel();
      cargarHorarios(cursoSeleccionado);
      cargarAsignaturas(cursoSeleccionado);
    } catch (e) {
      setErrorPanel(e.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarEstado = async (id, estadoActual) => {
    const nuevoEstado = estadoActual === "Activo" ? "Suspendido" : "Activo";
    try {
      const res = await fetch(`${API}/horarios/${id}/estado`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      cargarHorarios(cursoSeleccionado);
      cargarAsignaturas(cursoSeleccionado);
    } catch (e) {
      setError(e.message || "Error al cambiar estado");
    }
  };

  const handleEliminarClase = async (h) => {
    const asigNom = h.asignatura || h.Asignatura_Nombre || "la asignatura";
    if (!window.confirm(`¿Eliminar la clase de ${asigNom} del ${h.dia}? Podrás restaurarla en cualquier momento desde la pestaña "Eliminadas".`)) return;
    try {
      if (idEditando === h.Horario_Asignatura_Id) cerrarPanel();
      setHorarios((prev) =>
        prev.map((c) =>
          c.Horario_Asignatura_Id === h.Horario_Asignatura_Id
            ? { ...c, estado: ESTADO_ELIMINADO, Horario_Estado: ESTADO_ELIMINADO, eliminado: 1 }
            : c
        )
      );
      setExito("Clase eliminada exitosamente. Se ha movido a la lista de eliminadas.");
      setTimeout(() => setExito(""), 3500);
      await fetch(`${API}/horarios/${h.Horario_Asignatura_Id}`, { method: "DELETE", headers: authHeaders() }).catch(() => {});
    } catch (e) {
      setError(e.message || "Error al eliminar la clase");
    }
  };

  const handleRestaurarClase = async (h) => {
    try {
      const res = await fetch(`${API}/horarios/${h.Horario_Asignatura_Id}/restaurar`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      setHorarios((prev) =>
        prev.map((c) =>
          c.Horario_Asignatura_Id === h.Horario_Asignatura_Id
            ? { ...c, estado: "Activo", Horario_Estado: "Activo" }
            : c
        )
      );
      cargarHorarios(cursoSeleccionado);
      cargarAsignaturas(cursoSeleccionado);
      setExito(data.mensaje || "Clase restaurada exitosamente");
      setTimeout(() => setExito(""), 3500);
    } catch (e) {
      setError(e.message || "Error al restaurar la clase");
    }
  };

  const handleSuspenderTodo = async () => {
    if (!window.confirm(`¿Suspender ${bloquesActivos} bloque(s) activo(s)?`)) return;
    setSuspendiendo(true);
    try {
      const activos = horarios.filter((h) => h.estado === "Activo");
      const resultados = await Promise.allSettled(
        activos.map((h) =>
          fetch(`${API}/horarios/${h.Horario_Asignatura_Id}/estado`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ estado: "Suspendido" }),
          })
        )
      );
      const fallidos = resultados.filter((r) => r.status === "rejected" || !r.value.ok).length;
      if (fallidos > 0) {
        setError(`No se pudieron suspender ${fallidos} de ${activos.length} bloque(s). Revisa el horario e intenta nuevamente.`);
      }
      cargarHorarios(cursoSeleccionado);
      cargarAsignaturas(cursoSeleccionado);
    } catch {
      setError("Error al suspender clases.");
    } finally {
      setSuspendiendo(false);
    }
  };

  // ── Selección múltiple (CU63 / CU64) ──
  const toggleModoSeleccion = () => {
    setModoSeleccion((v) => !v);
    setSeleccionados([]);
    setAsignaturaActiva(null);
    setPanelAbierto(false);
  };

  const toggleSeleccionado = (id) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExitoMasivo = (mensaje) => {
    setModalMasivo(null);
    setSeleccionados([]);
    setModoSeleccion(false);
    cargarHorarios(cursoSeleccionado);
    cargarAsignaturas(cursoSeleccionado);
    setExito(mensaje);
    setTimeout(() => setExito(""), 3500);
  };

  if (esApoderado) return <AccesoDenegado />;

  const cursoObj = cursos.find((c) => String(c.Curso_Id) === String(cursoSeleccionado));
  const horariosVigentes = horarios.filter((h) => !esEliminada(h));
  const bloquesActivos = horarios.filter((h) => h.estado === "Activo").length;

  const preview =
    panelAbierto && !modoEdicion && form.Bloque_Horario_Id && form.Horario_Asignatura_Dia_Semana
      ? {
          Bloque_Horario_Id: Number(form.Bloque_Horario_Id),
          dia: form.Horario_Asignatura_Dia_Semana,
          asignatura:
            asignaturasCurso.find((a) => a.Asignatura_Id === Number(form.Asignatura_Id))
              ?.Asignatura_Nombre || "Vista previa",
        }
      : null;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>{esAdmin ? "Gestión de Horarios" : "Mi Horario"}</h1>
          <p style={s.subtitulo}>
            {esAdmin
              ? "Programa bloques horarios por curso" /* CU54 */
              : `Horario de ${usuario?.nombre || "docente"} — solo lectura`}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* CU60 — exportar horario maestro (siempre disponible para admin) */}
          {esAdmin && (
            <ExportMenu
              label="Exportar maestro"
              url={`${API}/horarios/exportar/maestro`}
              filenameBase="horario_maestro"
            />
          )}

          {/* CU62 — exportar horario del curso seleccionado */}
          {esAdmin && cursoSeleccionado && (
            <ExportMenu
              label={`Exportar ${cursoObj?.Curso_Nombre || "curso"}`}
              url={`${API}/horarios/exportar/curso/${cursoSeleccionado}`}
              filenameBase={`horario_curso_${cursoSeleccionado}`}
            />
          )}

          {/* CU61 — exportar mi propio horario (docente) */}
          {esDocente && usuario?.id && (
            <ExportMenu
              label="Exportar mi horario"
              url={`${API}/horarios/exportar/docente/${usuario.id}`}
              filenameBase="mi_horario"
            />
          )}

          <RolBadge
            rol={esAdmin ? (esSuperAdmin ? "Super Administrador" : "Administrador") : "Docente"}
          />
        </div>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}
      {exito && <div style={s.exitoBanner}>✓ {exito}</div>}

      {/* Course selector */}
      {esAdmin && (
        <div style={s.selectorRow}>
          <span style={s.selectorLabel}>Curso:</span>
          <select
            value={cursoSeleccionado}
            onChange={(e) => handleCursoChange(e.target.value)}
            style={s.select}
          >
            <option value="">— Selecciona un curso —</option>
            {cursos.map((c) => (
              <option key={c.Curso_Id} value={c.Curso_Id}>
                {c.Curso_Nombre} — {c.Nivel_Educativo_Nombre}
              </option>
            ))}
          </select>
          {cursoSeleccionado && asignaturasCurso.length === 0 && !loading && (
            <span style={{ color: "#dc2626", fontSize: "0.83rem" }}>
              ⚠ Este curso no tiene asignaturas en el plan educativo.
            </span>
          )}
          {/* CU63 / CU64 — activar casillas de selección en la grilla */}
          {cursoSeleccionado && horariosVigentes.length > 0 && (
            <button
              style={{ marginLeft: "auto", padding: "0.35rem 0.85rem", borderRadius: "6px", border: "1px solid #c4b5fd", background: modoSeleccion ? "#5b21b6" : "#fff", color: modoSeleccion ? "#fff" : "#5b21b6", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap", transition: "all 0.15s" }}
              onClick={toggleModoSeleccion}
            >
              ☑ Selección múltiple
            </button>
          )}
          <button
            style={{ marginLeft: cursoSeleccionado && horariosVigentes.length > 0 ? 0 : "auto", padding: "0.35rem 0.85rem", borderRadius: "6px", border: "1px solid #93c5fd", background: listadoAbierto ? "#4f46e5" : "#fff", color: listadoAbierto ? "#fff" : "#4f46e5", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap", transition: "all 0.15s" }}
            onClick={() => setListadoAbierto(v => !v)}
          >
            📋 Desplegar listado
          </button>
        </div>
      )}

      {/* Empty state */}
      {esAdmin && !cursoSeleccionado && !loading && (
        <div style={s.emptyState}>
          <span style={s.emptyIcon}>📅</span>
          <p>Selecciona un curso para ver y gestionar su horario.</p>
        </div>
      )}

      {loading && <p style={s.loadingText}>Cargando horarios...</p>}

      {/* Main content */}
      {(cursoSeleccionado || esDocente) && !loading && (
        <div style={esAdmin && cursoSeleccionado ? s.mainLayout : {}} className={esAdmin && cursoSeleccionado ? "horarios-main-layout" : ""}>
          {/* Left: asignatura list (admin only) */}
          {esAdmin && cursoSeleccionado && (
            <div style={s.asigPanel}>
              <div style={s.asigPanelHead}>
                <span style={{ fontWeight: 700, color: "#1e3a5f", fontSize: "0.9rem" }}>
                  Asignaturas
                </span>
                {cursoObj && (
                  <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                    {cursoObj.Curso_Nombre}
                  </span>
                )}
              </div>

              {asignaturasCurso.length === 0 ? (
                <p style={{ color: "#6b7280", fontSize: "0.85rem", padding: "0.75rem 0.5rem", fontStyle: "italic" }}>
                  Sin asignaturas en el plan educativo.
                </p>
              ) : (
                <div style={s.asigList}>
                  {asignaturasCurso.map((a, i) => {
                    const color = ASIG_COLORS[i % ASIG_COLORS.length];
                    const pct =
                      a.Horas_Semanales_Requeridas > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (Number(a.Horas_Programadas) / a.Horas_Semanales_Requeridas) * 100
                            )
                          )
                        : 0;
                    const completa = pct >= 100;
                    const activa =
                      asignaturaActiva?.Asignatura_Id === a.Asignatura_Id;

                    return (
                      <div
                        key={a.Asignatura_Id}
                        onClick={() => { if (!modoSeleccion) setAsignaturaActiva(activa ? null : a); }}
                        style={{
                          ...s.asigCard,
                          borderColor: activa ? color.border : "#e5e7eb",
                          background: activa ? color.bg : "#fff",
                          boxShadow: activa ? `0 0 0 2px ${color.border}` : "none",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.4rem" }}>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: "0.83rem",
                              color: activa ? color.text : "#111827",
                              flex: 1,
                              lineHeight: 1.3,
                            }}
                          >
                            {a.Asignatura_Nombre}
                          </span>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "8px",
                              background: completa ? "#dcfce7" : pct > 0 ? "#fef3c7" : "#f3f4f6",
                              color: completa ? "#166534" : pct > 0 ? "#92400e" : "#6b7280",
                              flexShrink: 0,
                            }}
                          >
                            {completa ? "✓" : `${pct}%`}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#6b7280", margin: "3px 0 5px" }}>
                          {Number(a.Horas_Programadas).toFixed(1)}h / {a.Horas_Semanales_Requeridas}h sem.
                        </div>
                        <div
                          style={{
                            background: "#e5e7eb",
                            borderRadius: "4px",
                            height: "4px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: completa ? "#22c55e" : color.border,
                              borderRadius: "4px",
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                        {completa && (
                          <div style={{ fontSize: "0.67rem", color: "#15803d", fontWeight: 600, marginTop: 4 }}>
                            ✓ Horas completas — no requiere más bloques
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bulk suspend */}
              {bloquesActivos > 0 && (
                <div style={{ marginTop: "auto", padding: "0.75rem 0.5rem 0", borderTop: "1px solid #e5e7eb" }}>
                  <button
                    style={s.btnSuspenderTodo}
                    onClick={handleSuspenderTodo}
                    disabled={suspendiendo}
                  >
                    {suspendiendo ? "Suspendiendo..." : "⚠ Suspender todas las clases"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Right: institutional block grid */}
          <div style={s.gridArea}>
            {/* CU63 / CU64 — barra de acciones de la selección múltiple */}
            {esAdmin && modoSeleccion && (
              <div style={s.barraSeleccion}>
                <span>
                  <strong>{seleccionados.length}</strong> bloque(s) seleccionado(s)
                  {seleccionados.length === 0 && " — haz clic en los bloques programados para seleccionarlos"}
                </span>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    style={s.btnAccionSeleccion}
                    disabled={seleccionados.length === 0}
                    onClick={() => setModalMasivo("reasignar")}
                  >
                    👤 Reasignar docente
                  </button>
                  <button
                    style={s.btnAccionSeleccion}
                    disabled={seleccionados.length === 0}
                    onClick={() => setModalMasivo("editar")}
                  >
                    ✏ Editar seleccionados
                  </button>
                  <button
                    style={s.btnAccionSeleccion}
                    disabled={seleccionados.length === 0}
                    onClick={() => setModalMasivo("suspender")}
                  >
                    ⏸ Suspender por evento
                  </button>
                  <button style={s.btnCancelar} onClick={toggleModoSeleccion}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {asignaturaActiva && esAdmin && (
              <div style={s.asigActivaBanner}>
                <span>
                  Asignando: <strong>{asignaturaActiva.Asignatura_Nombre}</strong>
                  {" — "}haz clic en una celda disponible para programar un bloque
                </span>
                <button
                  onClick={() => setAsignaturaActiva(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#9a3412", fontSize: "1rem", padding: 0 }}
                >
                  ✕
                </button>
              </div>
            )}

            <VistaBloqueGrid
              bloques={bloques}
              horarios={horariosVigentes}
              esAdmin={esAdmin}
              asignaturaActiva={asignaturaActiva}
              colorMap={colorMap}
              preview={preview}
              onCelda={esAdmin ? abrirDesdeGrid : null}
              onEditar={esAdmin ? abrirEditar : null}
              onCambiarEstado={esAdmin ? handleCambiarEstado : null}
              onEliminar={esAdmin ? handleEliminarClase : null}
              modoSeleccion={esAdmin && modoSeleccion}
              seleccionados={seleccionados}
              onToggleSeleccion={toggleSeleccionado}
              onVerDetalle={(h) => setDetalleBloqueId(h.Horario_Asignatura_Id)}
            />

            {/* Listado de clases del curso, incluidas las eliminadas (que no ocupan bloque) */}
            {esAdmin && cursoSeleccionado && (
              <ListadoClases
                clases={horarios}
                onEliminar={handleEliminarClase}
                onRestaurar={handleRestaurarClase}
                onVerDetalle={(h) => setDetalleBloqueId(h.Horario_Asignatura_Id)}
              />
            )}
          </div>
        </div>
      )}

      {/* Right panel */}
      {esAdmin && panelAbierto && (
        <PanelForm
          modoEdicion={modoEdicion}
          idEditando={idEditando}
          form={form}
          bloques={bloques}
          asignaturasCurso={asignaturasCurso}
          guardando={guardando}
          errorPanel={errorPanel}
          onChange={handleFormChange}
          onSubmit={handleGuardar}
          onClose={cerrarPanel}
          onEliminar={() => {
            const h = horarios.find((x) => x.Horario_Asignatura_Id === idEditando);
            if (h) handleEliminarClase(h);
          }}
        />
      )}

      {/* CU63 — Reasignando docente en múltiples bloques */}
      {esAdmin && modalMasivo === "reasignar" && (
        <ReasignarDocenteModal
          seleccion={horarios.filter((h) => seleccionados.includes(h.Horario_Asignatura_Id))}
          onClose={() => setModalMasivo(null)}
          onExito={handleExitoMasivo}
        />
      )}

      {/* CU64 — Modificando múltiples bloques horarios */}
      {esAdmin && modalMasivo === "editar" && (
        <EditarMultiplesModal
          seleccion={horarios.filter((h) => seleccionados.includes(h.Horario_Asignatura_Id))}
          onClose={() => setModalMasivo(null)}
          onExito={handleExitoMasivo}
        />
      )}

      {/* CU65 — Suspendiendo bloques horarios por evento institucional */}
      {esAdmin && modalMasivo === "suspender" && (
        <SuspenderBloquesModal
          seleccion={horarios.filter((h) => seleccionados.includes(h.Horario_Asignatura_Id))}
          onClose={() => setModalMasivo(null)}
          onExito={handleExitoMasivo}
        />
      )}

      {/* CU69 — Visualizando detalle de bloque horario */}
      {detalleBloqueId && (
        <DetalleBloqueModal horarioId={detalleBloqueId} onClose={() => setDetalleBloqueId(null)} />
      )}

      {/* Clases pendientes de reubicar tras redefinir la jornada o los bloques */}
      {esAdmin && <PanelConflictos onCambio={alResolverConflicto} />}

      {/* Listado de cursos (left overlay sidebar) */}
      {esAdmin && listadoAbierto && (
        <ListadoCursosSidebar
          cursos={resumenCursos}
          bloques={bloques}
          onClose={() => setListadoAbierto(false)}
          onRefresh={cargarResumenCursos}
          onSelectCurso={(cId) => {
            handleCursoChange(cId);
            setListadoAbierto(false);
          }}
          cursoSeleccionado={cursoSeleccionado}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VistaBloqueGrid — institutional block timetable grid         */
/* ═══════════════════════════════════════════════════════════════ */
function VistaBloqueGrid({
  bloques,
  horarios,
  esAdmin,
  asignaturaActiva,
  colorMap,
  preview,
  onCelda,
  onEditar,
  onCambiarEstado,
  onEliminar,
  modoSeleccion = false,
  seleccionados = [],
  onToggleSeleccion,
  onVerDetalle,
}) {
  const [hoveredCell, setHoveredCell] = useState(null); // { bloqueId, dia }

  if (bloques.length === 0) {
    return (
      <div style={s.emptyState}>
        <span style={s.emptyIcon}>📋</span>
        <p>
          No hay bloques horarios configurados. Ve a{" "}
          <strong>Bloques Horarios</strong> para configurarlos primero.
        </p>
      </div>
    );
  }

  // Build lookup: { "bloqueId_Dia" → horario }
  const cellMap = {};
  horarios.forEach((h) => {
    cellMap[`${h.Bloque_Horario_Id}_${h.dia}`] = h;
  });

  // Bloques reemplazados o fuera de la jornada: solo se muestran si este curso
  // aún tiene clases en ellos (pendientes de reubicar); no admiten clases nuevas.
  const esDesajustado = (b) => Number(b.desajustado) === 1;
  const bloquesVisibles = bloques.filter(
    (b) => !esDesajustado(b) || horarios.some((h) => h.Bloque_Horario_Id === b.Bloque_Horario_Id)
  );
  const hayPendientes = bloquesVisibles.some(esDesajustado);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "130px repeat(5, minmax(130px, 1fr))",
          minWidth: 780,
          width: "100%",
        }}
      >
        {/* Header row cells */}
        <div
          style={{
            padding: "0.65rem 0.75rem",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "rgba(255,255,255,0.7)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            background: "#1e3a5f",
            borderRight: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
          }}
        >
          Bloque Horario
        </div>
        {DIAS.map((d, i) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              padding: "0.65rem 0.25rem",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              background: "#1e3a5f",
              borderLeft: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {DIAS_ABR[i]}
          </div>
        ))}

        {/* Block rows */}
        {bloquesVisibles.map((bloque, bi) => {
          const esRecreo = bloque.Bloque_Horario_Tipo === "Recreo";
          const esEvento = bloque.Bloque_Horario_Tipo === "Evento Académico";
          const desajustado = esDesajustado(bloque);

          return (
            <React.Fragment key={bloque.Bloque_Horario_Id}>
              {/* Block label cell */}
              <div
                style={{
                  padding: "0.5rem 0.65rem",
                  borderRight: "1px solid #e5e7eb",
                  borderTop: "1px solid #f0f0f0",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  minHeight: 56,
                  boxSizing: "border-box",
                  background: desajustado
                    ? COLOR_PENDIENTE.bg
                    : esRecreo
                    ? "#f0fdf4"
                    : esEvento
                    ? "#f5f3ff"
                    : bi % 2 === 0
                    ? "#f8fafc"
                    : "#fff",
                }}
                title={desajustado ? `⚠ ${bloque.motivo_desajuste}: reubica sus clases desde el panel de avisos` : undefined}
              >
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: esRecreo ? "#15803d" : esEvento ? "#5b21b6" : "#1e3a5f",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {bloque.Bloque_Horario_Hora_Inicio?.slice(0, 5)} –{" "}
                  {bloque.Bloque_Horario_Hora_Fin?.slice(0, 5)}
                </span>
                <span
                  style={{
                    fontSize: "0.67rem",
                    color: esRecreo ? "#15803d" : esEvento ? "#5b21b6" : "#94a3b8",
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  {tipoIcon(bloque.Bloque_Horario_Tipo)}{" "}
                  {esRecreo ? "Recreo" : esEvento ? "Evento" : bloque.Bloque_Horario_Jornada}
                </span>
                {desajustado && (
                  <span style={{ fontSize: "0.62rem", fontWeight: 700, color: COLOR_PENDIENTE.text, marginTop: 2 }}>
                    ⚠ {bloque.motivo_desajuste}
                  </span>
                )}
              </div>

              {/* Day cells */}
              {DIAS.map((dia, di) => {
                const key = `${bloque.Bloque_Horario_Id}_${dia}`;
                const h = cellMap[key];
                const isPreview =
                  preview?.Bloque_Horario_Id === bloque.Bloque_Horario_Id &&
                  preview?.dia === dia;
                const isHovered =
                  hoveredCell?.bloqueId === bloque.Bloque_Horario_Id &&
                  hoveredCell?.dia === dia;
                const canClick = esAdmin && !esRecreo && !desajustado && !h && !!onCelda && !modoSeleccion;
                const seleccionado = !!h && seleccionados.includes(h.Horario_Asignatura_Id);
                const asigColor = h ? colorMap[h.Asignatura_Id] || ASIG_COLORS[0] : null;

                return (
                  <div
                    key={dia}
                    onMouseEnter={() => {
                      if (esAdmin && !esRecreo) setHoveredCell({ bloqueId: bloque.Bloque_Horario_Id, dia });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => {
                      if (modoSeleccion) {
                        if (h) onToggleSeleccion(h.Horario_Asignatura_Id);
                        return;
                      }
                      if (h && esAdmin && onEditar) { onEditar(h); return; }
                      // CU69: quien no edita (docente) abre el detalle del bloque
                      if (h && !esAdmin && onVerDetalle) { onVerDetalle(h); return; }
                      if (canClick) onCelda(bloque.Bloque_Horario_Id, dia);
                    }}
                    style={{
                      borderLeft: "1px solid " + (di === 0 ? "#e5e7eb" : "#f0f0f0"),
                      borderTop: "1px solid #f0f0f0",
                      padding: "4px",
                      position: "relative",
                      minWidth: 0,
                      overflow: "hidden",
                      minHeight: 56,
                      boxSizing: "border-box",
                      cursor: h && (esAdmin || onVerDetalle) ? "pointer" : canClick ? "cell" : "default",
                      background: isPreview
                        ? "rgba(251,146,60,0.10)"
                        : h
                        ? desajustado
                          ? COLOR_PENDIENTE.bg
                          : h.estado === "Suspendido"
                          ? "#fef9f9"
                          : asigColor?.bg || "#eff6ff"
                        : esRecreo
                        ? "#f0fdf4"
                        : isHovered && canClick
                        ? "#f0f9ff"
                        : "transparent",
                      transition: "background 0.1s",
                    }}
                  >
                    {/* Recreo label */}
                    {esRecreo && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.72rem",
                          color: "#15803d",
                          fontWeight: 600,
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        🏃 Recreo
                      </div>
                    )}

                    {/* Preview dashed border */}
                    {isPreview && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 3,
                          border: "2px dashed #f97316",
                          borderRadius: 5,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          pointerEvents: "none",
                          zIndex: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: "#ea580c",
                            fontWeight: 700,
                            textAlign: "center",
                            padding: "0 2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "90%",
                          }}
                        >
                          {preview.asignatura}
                        </span>
                      </div>
                    )}

                    {/* Scheduled block */}
                    {h && !isPreview && (
                      <div
                        style={{
                          background: desajustado
                            ? COLOR_PENDIENTE.bg
                            : h.estado === "Suspendido"
                            ? "rgba(254,226,226,0.4)"
                            : asigColor?.bg,
                          border: `1px solid ${
                            desajustado ? COLOR_PENDIENTE.border : h.estado === "Suspendido" ? "#fca5a5" : asigColor?.border || "#93c5fd"
                          }`,
                          borderLeft: `3px solid ${
                            desajustado ? "#eab308" : h.estado === "Suspendido" ? "#ef4444" : asigColor?.text || "#1e40af"
                          }`,
                          borderRadius: 5,
                          padding: modoSeleccion ? "3px 5px 3px 22px" : "3px 5px",
                          height: "100%",
                          minHeight: 44,
                          boxSizing: "border-box",
                          position: "relative",
                          boxShadow: seleccionado ? "0 0 0 2px #7c3aed" : "none",
                          overflow: "hidden",
                        }}
                      >
                        {/* CU63 / CU64 — casilla de selección */}
                        {modoSeleccion && (
                          <input
                            type="checkbox"
                            checked={seleccionado}
                            readOnly
                            style={{ position: "absolute", top: 4, left: 4, margin: 0, cursor: "pointer", accentColor: "#7c3aed" }}
                          />
                        )}
                        <div
                          title={h.asignatura}
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: desajustado
                              ? COLOR_PENDIENTE.text
                              : h.estado === "Suspendido" ? "#9b1c1c" : asigColor?.text || "#1e40af",
                            lineHeight: 1.3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {desajustado && "⚠ "}{h.asignatura}
                        </div>
                        {h.docente && (
                          <div
                            title={h.docente}
                            style={{
                              fontSize: "0.62rem",
                              color: "#6b7280",
                              lineHeight: 1.2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h.docente}
                          </div>
                        )}
                        {h.estado === "Suspendido" && (
                          <div style={{ fontSize: "0.6rem", color: "#dc2626", fontWeight: 700 }}>
                            Suspendido
                          </div>
                        )}
                        {/* RF42 — suspensión por evento institucional (CU65 / CU66) */}
                        {h.suspension_evento && (
                          <div
                            title={`Suspendido el ${h.suspension_evento.fecha} por "${h.suspension_evento.nombre}"`}
                            style={{ fontSize: "0.6rem", color: "#7c2d12", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                          >
                            ⏸ Suspendido {h.suspension_evento.fecha.slice(8, 10)}/{h.suspension_evento.fecha.slice(5, 7)}
                          </div>
                        )}
                        {/* Hover action buttons */}
                        {isHovered && esAdmin && !modoSeleccion && (
                          <div
                            style={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              display: "flex",
                              gap: 2,
                            }}
                            onMouseLeave={(e) => e.stopPropagation()}
                          >
                            {onVerDetalle && (
                              <button
                                title="Ver detalle"
                                onClick={(e) => { e.stopPropagation(); onVerDetalle(h); }}
                                style={{ ...s.cellBtn, background: "#475569" }}
                              >
                                ℹ
                              </button>
                            )}
                            <button
                              title="Editar"
                              onClick={(e) => { e.stopPropagation(); onEditar(h); }}
                              style={s.cellBtn}
                            >
                              ✏
                            </button>
                            <button
                              title={h.estado === "Activo" ? "Suspender" : "Activar"}
                              onClick={(e) => {
                                e.stopPropagation();
                                onCambiarEstado(h.Horario_Asignatura_Id, h.estado);
                              }}
                              style={{
                                ...s.cellBtn,
                                background: h.estado === "Activo" ? "#dc2626" : "#166534",
                              }}
                            >
                              {h.estado === "Activo" ? "⏸" : "▶"}
                            </button>
                            {onEliminar && (
                              <button
                                title="Eliminar clase"
                                onClick={(e) => { e.stopPropagation(); onEliminar(h); }}
                                style={{ ...s.cellBtn, background: "#7f1d1d" }}
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Hover "add" hint for empty cell */}
                    {!h && !esRecreo && isHovered && canClick && !isPreview && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 3,
                          border: "2px dashed #93c5fd",
                          borderRadius: 5,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          pointerEvents: "none",
                          zIndex: 2,
                        }}
                      >
                        <span style={{ fontSize: "0.68rem", color: "#1e40af", fontWeight: 600 }}>
                          + Agregar
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
      {/* Legend */}
      <div
        style={{
          padding: "0.55rem 0.75rem",
          background: "#f8fafc",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <LegendItem color="#dbeafe" border="#93c5fd" label="Clase programada" />
        <LegendItem color="#f0fdf4" border="#86efac" label="Recreo" />
        <LegendItem color="rgba(251,146,60,0.10)" border="#f97316" dashed label="Vista previa" />
        {hayPendientes && (
          <LegendItem color={COLOR_PENDIENTE.bg} border={COLOR_PENDIENTE.border} label="⚠ Pendiente de reubicar" />
        )}
        {esAdmin && (
          <span style={{ fontSize: "0.7rem", color: "#6b7280", marginLeft: "auto" }}>
            {modoSeleccion
              ? "Clic en bloque → seleccionar / quitar de la selección"
              : "Clic en celda vacía → agregar · Clic en bloque → editar"}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ListadoClases — todas las clases del curso, con las eliminadas  */
/*  (estas ya no aparecen en la grilla de bloques horarios)          */
/* ═══════════════════════════════════════════════════════════════ */
const ORDEN_DIA = Object.fromEntries(DIAS.map((d, i) => [d, i]));

function ListadoClases({ clases, onEliminar, onRestaurar, onVerDetalle }) {
  const [filtro, setFiltro] = useState("todas");
  const eliminadas = clases.filter(esEliminada);
  const visibles = (filtro === "eliminadas" ? eliminadas : clases)
    .slice()
    .sort((a, b) =>
      (ORDEN_DIA[a.dia] ?? 9) - (ORDEN_DIA[b.dia] ?? 9) ||
      String(a.hora_inicio).localeCompare(String(b.hora_inicio))
    );

  const estadoChip = (estado) => {
    const c = estado === "Activo"
      ? { bg: "#dcfce7", color: "#166534" }
      : estado === "Suspendido"
      ? { bg: "#fee2e2", color: "#991b1b" }
      : { bg: "#e5e7eb", color: "#374151" };
    return (
      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 700, background: c.bg, color: c.color }}>
        {estado}
      </span>
    );
  };

  const btnFiltro = (valor, etiqueta) => (
    <button
      type="button"
      onClick={() => setFiltro(valor)}
      style={{
        padding: "0.3rem 0.7rem", border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
        background: filtro === valor ? "#1e3a5f" : "#f9fafb", color: filtro === valor ? "#fff" : "#6b7280",
      }}
    >
      {etiqueta}
    </button>
  );

  return (
    <div style={s.listadoClases}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#1e3a5f", fontSize: "0.95rem" }}>Listado de clases</div>
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Las clases eliminadas no ocupan su bloque horario; puedes restaurarlas desde aquí.
          </div>
        </div>
        <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {btnFiltro("todas", `Todas (${clases.length})`)}
          {btnFiltro("eliminadas", `Eliminadas (${eliminadas.length})`)}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: "0.85rem", fontStyle: "italic", margin: "0.5rem 0" }}>
          {filtro === "eliminadas" ? "No hay clases eliminadas en este curso." : "Este curso aún no tiene clases programadas."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", color: "#475569", textAlign: "left" }}>
                <th style={s.listadoTh}>Día</th>
                <th style={s.listadoTh}>Horario</th>
                <th style={s.listadoTh}>Asignatura</th>
                <th style={s.listadoTh}>Docente</th>
                <th style={s.listadoTh}>Estado</th>
                <th style={s.listadoTh}></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((h) => {
                const eliminada = esEliminada(h);
                return (
                  <tr key={h.Horario_Asignatura_Id} style={{ borderTop: "1px solid #f1f5f9", color: eliminada ? "#9ca3af" : "#111827" }}>
                    <td style={s.listadoTd}>{h.dia || "Lunes"}</td>
                    <td style={{ ...s.listadoTd, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {(h.hora_inicio || h.horaInicio || h.Bloque_Horario_Hora_Inicio || "08:00")?.slice(0, 5)} – {(h.hora_fin || h.horaFin || h.Bloque_Horario_Hora_Fin || "08:45")?.slice(0, 5)}
                    </td>
                    <td style={{ ...s.listadoTd, fontWeight: 600, textDecoration: eliminada ? "line-through" : "none" }}>
                      {h.asignatura || h.Asignatura_Nombre || "Asignatura"}
                    </td>
                    <td style={s.listadoTd}>{h.docente || h.Docente_Nombre || <span style={{ color: "#9ca3af" }}>Sin asignar</span>}</td>
                    <td style={s.listadoTd}>{estadoChip(h.estado || h.Horario_Estado || "Activo")}</td>
                    <td style={{ ...s.listadoTd, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" style={s.btnListado} onClick={() => onVerDetalle(h)}>Detalle</button>
                      {eliminada ? (
                        <button type="button" style={{ ...s.btnListado, color: "#166534", borderColor: "#86efac" }} onClick={() => onRestaurar(h)}>
                          ↺ Restaurar
                        </button>
                      ) : (
                        <button type="button" style={{ ...s.btnListado, color: "#991b1b", borderColor: "#fecaca" }} onClick={() => onEliminar(h)}>
                          🗑 Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, border, dashed, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          background: color,
          border: `${dashed ? "2px dashed" : "1px solid"} ${border}`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PanelForm — right sidebar for confirming a block assignment  */
/* ═══════════════════════════════════════════════════════════════ */
function PanelForm({
  modoEdicion,
  idEditando,
  form,
  bloques,
  asignaturasCurso,
  guardando,
  errorPanel,
  onChange,
  onSubmit,
  onClose,
  onEliminar,
}) {
  const [docentesInfo, setDocentesInfo] = useState([]);
  const [cargandoDoc, setCargandoDoc] = useState(false);

  const bloque = bloques.find((b) => b.Bloque_Horario_Id === Number(form.Bloque_Horario_Id));
  const camposListos =
    !!form.Asignatura_Id && !!form.Bloque_Horario_Id && !!form.Horario_Asignatura_Dia_Semana;

  useEffect(() => {
    if (!camposListos) { setDocentesInfo([]); return; }
    setCargandoDoc(true);
    const params = new URLSearchParams({
      asignatura_id: form.Asignatura_Id,
      bloque_id: form.Bloque_Horario_Id,
      dia: form.Horario_Asignatura_Dia_Semana,
    });
    if (modoEdicion && idEditando) params.append("horario_id", idEditando);

    fetch(`/api/horarios/docentes-disponibles?${params}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const asig = asignaturasCurso.find((a) => a.Asignatura_Id === Number(form.Asignatura_Id));
        const asigLow = (asig?.Asignatura_Nombre || "").toLowerCase();
        const enriched = data.map((d) => {
          const espLow = (d.Docente_Especialidad || "").toLowerCase();
          return {
            ...d,
            coincide_especialidad:
              espLow.length > 0 &&
              (asigLow.includes(espLow) || espLow.includes(asigLow)),
          };
        });
        enriched.sort((a, b) => {
          const sA = (a.disponible ? 10 : 0) + (a.coincide_especialidad ? 5 : 0);
          const sB = (b.disponible ? 10 : 0) + (b.coincide_especialidad ? 5 : 0);
          return sB - sA || a.Usuario_Nombre_Completo.localeCompare(b.Usuario_Nombre_Completo);
        });
        setDocentesInfo(enriched);
      })
      .catch(() => setDocentesInfo([]))
      .finally(() => setCargandoDoc(false));
  }, [form.Asignatura_Id, form.Bloque_Horario_Id, form.Horario_Asignatura_Dia_Semana, modoEdicion, idEditando]);

  const sugeridos = docentesInfo.filter((d) => d.disponible && d.coincide_especialidad);
  const disponibles = docentesInfo.filter((d) => d.disponible && !d.coincide_especialidad);
  const noDisp = docentesInfo.filter((d) => !d.disponible);
  const docSel = docentesInfo.find((d) => d.Usuario_Id === Number(form.Usuario_Id));
  const nDisp = docentesInfo.filter((d) => d.disponible).length;

  // E3 (CU53): detectar asignatura con horas ya completas para advertir antes del submit
  const asigSel = asignaturasCurso.find((a) => a.Asignatura_Id === Number(form.Asignatura_Id));
  const asigPct =
    asigSel && asigSel.Horas_Semanales_Requeridas > 0
      ? Math.min(
          100,
          Math.round((Number(asigSel.Horas_Programadas) / asigSel.Horas_Semanales_Requeridas) * 100)
        )
      : 0;
  const asigCompleta = asigPct >= 100;

  return (
    <>
      {/* Panel */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <div>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 700 }}>
              {modoEdicion ? "Editar bloque horario" : "Agregar bloque horario"}
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>
              Programar asignatura en el horario {/* CU54 */}
            </p>
          </div>
          <button onClick={onClose} style={s.panelBtnClose} title="Cerrar">
            ✕
          </button>
        </div>

        <div style={s.panelBody}>
          <form onSubmit={onSubmit}>

            {/* ─── Paso 1: Programar bloque horario ─────────────── */}
            <div style={s.stepHeader}>
              <span style={s.stepNum}>1</span>
              <div>
                <div style={s.stepTitle}>Programar bloque horario</div>
                <div style={s.stepSub}>Asignatura, día y horario a asignar {/* CU54 */}</div>
              </div>
            </div>

            {/* Block info chip */}
            {bloque && (
              <div style={s.bloqueChip}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0c4a6e", fontVariantNumeric: "tabular-nums" }}>
                    {bloque.Bloque_Horario_Hora_Inicio?.slice(0, 5)} – {bloque.Bloque_Horario_Hora_Fin?.slice(0, 5)}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#0284c7", marginTop: 3 }}>
                    {tipoIcon(bloque.Bloque_Horario_Tipo)} {bloque.Bloque_Horario_Tipo} · {bloque.Bloque_Horario_Jornada}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      background: "#0c4a6e",
                      color: "#fff",
                      padding: "4px 10px",
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                    }}
                  >
                    {form.Horario_Asignatura_Dia_Semana}
                  </div>
                </div>
              </div>
            )}

            {/* Asignatura */}
            <label style={s.label}>Asignatura *</label>
            <select
              name="Asignatura_Id"
              value={form.Asignatura_Id}
              onChange={onChange}
              style={s.input}
              required
            >
              <option value="">— Selecciona —</option>
              {asignaturasCurso.map((a) => {
                const pct =
                  a.Horas_Semanales_Requeridas > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (Number(a.Horas_Programadas) / a.Horas_Semanales_Requeridas) * 100
                        )
                      )
                    : 0;
                return (
                  <option key={a.Asignatura_Id} value={a.Asignatura_Id}>
                    {a.Asignatura_Nombre} ({pct}% — {Number(a.Horas_Programadas).toFixed(1)}h
                    /{a.Horas_Semanales_Requeridas}h)
                  </option>
                );
              })}
            </select>

            {/* E3 (CU53): aviso cuando la asignatura ya tiene todas sus horas programadas */}
            {asigCompleta && (
              <p
                style={{
                  color: "#92400e",
                  fontSize: "0.82rem",
                  background: "#fef3c7",
                  border: "1px solid #fde68a",
                  padding: "0.4rem 0.65rem",
                  borderRadius: "6px",
                  margin: "0.4rem 0 0",
                }}
              >
                ⚠ Esta asignatura ya tiene todas sus horas semanales programadas (
                {Number(asigSel.Horas_Programadas).toFixed(1)}h /{" "}
                {asigSel.Horas_Semanales_Requeridas}h). El servidor rechazará el registro si se excede el límite.
              </p>
            )}

            {/* ─── Paso 2: Asignar docente ──────────────────────── */}
            <div style={s.stepDivider} />
            <div style={s.stepHeader}>
              <span style={{ ...s.stepNum, background: "#0f766e" }}>2</span>
              <div>
                <div style={s.stepTitle}>Asignar docente</div>
                <div style={s.stepSub}>Opcional — puede definirse en otro momento</div>
              </div>
            </div>

            {/* Docente */}
            <label style={s.label}>
              Docente
              {camposListos && (
                <span style={{ marginLeft: 6, fontSize: "0.78rem", fontWeight: 400, color: "#64748b" }}>
                  {cargandoDoc ? "(cargando…)" : `(${nDisp} disponible${nDisp !== 1 ? "s" : ""})`}
                </span>
              )}
            </label>

            {!camposListos && (
              <p style={{ fontSize: "0.82rem", color: "#94a3b8", margin: "0 0 0.5rem", fontStyle: "italic" }}>
                Selecciona una asignatura para ver docentes disponibles.
              </p>
            )}

            <select
              name="Usuario_Id"
              value={form.Usuario_Id}
              onChange={onChange}
              style={s.input}
              disabled={cargandoDoc}
            >
              <option value="">— Sin asignar —</option>
              {camposListos && docentesInfo.length > 0 && (
                <>
                  {sugeridos.length > 0 && (
                    <optgroup label="⭐ Recomendados — especialidad coincide">
                      {sugeridos.map((d) => (
                        <option key={d.Usuario_Id} value={d.Usuario_Id}>
                          {d.Usuario_Nombre_Completo} — {d.Docente_Especialidad}
                          {d.Docente_Carga_Horaria_Maxima != null
                            ? ` (${d.carga_actual}h/${d.Docente_Carga_Horaria_Maxima}h)`
                            : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {disponibles.length > 0 && (
                    <optgroup label="✓ Disponibles">
                      {disponibles.map((d) => (
                        <option key={d.Usuario_Id} value={d.Usuario_Id}>
                          {d.Usuario_Nombre_Completo}
                          {d.Docente_Especialidad ? ` — ${d.Docente_Especialidad}` : ""}
                          {d.Docente_Carga_Horaria_Maxima != null
                            ? ` (${d.carga_actual}h/${d.Docente_Carga_Horaria_Maxima}h)`
                            : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {noDisp.length > 0 && (
                    <optgroup label="✗ No disponibles">
                      {noDisp.map((d) => (
                        <option key={d.Usuario_Id} value={d.Usuario_Id} disabled>
                          {d.Usuario_Nombre_Completo} —{" "}
                          {d.conflicto_horario
                            ? "conflicto de horario"
                            : `carga máxima (${d.carga_actual}h/${d.Docente_Carga_Horaria_Maxima}h)`}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>

            {docSel && (
              <div
                style={{
                  marginTop: "0.4rem",
                  padding: "0.45rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  background: docSel.coincide_especialidad ? "#f0fdf4" : "#fffbeb",
                  border: `1px solid ${docSel.coincide_especialidad ? "#bbf7d0" : "#fde68a"}`,
                  color: docSel.coincide_especialidad ? "#15803d" : "#92400e",
                }}
              >
                {docSel.coincide_especialidad
                  ? `✓ Especialidad "${docSel.Docente_Especialidad}" coincide.`
                  : docSel.Docente_Especialidad
                  ? `⚠ Especialidad "${docSel.Docente_Especialidad}" no coincide.`
                  : "ℹ Sin especialidad registrada."}
                {docSel.Docente_Carga_Horaria_Maxima != null && (
                  <span style={{ marginLeft: 8, color: "#64748b" }}>
                    Carga: {docSel.carga_nueva}h / {docSel.Docente_Carga_Horaria_Maxima}h sem.
                  </span>
                )}
              </div>
            )}

            {/* Estado */}
            <label style={s.label}>Estado *</label>
            <select
              name="Horario_Asignatura_Estado"
              value={form.Horario_Asignatura_Estado}
              onChange={onChange}
              style={s.input}
              required
            >
              <option value="Activo">Activo</option>
              <option value="Suspendido">Suspendido</option>
            </select>

            {errorPanel && (
              <p
                style={{
                  color: "#dc2626",
                  fontSize: "0.875rem",
                  marginTop: "0.5rem",
                  background: "#fee2e2",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "6px",
                }}
              >
                {errorPanel}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={onClose}
                style={{ ...s.btnCancelar, flex: 1 }}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ flex: 2 }}
                disabled={guardando}
              >
                {guardando
                  ? "Guardando..."
                  : modoEdicion
                  ? "Guardar cambios"
                  : "Agregar bloque"}
              </button>
            </div>
            {modoEdicion && onEliminar && (
              <button
                type="button"
                onClick={onEliminar}
                disabled={guardando}
                style={s.btnEliminarClase}
              >
                🗑 Eliminar clase
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Edición masiva de bloques (CU63 / CU64)                       */
/*  Flujo de los diagramas de secuencia: el actor completa el      */
/*  formulario → el sistema valida (validar…) → muestra el resumen */
/*  y solicita confirmación → el actor confirma → se aplica el     */
/*  UPDATE. Si la validación falla se devuelve al formulario.      */
/* ═══════════════════════════════════════════════════════════════ */
function hhmm(t) {
  return t ? String(t).slice(0, 5) : "";
}

function useFlujoMasivo({ urlValidar, urlAplicar, onExito }) {
  const [paso, setPaso] = useState("formulario"); // formulario | resumen
  const [resumen, setResumen] = useState([]);
  const [error, setError] = useState("");
  const [conflictos, setConflictos] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (url, method, body) => {
    setEnviando(true);
    setError("");
    setConflictos([]);
    try {
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No fue posible completar la operación");
        setConflictos(Array.isArray(data.conflictos) ? data.conflictos : []);
        setPaso("formulario");
        return null;
      }
      return data;
    } catch {
      setError("No fue posible completar la operación");
      setPaso("formulario");
      return null;
    } finally {
      setEnviando(false);
    }
  };

  const validar = async (body) => {
    const data = await enviar(urlValidar, "POST", body);
    if (data) {
      setResumen(data.resumen || []);
      setPaso("resumen");
    }
  };

  const confirmar = async (body) => {
    const data = await enviar(urlAplicar, "PUT", body);
    if (data) onExito(data.mensaje);
  };

  const mostrarError = (mensaje) => {
    setError(mensaje);
    setConflictos([]);
  };

  return {
    paso, resumen, error, conflictos, enviando,
    validar, confirmar, mostrarError,
    volver: () => setPaso("formulario"),
  };
}

function ModalMasivo({ titulo, subtitulo, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p className="modal-subtitulo" style={{ margin: "4px 0 0" }}>{subtitulo}</p>}
          </div>
          <button className="btn-cerrar" onClick={onClose} title="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorMasivo({ error, conflictos }) {
  if (!error) return null;
  return (
    <div style={{ ...s.errorBanner, marginTop: "0.75rem" }}>
      <strong>{error}</strong>
      {conflictos.length > 0 && (
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
          {conflictos.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
    </div>
  );
}

function ListaSeleccion({ seleccion }) {
  return (
    <table style={s.tablaResumen}>
      <thead>
        <tr>
          <th style={s.thResumen}>Día</th>
          <th style={s.thResumen}>Horario</th>
          <th style={s.thResumen}>Asignatura</th>
          <th style={s.thResumen}>Docente actual</th>
        </tr>
      </thead>
      <tbody>
        {seleccion.map((h) => (
          <tr key={h.Horario_Asignatura_Id}>
            <td style={s.tdResumen}>{h.dia}</td>
            <td style={s.tdResumen}>{hhmm(h.hora_inicio)} – {hhmm(h.hora_fin)}</td>
            <td style={s.tdResumen}>{h.asignatura}</td>
            <td style={s.tdResumen}>{h.docente || "Sin asignar"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ValorCambio({ antes, despues }) {
  if (antes === despues) return <span>{despues}</span>;
  return (
    <span>
      <span style={{ color: "#94a3b8", textDecoration: "line-through" }}>{antes}</span>
      {" → "}
      <strong style={{ color: "#5b21b6" }}>{despues}</strong>
    </span>
  );
}

function ResumenCambios({ resumen }) {
  return (
    <table style={s.tablaResumen}>
      <thead>
        <tr>
          <th style={s.thResumen}>Curso</th>
          <th style={s.thResumen}>Día</th>
          <th style={s.thResumen}>Horario</th>
          <th style={s.thResumen}>Asignatura</th>
          <th style={s.thResumen}>Docente</th>
        </tr>
      </thead>
      <tbody>
        {resumen.map((r) => (
          <tr key={r.Horario_Asignatura_Id}>
            <td style={s.tdResumen}>{r.curso}</td>
            <td style={s.tdResumen}><ValorCambio antes={r.antes.dia} despues={r.despues.dia} /></td>
            <td style={s.tdResumen}>
              <ValorCambio
                antes={`${hhmm(r.antes.hora_inicio)} – ${hhmm(r.antes.hora_fin)}`}
                despues={`${hhmm(r.despues.hora_inicio)} – ${hhmm(r.despues.hora_fin)}`}
              />
            </td>
            <td style={s.tdResumen}><ValorCambio antes={r.antes.asignatura} despues={r.despues.asignatura} /></td>
            <td style={s.tdResumen}>
              <ValorCambio antes={r.antes.docente || "Sin asignar"} despues={r.despues.docente || "Sin asignar"} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccionesMasivas({ flujo, textoValidar, onValidar, onConfirmar, onClose }) {
  return (
    <div className="modal-actions" style={{ marginTop: "1.25rem" }}>
      {flujo.paso === "formulario" ? (
        <>
          <button type="button" style={s.btnCancelar} onClick={onClose} disabled={flujo.enviando}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={onValidar} disabled={flujo.enviando}>
            {flujo.enviando ? "Validando..." : textoValidar}
          </button>
        </>
      ) : (
        <>
          <button type="button" style={s.btnCancelar} onClick={flujo.volver} disabled={flujo.enviando}>
            Volver
          </button>
          <button type="button" className="btn-primary" onClick={onConfirmar} disabled={flujo.enviando}>
            {flujo.enviando ? "Guardando..." : "Confirmar cambios"}
          </button>
        </>
      )}
    </div>
  );
}

/* CU63 — Reasignando docente en múltiples bloques */
function ReasignarDocenteModal({ seleccion, onClose, onExito }) {
  const [docentes, setDocentes] = useState([]);
  const [docenteId, setDocenteId] = useState("");
  const flujo = useFlujoMasivo({
    urlValidar: `${API}/horarios/reasignar-docente/validar`,
    urlAplicar: `${API}/horarios/reasignar-docente`,
    onExito,
  });

  // getDocentes(): docentes con cuenta activa
  useEffect(() => {
    fetch(`${API}/horarios/docentes`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setDocentes(Array.isArray(data) ? data : []))
      .catch(() => setDocentes([]));
  }, []);

  const body = () => ({
    horario_ids: seleccion.map((h) => h.Horario_Asignatura_Id),
    Usuario_Id: docenteId ? Number(docenteId) : null,
  });

  return (
    <ModalMasivo
      titulo="Reasignar docente"
      subtitulo={`${seleccion.length} bloque(s) seleccionado(s)`}
      onClose={onClose}
    >
      {flujo.paso === "formulario" ? (
        <>
          <ListaSeleccion seleccion={seleccion} />
          <label style={s.label}>Nuevo docente *</label>
          <select value={docenteId} onChange={(e) => setDocenteId(e.target.value)} style={s.input}>
            <option value="">— Selecciona un docente —</option>
            {docentes.map((d) => (
              <option key={d.Usuario_Id} value={d.Usuario_Id}>
                {d.Usuario_Nombre_Completo}
                {d.Docente_Especialidad ? ` — ${d.Docente_Especialidad}` : ""}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <p className="modal-subtitulo">Revisa los cambios antes de confirmar la reasignación.</p>
          <ResumenCambios resumen={flujo.resumen} />
        </>
      )}

      <ErrorMasivo error={flujo.error} conflictos={flujo.conflictos} />

      <AccionesMasivas
        flujo={flujo}
        textoValidar="Validar reasignación"
        onValidar={() => flujo.validar(body())}
        onConfirmar={() => flujo.confirmar(body())}
        onClose={onClose}
      />
    </ModalMasivo>
  );
}

/* CU65 — Suspendiendo bloques horarios por evento institucional */
function SuspenderBloquesModal({ seleccion, onClose, onExito }) {
  const [eventos, setEventos] = useState([]);
  const [modo, setModo] = useState("existente"); // "existente" | "nuevo"
  const [eventoId, setEventoId] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", fecha: "", descripcion: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState("");

  // La suspensión se registra por bloque horario (tabla afecta)
  const bloquesId = [...new Set(seleccion.map((h) => h.Bloque_Horario_Id))];

  useEffect(() => {
    fetch(`${API}/bloques/eventos`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setEventos(Array.isArray(data) ? data : []))
      .catch(() => setEventos([]));
  }, []);

  const confirmar = async () => {
    setError("");
    setDetalle("");
    const body = { bloques_id: bloquesId };
    if (modo === "existente") body.evento_id = eventoId ? Number(eventoId) : null;
    else body.evento = nuevo;

    setEnviando(true);
    try {
      const res = await fetch(`${API}/horarios/suspender-bloques`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No fue posible suspender los bloques");
        setDetalle(data.detalle || "");
        return;
      }
      onExito(data.mensaje || "Bloques suspendidos por evento institucional");
    } catch {
      setError("No fue posible conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalMasivo
      titulo="Suspender por evento institucional"
      subtitulo={`${seleccion.length} bloque(s) seleccionado(s)`}
      onClose={onClose}
    >
      <ListaSeleccion seleccion={seleccion} />
      <p className="modal-subtitulo" style={{ marginTop: "0.75rem" }}>
        Los bloques horarios seleccionados quedarán suspendidos en la fecha del evento para toda la institución.
      </p>

      <div style={{ display: "flex", gap: "1rem", margin: "0.75rem 0" }}>
        <label><input type="radio" checked={modo === "existente"} onChange={() => setModo("existente")} /> Evento registrado</label>
        <label><input type="radio" checked={modo === "nuevo"} onChange={() => setModo("nuevo")} /> Registrar evento nuevo</label>
      </div>

      {modo === "existente" ? (
        <>
          <label style={s.label}>Evento institucional *</label>
          <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} style={s.input}>
            <option value="">— Selecciona un evento —</option>
            {eventos.map((ev) => (
              <option key={ev.Evento_Institucional_Id} value={ev.Evento_Institucional_Id}>
                {String(ev.Evento_Institucional_Fecha).slice(0, 10)} — {ev.Evento_Institucional_Nombre}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label style={s.label}>Nombre del evento *</label>
          <input style={s.input} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <label style={s.label}>Fecha *</label>
          <input type="date" style={s.input} value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
          <label style={s.label}>Descripción *</label>
          <textarea style={{ ...s.input, minHeight: 70 }} value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
        </>
      )}

      <ErrorMasivo error={error} conflictos={detalle ? [detalle] : []} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
        <button type="button" style={s.btnCancelar} onClick={onClose} disabled={enviando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={confirmar} disabled={enviando}>
          {enviando ? "Suspendiendo..." : "Confirmar suspensión"}
        </button>
      </div>
    </ModalMasivo>
  );
}

/* CU64 — Modificando múltiples bloques horarios */
const CAMPOS_EDICION = [
  { campo: "Horario_Asignatura_Dia_Semana", etiqueta: "Día" },
  { campo: "Bloque_Horario_Id", etiqueta: "Hora (bloque horario)" },
  { campo: "Asignatura_Id", etiqueta: "Asignatura" },
  { campo: "Usuario_Id", etiqueta: "Docente" },
];

function EditarMultiplesModal({ seleccion, onClose, onExito }) {
  const [opciones, setOpciones] = useState({ bloques: [], asignaturas: [], docentes: [] });
  const [activos, setActivos] = useState({});
  const [valores, setValores] = useState({});
  const flujo = useFlujoMasivo({
    urlValidar: `${API}/horarios/multiples/validar`,
    urlAplicar: `${API}/horarios/multiples`,
    onExito,
  });

  // getOpcionesEdicion(): bloques, asignaturas y docentes activos
  useEffect(() => {
    fetch(`${API}/horarios/opciones-edicion`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) =>
        setOpciones({
          bloques: Array.isArray(data.bloques) ? data.bloques : [],
          asignaturas: Array.isArray(data.asignaturas) ? data.asignaturas : [],
          docentes: Array.isArray(data.docentes) ? data.docentes : [],
        })
      )
      .catch(() => {});
  }, []);

  const opcionesDe = (campo) => {
    if (campo === "Horario_Asignatura_Dia_Semana") return DIAS.map((d) => ({ value: d, label: d }));
    if (campo === "Bloque_Horario_Id")
      return opciones.bloques
        .filter((b) => b.Bloque_Horario_Tipo !== "Recreo")
        .map((b) => ({
          value: b.Bloque_Horario_Id,
          label: `${hhmm(b.Bloque_Horario_Hora_Inicio)} – ${hhmm(b.Bloque_Horario_Hora_Fin)} · ${b.Bloque_Horario_Jornada}`,
        }));
    if (campo === "Asignatura_Id")
      return opciones.asignaturas.map((a) => ({ value: a.Asignatura_Id, label: a.Asignatura_Nombre }));
    return opciones.docentes.map((d) => ({
      value: d.Usuario_Id,
      label: `${d.Usuario_Nombre_Completo}${d.Docente_Especialidad ? ` — ${d.Docente_Especialidad}` : ""}`,
    }));
  };

  const cambios = () => {
    const out = {};
    for (const { campo } of CAMPOS_EDICION) {
      if (activos[campo]) out[campo] = valores[campo] ?? "";
    }
    return out;
  };

  const body = () => ({
    horario_ids: seleccion.map((h) => h.Horario_Asignatura_Id),
    cambios: cambios(),
  });

  const handleValidar = () => {
    const c = cambios();
    // Excepción 1: un campo marcado para modificar quedó sin valor
    if (Object.values(c).some((v) => v === "")) {
      flujo.mostrarError("Seleccione bloques y campos válidos a modificar");
      return;
    }
    flujo.validar(body());
  };

  return (
    <ModalMasivo
      titulo="Editar bloques seleccionados"
      subtitulo={`${seleccion.length} bloque(s) seleccionado(s)`}
      onClose={onClose}
    >
      {flujo.paso === "formulario" ? (
        <>
          <ListaSeleccion seleccion={seleccion} />
          <p className="modal-subtitulo" style={{ margin: "1rem 0 0.25rem" }}>
            Marca los campos a modificar e ingresa el nuevo valor. Se aplicará a todos los bloques seleccionados.
          </p>
          {CAMPOS_EDICION.map(({ campo, etiqueta }) => (
            <div key={campo} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.5rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", width: 190, fontSize: "0.875rem", fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!activos[campo]}
                  onChange={(e) => setActivos((p) => ({ ...p, [campo]: e.target.checked }))}
                />
                {etiqueta}
              </label>
              <select
                value={valores[campo] ?? ""}
                onChange={(e) => setValores((p) => ({ ...p, [campo]: e.target.value }))}
                disabled={!activos[campo]}
                style={{ ...s.input, flex: 1 }}
              >
                <option value="">— Selecciona —</option>
                {opcionesDe(campo).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </>
      ) : (
        <>
          <p className="modal-subtitulo">Revisa los cambios antes de confirmar la modificación.</p>
          <ResumenCambios resumen={flujo.resumen} />
        </>
      )}

      <ErrorMasivo error={flujo.error} conflictos={flujo.conflictos} />

      <AccionesMasivas
        flujo={flujo}
        textoValidar="Validar cambios"
        onValidar={handleValidar}
        onConfirmar={() => flujo.confirmar(body())}
        onClose={onClose}
      />
    </ModalMasivo>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Helpers                                                       */
/* ═══════════════════════════════════════════════════════════════ */
function AccesoDenegado() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem 2rem", textAlign: "center" }}>
      <span style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🔒</span>
      <h2 style={{ margin: "0 0 0.5rem", color: "#1e3a5f" }}>Sección no disponible</h2>
      <p style={{ margin: 0, color: "#6b7280", maxWidth: 380 }}>
        El rol <strong>Apoderado</strong> no tiene acceso al módulo de Horarios.
      </p>
    </div>
  );
}

function RolBadge({ rol }) {
  const map = {
    "Super Administrador": { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
    Administrador: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
    Docente: { bg: "#fef9c3", text: "#92400e", border: "#fde68a" },
  };
  const c = map[rol] || map["Docente"];
  return (
    <span
      style={{
        padding: "4px 14px",
        borderRadius: "20px",
        fontSize: "0.82rem",
        fontWeight: 700,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {rol}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Styles                                                        */
/* ═══════════════════════════════════════════════════════════════ */
const s = {
  page: { padding: "1.75rem" },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "1.5rem",
    gap: "1rem",
    flexWrap: "wrap",
  },
  titulo: { margin: 0, color: "#1e3a5f", fontSize: "1.5rem" },
  subtitulo: { margin: "0.3rem 0 0", color: "#6b7280", fontSize: "0.9rem" },

  selectorRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1.25rem",
    background: "#f0f4ff",
    border: "1px solid #dbeafe",
    padding: "0.7rem 1rem",
    borderRadius: "10px",
    flexWrap: "wrap",
  },
  selectorLabel: { fontWeight: 700, color: "#1e3a5f", fontSize: "0.95rem", whiteSpace: "nowrap" },
  select: {
    padding: "0.4rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid #93c5fd",
    fontSize: "0.9rem",
    minWidth: 240,
  },

  errorBanner: {
    color: "#dc2626",
    background: "#fee2e2",
    border: "1px solid #fecaca",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1rem",
    fontSize: "0.9rem",
  },

  emptyState: {
    textAlign: "center",
    padding: "3rem 1rem",
    color: "#6b7280",
    background: "#f9fafb",
    borderRadius: "10px",
    border: "1px dashed #d1d5db",
  },
  emptyIcon: { fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" },
  loadingText: { color: "#6b7280", fontStyle: "italic" },

  mainLayout: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "1.25rem",
    alignItems: "start",
  },

  asigPanel: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: 300,
  },
  asigPanelHead: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "0.75rem 0.85rem 0.6rem",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
  },
  asigList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "0.6rem 0.5rem",
    flex: 1,
    overflowY: "auto",
  },
  asigCard: {
    padding: "0.55rem 0.65rem",
    borderRadius: "7px",
    border: "1.5px solid",
    cursor: "pointer",
    transition: "all 0.15s",
  },

  gridArea: { minWidth: 0 },

  asigActivaBanner: {
    padding: "0.5rem 0.75rem",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "8px",
    marginBottom: "0.75rem",
    fontSize: "0.84rem",
    color: "#9a3412",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },

  exitoBanner: {
    color: "#166534",
    background: "#dcfce7",
    border: "1px solid #bbf7d0",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1rem",
    fontSize: "0.9rem",
  },

  barraSeleccion: {
    padding: "0.55rem 0.75rem",
    background: "#f5f3ff",
    border: "1px solid #c4b5fd",
    borderRadius: "8px",
    marginBottom: "0.75rem",
    fontSize: "0.84rem",
    color: "#5b21b6",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  btnAccionSeleccion: {
    padding: "0.35rem 0.8rem",
    borderRadius: "6px",
    border: "1px solid #7c3aed",
    background: "#7c3aed",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.8rem",
  },

  tablaResumen: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.8rem",
  },
  thResumen: {
    textAlign: "left",
    padding: "0.4rem 0.5rem",
    background: "#f1f5f9",
    color: "#475569",
    fontWeight: 700,
    borderBottom: "1px solid #e2e8f0",
  },
  tdResumen: {
    padding: "0.4rem 0.5rem",
    borderBottom: "1px solid #f1f5f9",
    color: "#1e293b",
    verticalAlign: "top",
  },

  btnSuspenderTodo: {
    width: "100%",
    background: "#fef3c7",
    border: "1px solid #fcd34d",
    color: "#92400e",
    padding: "0.4rem 0.75rem",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.78rem",
    textAlign: "center",
  },
  listadoClases: {
    marginTop: "1rem",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#fff",
    padding: "0.85rem 1rem",
  },
  listadoTh: { padding: "0.45rem 0.6rem", fontWeight: 600, fontSize: "0.75rem" },
  listadoTd: { padding: "0.45rem 0.6rem", verticalAlign: "middle" },
  btnListado: {
    marginLeft: 6,
    padding: "0.2rem 0.55rem",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#374151",
  },
  btnEliminarClase: {
    width: "100%",
    marginTop: "0.75rem",
    padding: "0.5rem",
    borderRadius: 6,
    border: "1px solid #fecaca",
    background: "#fff5f5",
    color: "#991b1b",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  cellBtn: {
    width: 18,
    height: 18,
    padding: 0,
    border: "none",
    borderRadius: 3,
    cursor: "pointer",
    background: "#1e40af",
    color: "#fff",
    fontSize: "0.55rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Panel */
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    width: "100%", maxWidth: 420,
    height: "100vh",
    background: "#fff",
    boxShadow: "-6px 0 32px rgba(0,0,0,0.18), 0 0 0 100vmax rgba(0,0,0,0.45)",
    zIndex: 990,
    display: "flex",
    flexDirection: "column",
    animation: "slideInRight 0.22s ease",
  },
  panelHeader: {
    background: "#0f172a",
    padding: "1rem 1.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  panelBtnClose: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff",
    borderRadius: "6px",
    width: 32,
    height: 32,
    cursor: "pointer",
    fontSize: "0.9rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panelBody: {
    flex: 1,
    overflowY: "auto",
    padding: "1.25rem",
  },

  stepHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.65rem",
    marginBottom: "0.9rem",
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#4f46e5",
    color: "#fff",
    fontSize: "0.68rem",
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  stepTitle: {
    fontWeight: 700,
    fontSize: "0.88rem",
    color: "#1e293b",
    lineHeight: 1.3,
  },
  stepSub: {
    fontSize: "0.72rem",
    color: "#94a3b8",
    marginTop: 2,
  },
  stepDivider: {
    borderTop: "1px dashed #e2e8f0",
    margin: "1.2rem 0 1rem",
  },

  bloqueChip: {
    background: "#f0f9ff",
    border: "1px solid #bae6fd",
    borderRadius: "10px",
    padding: "0.75rem 1rem",
    marginBottom: "1rem",
    display: "flex",
    gap: "0.75rem",
    alignItems: "center",
  },

  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: "0.25rem",
    marginTop: "0.85rem",
    fontSize: "0.875rem",
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "0.45rem 0.6rem",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    boxSizing: "border-box",
    fontSize: "0.9rem",
  },
  btnCancelar: {
    padding: "0.4rem 0.9rem",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
};