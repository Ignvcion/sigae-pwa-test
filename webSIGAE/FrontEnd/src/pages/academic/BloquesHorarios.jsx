import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PanelConflictos from "../../components/horarios/PanelConflictos";

const API = "/api/bloques";

const JORNADAS     = ["Mañana", "Tarde"];
const TIPOS_BLOQUE = ["Clase", "Recreo"];
const IMPACTOS     = ["Sin impacto", "Salida anticipada", "Suspensión jornada mañana", "Suspensión total"];
// "Suspensión parcial" solo se origina desde CU65 (bloques elegidos en la grilla de Horarios)
const JORNADAS_SUSPENSION = [
  { valor: "Mañana",   etiqueta: "Jornada de la mañana" },
  { valor: "Tarde",    etiqueta: "Jornada de la tarde" },
  { valor: "Completa", etiqueta: "Día completo" },
];

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  };
}

function hhmm(t) { return t ? String(t).slice(0, 5) : ""; }

// Fecha 'YYYY-MM-DD' de un evento en formato legible. Se arma con la hora local
// al mediodía para que la zona horaria no la corra un día.
function formatearFechaEvento(fecha, opciones = { day: "2-digit", month: "short", year: "numeric" }) {
  const iso = String(fecha || "").slice(0, 10);
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-CL", opciones);
}

function calcDuracion(inicio, fin) {
  if (!inicio || !fin) return 0;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

function sumarMinutos(horaHHMM, minutos) {
  if (!horaHHMM || !minutos) return "";
  const [h, m] = horaHHMM.split(":").map(Number);
  const total = h * 60 + (m || 0) + minutos;
  if (total >= 24 * 60) return "";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function jornadaDeHora(horaHHMM) {
  if (!horaHHMM) return "Mañana";
  return horaHHMM >= "12:00" ? "Tarde" : "Mañana";
}

/* ── Chip de tipo ──────────────────────────────────────────────── */
function TipoChip({ tipo }) {
  const map = {
    "Clase":  { bg: "#dbeafe", color: "#1e40af" },
    "Recreo": { bg: "#dcfce7", color: "#166534" },
  };
  const c = map[tipo] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "0.78rem",
      fontWeight: 700, background: c.bg, color: c.color }}>
      {tipo}
    </span>
  );
}

/* ── Chip de impacto ───────────────────────────────────────────── */
function ImpactoChip({ impacto }) {
  const map = {
    "Sin impacto":       { bg: "#f0fdf4", color: "#166534" },
    "Salida anticipada": { bg: "#fef9c3", color: "#92400e" },
    "Suspensión total":  { bg: "#fee2e2", color: "#991b1b" },
    "Suspensión jornada mañana": { bg: "#ffedd5", color: "#9a3412" },
    "Suspensión parcial": { bg: "#ede9fe", color: "#5b21b6" },
  };
  const c = map[impacto] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "0.78rem",
      fontWeight: 700, background: c.bg, color: c.color }}>
      {impacto}
    </span>
  );
}

/* ── Badge de bloques afectados (CU70/71) ─────────────────────── */
function BloquesAfectadosBadge({ count }) {
  if (!count) return null;
  return (
    <span
      title={`${count} bloque(s) horario(s) quedan marcados como suspendidos por este evento`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "2px 8px", borderRadius: "10px", fontSize: "0.7rem",
        fontWeight: 700, background: "#fee2e2", color: "#991b1b",
        border: "1px solid #fecaca", marginLeft: 6, whiteSpace: "nowrap",
      }}
    >
      🚫 {count} bloque{count !== 1 ? "s" : ""} afectado{count !== 1 ? "s" : ""}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════════ */
export default function BloquesHorarios() {
  const { rolActivo, usuario } = useAuth();
  const rolEfectivo = rolActivo || usuario?.roles?.[0];
  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const esAdmin = rolEfectivo === "Administrador" || esSuperAdmin || usuario?.roles?.includes("Administrador");

  // ?tab=bloques | eventos abre directamente esa pestaña (accesos del dashboard)
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const pedido = searchParams.get("tab");
    return ["parametros", "bloques", "eventos"].includes(pedido) ? pedido : "parametros";
  });

  // Panel de clases por reubicar (compartido por las pestañas)
  const [senalConflictos, setSenalConflictos] = useState(0);
  const [bloqueAEliminar, setBloqueAEliminar] = useState(null);
  const [versionBloques, setVersionBloques] = useState(0);
  const abrirConflictos = () => setSenalConflictos((n) => n + 1);
  const recargarBloques = () => setVersionBloques((n) => n + 1);

  // Si falla (ej. el bloque está asociado a un evento), el panel muestra el error
  const eliminarBloquePendiente = async (id) => {
    const res  = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No fue posible eliminar el bloque");
    setBloqueAEliminar(null);
    recargarBloques();
  };

  if (!esAdmin) {
    return (
      <div style={s.page}>
        <div style={s.accessDenied}>
          <span style={{ fontSize: "3rem" }}>🔒</span>
          <h2 style={{ color: "#1e3a5f" }}>Acceso restringido</h2>
          <p style={{ color: "#6b7280" }}>
            Solo los administradores pueden gestionar bloques y parámetros horarios.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Encabezado */}
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Configuración Horaria Institucional</h1>
          <p style={s.subtitulo}>
            Parámetros institucionales, bloques horarios y eventos {/* CU52 · CU49 */}
          </p>
        </div>
        <span style={s.rolBadge}>
          {esSuperAdmin ? "Super Administrador" : "Administrador"}
        </span>
      </div>

      {/* Pestañas */}
      <div style={s.tabBar}>
        {[
          { key: "parametros", label: "⚙ Parámetros institucionales" },
          { key: "bloques",    label: "🕐 Bloques horarios" },
          { key: "eventos",    label: "📅 Eventos institucionales" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...s.tabBtn, ...(tab === t.key ? s.tabBtnActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={s.tabContent}>
        {tab === "parametros" && <TabParametros onJornadaCambiada={() => { abrirConflictos(); recargarBloques(); }} />}
        {tab === "bloques"    && (
          <TabBloques
            version={versionBloques}
            onConflictos={abrirConflictos}
            onQuitarBloqueConClases={setBloqueAEliminar}
          />
        )}
        {tab === "eventos"    && <TabEventos />}
      </div>

      <PanelConflictos
        abrirSenal={senalConflictos}
        bloqueAEliminar={bloqueAEliminar}
        onEliminarBloque={eliminarBloquePendiente}
        onCancelarEliminarBloque={() => setBloqueAEliminar(null)}
        onCambio={recargarBloques}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PESTAÑA 1 — Parámetros institucionales (CU52)
══════════════════════════════════════════════════════════════════ */
function TabParametros({ onJornadaCambiada }) {
  const [form, setForm]           = useState(null);
  const [impacto, setImpacto]     = useState(null); // clases que quedarían fuera de la nueva jornada
  const [original, setOriginal]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState("");
  const [exito, setExito]         = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`${API}/parametros`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const f = {
          Parametro_Institucional_Inicio_Jornada:          hhmm(data.Parametro_Institucional_Inicio_Jornada),
          Parametro_Institucional_Fin_Jornada:             hhmm(data.Parametro_Institucional_Fin_Jornada),
          Parametro_Institucional_Duracion_Bloque:         String(data.Parametro_Institucional_Duracion_Bloque),
          Parametro_Institucional_Duracion_Recreo:         String(data.Parametro_Institucional_Duracion_Recreo),
          Parametro_Institucional_Bloques_Maximos_Diarios: String(data.Parametro_Institucional_Bloques_Maximos_Diarios),
        };
        setForm(f);
        setOriginal(f);
      } catch (e) {
        setError(e.message || "Error al cargar parámetros");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleChange = (e) => {
    setImpacto(null);
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const hayCambios = form && original && JSON.stringify(form) !== JSON.stringify(original);

  const cambiaJornada = form && original && (
    form.Parametro_Institucional_Inicio_Jornada !== original.Parametro_Institucional_Inicio_Jornada ||
    form.Parametro_Institucional_Fin_Jornada    !== original.Parametro_Institucional_Fin_Jornada
  );

  const handleGuardar = async (e, confirmado = false) => {
    e?.preventDefault();
    setGuardando(true);
    setError("");
    setExito("");
    try {
      // Si la nueva jornada deja bloques fuera, se avisa antes de guardar
      if (cambiaJornada && !confirmado) {
        const resImp  = await fetch(`${API}/parametros/impacto`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(form),
        });
        const dataImp = await resImp.json();
        if (!resImp.ok) throw new Error(dataImp.error);
        if (dataImp.bloques.length > 0) {
          setImpacto(dataImp);
          return;
        }
      }

      const res  = await fetch(`${API}/parametros`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOriginal(form);
      setImpacto(null);
      setExito(
        impacto?.clases > 0
          ? `Parámetros guardados. ${impacto.clases} clase(s) quedaron pendientes de reubicar en el panel de avisos.`
          : "Parámetros guardados correctamente."
      );
      setTimeout(() => setExito(""), 5000);
      if (cambiaJornada) onJornadaCambiada?.();
    } catch (e) {
      setError(e.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <p style={s.loadingText}>Cargando parámetros...</p>;

  if (!form) {
    return (
      <div style={s.seccion}>
        <div style={s.errorBanner}>{error || "No fue posible cargar los parámetros institucionales"}</div>
      </div>
    );
  }

  return (
    <div style={s.seccion}>
      <div style={s.seccionHeader}>
        <h2 style={s.seccionTitulo}>Parámetros del horario institucional</h2>
        <p style={s.seccionDesc}>
          Define los límites de jornada, duración de bloques y recreos. Estos valores
          se usan para validar cada bloque horario que se registre.
        </p>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}
      {exito && <div style={s.exitoBanner}>✅ {exito}</div>}

      <form onSubmit={handleGuardar}>
        <fieldset style={s.fieldset}>
          <legend style={s.legend}>🕐 Jornada escolar</legend>
          <div style={s.formRow}>
            <div style={s.formField}>
              <label style={s.label}>Inicio de jornada *</label>
              <input type="time" name="Parametro_Institucional_Inicio_Jornada"
                value={form.Parametro_Institucional_Inicio_Jornada}
                onChange={handleChange} style={s.input} required />
            </div>
            <div style={s.formField}>
              <label style={s.label}>Fin de jornada *</label>
              <input type="time" name="Parametro_Institucional_Fin_Jornada"
                value={form.Parametro_Institucional_Fin_Jornada}
                onChange={handleChange} style={s.input} required />
            </div>
          </div>
        </fieldset>

        <fieldset style={s.fieldset}>
          <legend style={s.legend}>📐 Configuración de bloques</legend>
          <div style={s.formRow}>
            <div style={s.formField}>
              <label style={s.label}>Duración estándar de bloques (min) *</label>
              <input type="number" name="Parametro_Institucional_Duracion_Bloque"
                value={form.Parametro_Institucional_Duracion_Bloque}
                onChange={handleChange} style={s.input} min="1" max="180" required />
            </div>
            <div style={s.formField}>
              <label style={s.label}>Duración de recreos (min) *</label>
              <input type="number" name="Parametro_Institucional_Duracion_Recreo"
                value={form.Parametro_Institucional_Duracion_Recreo}
                onChange={handleChange} style={s.input} min="0" max="120" required />
            </div>
            <div style={s.formField}>
              <label style={s.label}>Máximo de bloques diarios *</label>
              <input type="number" name="Parametro_Institucional_Bloques_Maximos_Diarios"
                value={form.Parametro_Institucional_Bloques_Maximos_Diarios}
                onChange={handleChange} style={s.input} min="1" max="20" required />
            </div>
          </div>
        </fieldset>

        {form && (
          <div style={s.resumenBox}>
            <strong style={{ color: "#1e3a5f", fontSize: "0.85rem" }}>Resumen configurado:</strong>
            <ul style={s.resumenList}>
              <li>Jornada: <b>{form.Parametro_Institucional_Inicio_Jornada || "—"}</b> → <b>{form.Parametro_Institucional_Fin_Jornada || "—"}</b></li>
              <li>Duración bloque: <b>{form.Parametro_Institucional_Duracion_Bloque || "—"} min</b></li>
              <li>Duración recreo: <b>{form.Parametro_Institucional_Duracion_Recreo || "—"} min</b></li>
              <li>Máx. bloques/día: <b>{form.Parametro_Institucional_Bloques_Maximos_Diarios || "—"}</b></li>
            </ul>
          </div>
        )}

        {impacto && (
          <div style={{ background: "#fefce8", border: "1px solid #fde047", borderLeft: "5px solid #eab308",
            borderRadius: 8, padding: "0.8rem 1rem", marginTop: "1rem", color: "#713f12" }}>
            <strong>⚠ La nueva jornada deja {impacto.bloques.length} bloque(s) fuera de horario</strong>
            <ul style={{ margin: "0.4rem 0 0.4rem 1rem", padding: 0, fontSize: "0.85rem" }}>
              {impacto.bloques.map((b) => (
                <li key={b.Bloque_Horario_Id}>
                  {hhmm(b.Bloque_Horario_Hora_Inicio)}–{hhmm(b.Bloque_Horario_Hora_Fin)} · {b.Bloque_Horario_Jornada} · {b.Bloque_Horario_Tipo}
                  {" — "}{b.Clases > 0 ? `${b.Clases} clase(s)` : "sin clases"}
                </li>
              ))}
            </ul>
            <p style={{ margin: "0 0 0.6rem", fontSize: "0.85rem" }}>
              {impacto.clases > 0
                ? `Las ${impacto.clases} clase(s) quedarán pendientes en el panel de avisos para migrarlas a otro bloque, eliminarlas o decidir más tarde.`
                : "Esos bloques no tienen clases; quedarán marcados como fuera de la jornada."}
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn-primary" disabled={guardando} onClick={() => handleGuardar(null, true)}>
                {guardando ? "Guardando..." : "Guardar de todos modos"}
              </button>
              <button type="button" onClick={() => setImpacto(null)} style={s.btnSecundario}>
                Revisar cambios
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button type="submit" className="btn-primary" disabled={guardando || !hayCambios || !!impacto}
            style={{ opacity: !hayCambios ? 0.5 : 1 }}>
            {guardando ? "Guardando..." : "Guardar parámetros"}
          </button>
          {hayCambios && (
            <button type="button" onClick={() => { setForm(original); setImpacto(null); }} style={s.btnSecundario}>
              Descartar cambios
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PESTAÑA 2 — Bloques horarios (CU49)
   Solo tipos: Clase y Recreo
══════════════════════════════════════════════════════════════════ */
const EMPTY_BLOQUE = {
  Bloque_Horario_Hora_Inicio: "",
  Bloque_Horario_Hora_Fin:    "",
  Bloque_Horario_Jornada:     "Mañana",
  Bloque_Horario_Tipo:        "Clase",
};

function TabBloques({ version = 0, onConflictos, onQuitarBloqueConClases }) {
  const [bloques,      setBloques]      = useState([]);
  // Bloques vigentes con los que se superpone el nuevo bloque (redefinir la jornada)
  const [superposicion, setSuperposicion] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [exito,        setExito]        = useState("");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [editando,     setEditando]     = useState(null);
  const [form,         setForm]         = useState(EMPTY_BLOQUE);
  const [guardando,    setGuardando]    = useState(false);
  const [errorPanel,   setErrorPanel]   = useState("");
  const [eliminando,   setEliminando]   = useState(null);
  const [vista,        setVista]        = useState("calendario");
  const [parametros,   setParametros]   = useState(null);

  /* CU51: eliminación múltiple de bloques (solo disponible en vista Lista) */
  const [modoSeleccion,   setModoSeleccion]   = useState(false);
  const [seleccionados,   setSeleccionados]   = useState([]);
  const [eliminandoVarios,setEliminandoVarios]= useState(false);

  /* Colapsar sidebar mientras el panel esté abierto */
  useEffect(() => {
    if (panelAbierto) document.body.classList.add("bloques-panel-open");
    else              document.body.classList.remove("bloques-panel-open");
    return () => document.body.classList.remove("bloques-panel-open");
  }, [panelAbierto]);

  // Pide bloques y parámetros; el estado cambia solo al llegar la respuesta (callbacks),
  // así el efecto no provoca renders en cascada. cargar() además muestra el "cargando".
  const pedir = useCallback(() =>
    Promise.all([
      fetch(API, { headers: authHeaders() }),
      fetch(`${API}/parametros`, { headers: authHeaders() }),
    ])
      .then(async ([rB, rP]) => {
        const dataBloques = await rB.json();
        const dataParams  = await rP.json();
        if (!rB.ok) throw new Error(dataBloques.error);
        setBloques(dataBloques);
        setParametros(dataParams);
        setError("");
      })
      .catch((e) => setError(e.message || "Error al cargar bloques"))
      .finally(() => setLoading(false)), []);

  const cargar = () => {
    setLoading(true);
    setError("");
    return pedir();
  };

  useEffect(() => { pedir(); }, [pedir, version]);

  /* Duración estándar según tipo (solo Clase y Recreo) */
  const duracionSugerida = (tipo) => {
    if (tipo === "Recreo") return parametros?.Parametro_Institucional_Duracion_Recreo ?? 15;
    return parametros?.Parametro_Institucional_Duracion_Bloque ?? 45;
  };

  const abrirCrear = () => {
    setForm(EMPTY_BLOQUE);
    setEditando(null);
    setErrorPanel("");
    setPanelAbierto(true);
  };

  const abrirEditar = (b) => {
    setForm({
      Bloque_Horario_Hora_Inicio: hhmm(b.Bloque_Horario_Hora_Inicio),
      Bloque_Horario_Hora_Fin:    hhmm(b.Bloque_Horario_Hora_Fin),
      Bloque_Horario_Jornada:     b.Bloque_Horario_Jornada,
      Bloque_Horario_Tipo:        b.Bloque_Horario_Tipo,
    });
    setEditando(b.Bloque_Horario_Id);
    setErrorPanel("");
    setPanelAbierto(true);
  };

  const cerrarPanel = () => { setPanelAbierto(false); setErrorPanel(""); setSuperposicion(null); };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setSuperposicion(null);
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "Bloque_Horario_Tipo" && prev.Bloque_Horario_Hora_Inicio) {
        const dur = duracionSugerida(value);
        next.Bloque_Horario_Hora_Fin = sumarMinutos(prev.Bloque_Horario_Hora_Inicio, dur);
      }
      if (name === "Bloque_Horario_Hora_Inicio") {
        next.Bloque_Horario_Jornada = jornadaDeHora(value);
      }
      return next;
    });
  };

  const usarDuracionSugerida = () => {
    const dur         = duracionSugerida(form.Bloque_Horario_Tipo);
    const horaFinCalc = sumarMinutos(form.Bloque_Horario_Hora_Inicio, dur);
    if (horaFinCalc) setForm((p) => ({ ...p, Bloque_Horario_Hora_Fin: horaFinCalc }));
  };

  const handleGuardar = async (e, reemplazar = false) => {
    e?.preventDefault();
    setGuardando(true);
    setErrorPanel("");
    try {
      const url    = editando ? `${API}/${editando}` : API;
      const method = editando ? "PUT" : "POST";
      const body   = editando ? form : { ...form, reemplazar };
      const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      const data   = await res.json();
      // Redefinir: el nuevo bloque se superpone con otros; se pide confirmar el reemplazo
      if (!res.ok && data.codigo === "SUPERPOSICION") {
        setSuperposicion(data.bloques);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      cerrarPanel();
      cargar();
      if (data.clasesPendientes > 0) onConflictos?.();
      // CU49: confirmar al usuario que el bloque quedó actualizado
      setExito(data.mensaje || "Bloque actualizado correctamente");
      setTimeout(() => setExito(""), 3500);
    } catch (e) {
      setErrorPanel(e.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (id) => {
    setEliminando(id);
    setError("");
    try {
      const res  = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      // Quitar un bloque con clases: el panel de avisos permite reubicarlas primero
      if (!res.ok && data.codigo === "TIENE_CLASES") {
        const b = bloques.find((x) => x.Bloque_Horario_Id === id);
        onQuitarBloqueConClases?.({
          id,
          etiqueta: b ? `${hhmm(b.Bloque_Horario_Hora_Inicio)}–${hhmm(b.Bloque_Horario_Hora_Fin)}` : "",
        });
        return;
      }
      if (!res.ok) throw new Error(data.error);
      cargar();
      // CU50: confirmar al usuario que el bloque fue eliminado
      setExito(data.mensaje || "Bloque eliminado exitosamente");
      setTimeout(() => setExito(""), 3500);
    } catch (e) {
      setError(e.message || "Error al eliminar");
    } finally {
      setEliminando(null);
    }
  };

  /* CU51: alternar selección de un bloque para eliminación múltiple */
  const toggleSeleccionado = (id) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const cancelarModoSeleccion = () => {
    setModoSeleccion(false);
    setSeleccionados([]);
  };

  /* CU51: eliminación de múltiples bloques — todo o nada */
  const handleEliminarMultiples = async () => {
    const detalle = bloques
      .filter((b) => seleccionados.includes(b.Bloque_Horario_Id))
      .map((b) => `• ${hhmm(b.Bloque_Horario_Hora_Inicio)}–${hhmm(b.Bloque_Horario_Hora_Fin)} · ${b.Bloque_Horario_Jornada} · ${b.Bloque_Horario_Tipo}`)
      .join("\n");
    if (!window.confirm(
      `¿Eliminar los ${seleccionados.length} bloque(s) seleccionado(s)?\n\n${detalle}\n\n` +
      "Si alguno tiene asignaciones activas o no existe, no se eliminará ninguno."
    )) return;
    setEliminandoVarios(true);
    setError("");
    try {
      const res  = await fetch(`${API}/multiples`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ bloques_id: seleccionados }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      cargar();
      setExito(data.mensaje || "Bloques eliminados exitosamente");
      setTimeout(() => setExito(""), 3500);
      cancelarModoSeleccion();
    } catch (e) {
      setError(e.message || "Ocurrió un error al eliminar");
    } finally {
      setEliminandoVarios(false);
    }
  };

  /* Preview naranja para el calendario */
  const previewBloque =
    panelAbierto && form.Bloque_Horario_Hora_Inicio && form.Bloque_Horario_Hora_Fin
      ? {
          hora_inicio: form.Bloque_Horario_Hora_Inicio,
          hora_fin:    form.Bloque_Horario_Hora_Fin,
          tipo:        form.Bloque_Horario_Tipo,
        }
      : null;

  const bloquesClase  = bloques.filter((b) => b.Bloque_Horario_Tipo === "Clase");
  const bloquesRecreo = bloques.filter((b) => b.Bloque_Horario_Tipo === "Recreo");
  const bloquesDesajustados = bloques.filter((b) => Number(b.desajustado) === 1).length;

  const durSugerida     = duracionSugerida(form.Bloque_Horario_Tipo);
  const horaFinSugerida = sumarMinutos(form.Bloque_Horario_Hora_Inicio, durSugerida);
  const yaUsaSugerida   = form.Bloque_Horario_Hora_Fin === horaFinSugerida && !!horaFinSugerida;

  return (
    <div style={s.seccion}>
      <div style={{ ...s.seccionHeader, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={s.seccionTitulo}>Bloques horarios</h2>
          <p style={s.seccionDesc}>
            Registra los bloques de tiempo de la jornada escolar: Clase y Recreo.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setVista("calendario")}
              style={{ padding: "0.35rem 0.75rem", border: "none", cursor: "pointer",
                background: vista === "calendario" ? "#1e3a5f" : "#f9fafb",
                color: vista === "calendario" ? "#fff" : "#6b7280",
                fontSize: "0.82rem", fontWeight: 500 }}>📅 Semana</button>
            <button onClick={() => setVista("lista")}
              style={{ padding: "0.35rem 0.75rem", border: "none", borderLeft: "1px solid #e5e7eb",
                cursor: "pointer",
                background: vista === "lista" ? "#1e3a5f" : "#f9fafb",
                color: vista === "lista" ? "#fff" : "#6b7280",
                fontSize: "0.82rem", fontWeight: 500 }}>☰ Lista</button>
          </div>
          {vista === "lista" && (
            <button
              onClick={() => (modoSeleccion ? cancelarModoSeleccion() : setModoSeleccion(true))}
              style={{ ...s.btnSecundario, background: modoSeleccion ? "#fee2e2" : "#f9fafb",
                color: modoSeleccion ? "#991b1b" : "#374151" }}
            >
              {modoSeleccion ? "Cancelar selección" : "☑ Seleccionar varios"}
            </button>
          )}
          <button className="btn-primary" onClick={abrirCrear}>+ Nuevo bloque</button>
        </div>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}
      {exito && <div style={s.exitoBanner}>✅ {exito}</div>}

      {loading ? (
        <p style={s.loadingText}>Cargando bloques...</p>
      ) : bloques.length === 0 ? (
        <div style={s.emptyState}>
          <span style={{ fontSize: "2.5rem" }}>🕐</span>
          <p>No hay bloques horarios registrados. Crea el primero.</p>
        </div>
      ) : (
        <>
          <div style={s.statsRow}>
            <StatMini label="Clases"  value={bloquesClase.length}  color="#1e40af" bg="#dbeafe" />
            <StatMini label="Recreos" value={bloquesRecreo.length} color="#166534" bg="#dcfce7" />
            <StatMini label="Total"   value={bloques.length}       color="#374151" bg="#f3f4f6" />
            {bloquesDesajustados > 0 && (
              <StatMini label="⚠ Desajustados" value={bloquesDesajustados} color="#854d0e" bg="#fefce8" />
            )}
          </div>

          {vista === "calendario" ? (
            <VistaCalendarioBloques
              bloques={bloques}
              onEditar={abrirEditar}
              onEliminar={handleEliminar}
              eliminando={eliminando}
              preview={previewBloque}
            />
          ) : (
            <div>
              {modoSeleccion && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#f0f4ff", border: "1px solid #dbeafe", borderRadius: 8,
                  padding: "0.6rem 1rem", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.875rem", color: "#374151" }}>
                    {seleccionados.length} bloque(s) seleccionado(s)
                  </span>
                  <button
                    style={{ ...s.btnDestructivoSolido, opacity: seleccionados.length === 0 ? 0.5 : 1 }}
                    disabled={seleccionados.length === 0 || eliminandoVarios}
                    onClick={handleEliminarMultiples}
                  >
                    {eliminandoVarios ? "Eliminando..." : "🗑 Eliminar seleccionados"}
                  </button>
                </div>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={s.tabla}>
                  <thead>
                    <tr style={s.theadRow}>
                      {modoSeleccion && <th style={{ ...s.th, width: 36 }}></th>}
                      <th style={s.th}>Hora inicio</th>
                      <th style={s.th}>Hora fin</th>
                      <th style={s.th}>Duración</th>
                      <th style={s.th}>Jornada</th>
                      <th style={s.th}>Tipo</th>
                      <th style={s.th}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloques.map((b, idx) => {
                      const durMin = calcDuracion(b.Bloque_Horario_Hora_Inicio, b.Bloque_Horario_Hora_Fin);
                      const desajustado = Number(b.desajustado) === 1;
                      return (
                        <tr key={b.Bloque_Horario_Id}
                          title={desajustado ? `⚠ ${b.motivo_desajuste} · ${b.clases} clase(s) por reubicar` : undefined}
                          style={{ background: desajustado ? "#fefce8" : idx % 2 === 0 ? "#f9fafb" : "#fff", borderBottom: "1px solid #e5e7eb" }}>
                          {modoSeleccion && (
                            <td style={s.td}>
                              <input
                                type="checkbox"
                                checked={seleccionados.includes(b.Bloque_Horario_Id)}
                                onChange={() => toggleSeleccionado(b.Bloque_Horario_Id)}
                              />
                            </td>
                          )}
                          <td style={{ ...s.td, fontWeight: 700 }}>{hhmm(b.Bloque_Horario_Hora_Inicio)}</td>
                          <td style={{ ...s.td, fontWeight: 700 }}>{hhmm(b.Bloque_Horario_Hora_Fin)}</td>
                          <td style={{ ...s.td, color: "#6b7280" }}>{durMin} min</td>
                          <td style={s.td}>{b.Bloque_Horario_Jornada}</td>
                          <td style={s.td}>
                            <TipoChip tipo={b.Bloque_Horario_Tipo} />
                            {desajustado && (
                              <span style={{ marginLeft: 6, fontSize: "0.72rem", fontWeight: 700, color: "#854d0e" }}>
                                ⚠ {b.motivo_desajuste}
                              </span>
                            )}
                          </td>
                          <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                            <button onClick={() => abrirEditar(b)} style={s.btnAccion}>✏ Editar</button>
                            <button
                              onClick={() => { if (window.confirm("¿Eliminar este bloque?")) handleEliminar(b.Bloque_Horario_Id); }}
                              style={{ ...s.btnAccion, marginLeft: "0.4rem", background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" }}
                              disabled={eliminando === b.Bloque_Horario_Id}
                            >
                              {eliminando === b.Bloque_Horario_Id ? "..." : "🗑 Eliminar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </>
      )}

      {/* Panel lateral derecho */}
      {panelAbierto && (
        <div style={s.panel}>
            <div style={s.panelHeader}>
              <div>
                <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 700 }}>
                  {editando ? "Editar bloque horario" : "Nuevo bloque horario"}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>
                  Configuración de bloques de tiempo {/* CU49 */}
                </p>
              </div>
              <button onClick={cerrarPanel} style={s.panelBtnClose} title="Cerrar">✕</button>
            </div>

            <div style={s.panelBody}>
              <form onSubmit={handleGuardar}>

                {/* Tipo de bloque: solo Clase o Recreo */}
                <label style={s.labelPanel}>Tipo de bloque *</label>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  {TIPOS_BLOQUE.map((t) => {
                    const col = TIPO_COLORES[t];
                    const activo = form.Bloque_Horario_Tipo === t;
                    return (
                      <button key={t} type="button"
                        onClick={() => handleFormChange({ target: { name: "Bloque_Horario_Tipo", value: t } })}
                        style={{
                          flex: 1, padding: "0.5rem 0.5rem", borderRadius: "8px",
                          border: `2px solid ${activo ? col.acento : "#e5e7eb"}`,
                          background: activo ? col.bg : "#f9fafb",
                          color: activo ? col.acento : "#6b7280",
                          fontWeight: activo ? 700 : 400,
                          fontSize: "0.85rem", cursor: "pointer", transition: "all 0.15s",
                        }}>
                        {col.icono} {t}
                      </button>
                    );
                  })}
                </div>

                {/* Hora inicio y fin */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={s.labelPanel}>Hora inicio *</label>
                    <input type="time" name="Bloque_Horario_Hora_Inicio"
                      value={form.Bloque_Horario_Hora_Inicio}
                      onChange={handleFormChange}
                      style={s.inputPanel} required />
                  </div>
                  <div>
                    <label style={s.labelPanel}>Hora término *</label>
                    <input type="time" name="Bloque_Horario_Hora_Fin"
                      value={form.Bloque_Horario_Hora_Fin}
                      onChange={handleFormChange}
                      style={s.inputPanel} required />
                  </div>
                </div>

                {/* Sugerencia de duración */}
                {form.Bloque_Horario_Hora_Inicio && (
                  <div style={{
                    margin: "0.5rem 0",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "8px",
                    background: yaUsaSugerida ? "#f0fdf4" : "#fff7ed",
                    border: `1px solid ${yaUsaSugerida ? "#bbf7d0" : "#fed7aa"}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                  }}>
                    <span style={{ fontSize: "0.8rem", color: yaUsaSugerida ? "#15803d" : "#9a3412" }}>
                      {yaUsaSugerida
                        ? `✓ Usando duración estándar de ${durSugerida} min para ${form.Bloque_Horario_Tipo}`
                        : `Duración estándar "${form.Bloque_Horario_Tipo}": ${durSugerida} min → termina ${horaFinSugerida || "—"}`}
                    </span>
                    {!yaUsaSugerida && horaFinSugerida && (
                      <button type="button" onClick={usarDuracionSugerida}
                        style={{ padding: "0.25rem 0.65rem", borderRadius: "6px",
                          border: "1px solid #f97316", background: "#fff7ed",
                          color: "#ea580c", fontSize: "0.75rem", fontWeight: 700,
                          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                        Usar sugerida
                      </button>
                    )}
                  </div>
                )}

                {/* Duración calculada */}
                {form.Bloque_Horario_Hora_Inicio && form.Bloque_Horario_Hora_Fin && (() => {
                  const dur = calcDuracion(
                    form.Bloque_Horario_Hora_Inicio + ":00",
                    form.Bloque_Horario_Hora_Fin + ":00"
                  );
                  return dur > 0 ? (
                    <p style={{ fontSize: "0.82rem", color: "#6b7280", margin: "0 0 0.5rem" }}>
                      Duración calculada: <strong>{dur} minutos</strong>
                    </p>
                  ) : null;
                })()}

                {/* Jornada (auto-derivada de hora_inicio) */}
                <label style={s.labelPanel}>Jornada *</label>
                <select name="Bloque_Horario_Jornada"
                  value={form.Bloque_Horario_Jornada}
                  onChange={handleFormChange}
                  style={s.inputPanel} required>
                  {JORNADAS.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
                <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "2px 0 0.5rem" }}>
                  Derivada automáticamente de la hora de inicio.
                </p>

                {errorPanel && (
                  <p style={{ color: "#dc2626", fontSize: "0.875rem", marginTop: "0.5rem",
                    background: "#fee2e2", padding: "0.5rem 0.75rem", borderRadius: "6px" }}>
                    {errorPanel}
                  </p>
                )}

                {superposicion && (() => {
                  const clases = superposicion.reduce((t, b) => t + b.clases, 0);
                  return (
                    <div style={{ marginTop: "0.75rem", background: "#fefce8", border: "1px solid #fde047",
                      borderLeft: "5px solid #eab308", borderRadius: 8, padding: "0.7rem 0.8rem", color: "#713f12", fontSize: "0.85rem" }}>
                      <strong>⚠ Este bloque se superpone con:</strong>
                      <ul style={{ margin: "0.3rem 0 0.4rem 1rem", padding: 0 }}>
                        {superposicion.map((b) => (
                          <li key={b.Bloque_Horario_Id}>
                            {hhmm(b.Bloque_Horario_Hora_Inicio)}–{hhmm(b.Bloque_Horario_Hora_Fin)} · {b.Bloque_Horario_Tipo}
                            {" — "}{b.clases > 0 ? `${b.clases} clase(s)` : "sin clases"}
                          </li>
                        ))}
                      </ul>
                      <p style={{ margin: "0 0 0.5rem" }}>
                        Si lo creas, reemplazará a esos bloques.
                        {clases > 0
                          ? ` Sus ${clases} clase(s) quedarán pendientes en el panel de avisos para migrarlas, eliminarlas o decidir más tarde.`
                          : " Como no tienen clases, se eliminarán."}
                      </p>
                      <button type="button" className="btn-primary" disabled={guardando}
                        onClick={() => handleGuardar(null, true)}>
                        {guardando ? "Creando..." : "Reemplazar y crear bloque"}
                      </button>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                  <button type="button" onClick={cerrarPanel}
                    style={{ ...s.btnSecundario, flex: 1 }} disabled={guardando}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={guardando}>
                    {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear bloque"}
                  </button>
                </div>
              </form>
            </div>
          </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PESTAÑA 3 — Eventos institucionales (CU70, CU71, CU72)
   Eventos que afectan el desarrollo normal de clases (excepciones).
   Pueden ser todo el día, retiro temprano, o suspensión total.
   Cada evento, según su impacto, marca bloques horarios como
   afectados en la tabla `afecta` (calculado por el backend).
══════════════════════════════════════════════════════════════════ */
const EMPTY_EVENTO = {
  Evento_Institucional_Nombre:         "",
  Evento_Institucional_Fecha:          "",
  Evento_Institucional_Descripcion:    "",
  Evento_Institucional_Impacto_Clases: "Sin impacto",
};

function TabEventos() {
  const [eventos,      setEventos]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [exito,        setExito]        = useState("");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [editando,     setEditando]     = useState(null);
  const [form,         setForm]         = useState(EMPTY_EVENTO);
  const [guardando,    setGuardando]    = useState(false);
  const [errorPanel,   setErrorPanel]   = useState("");
  const [eliminando,   setEliminando]   = useState(null);
  const [vista,        setVista]        = useState("calendario");

  // CU70/71 — detalle de bloques afectados por el evento en edición
  const [bloquesAfectados, setBloquesAfectados] = useState([]);
  const [cargandoAfectados, setCargandoAfectados] = useState(false);
  const [modalJornada, setModalJornada] = useState(false); // CU66
  const [detalleId,    setDetalleId]    = useState(null);

  /* Colapsar sidebar mientras el panel esté abierto */
  useEffect(() => {
    if (panelAbierto) document.body.classList.add("bloques-panel-open");
    else              document.body.classList.remove("bloques-panel-open");
    return () => document.body.classList.remove("bloques-panel-open");
  }, [panelAbierto]);

  // Igual que en TabBloques: el estado cambia solo al llegar la respuesta.
  const pedir = useCallback(() =>
    fetch(`${API}/eventos`, { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEventos(data);
        setError("");
      })
      .catch((e) => setError(e.message || "Error al cargar eventos"))
      .finally(() => setLoading(false)), []);

  const cargar = () => {
    setLoading(true);
    setError("");
    return pedir();
  };

  useEffect(() => { pedir(); }, [pedir]);

  const abrirCrear = () => {
    setForm(EMPTY_EVENTO);
    setEditando(null);
    setErrorPanel("");
    setBloquesAfectados([]);
    setPanelAbierto(true);
  };

  const abrirEditar = async (ev) => {
    setForm({
      Evento_Institucional_Nombre:         ev.Evento_Institucional_Nombre,
      Evento_Institucional_Fecha:          ev.Evento_Institucional_Fecha?.slice(0, 10),
      Evento_Institucional_Descripcion:    ev.Evento_Institucional_Descripcion,
      Evento_Institucional_Impacto_Clases: ev.Evento_Institucional_Impacto_Clases,
    });
    setEditando(ev.Evento_Institucional_Id);
    setErrorPanel("");
    setPanelAbierto(true);

    // Cargar el detalle de bloques afectados (CU70/71)
    setCargandoAfectados(true);
    try {
      const res  = await fetch(`${API}/eventos/${ev.Evento_Institucional_Id}/afectados`, { headers: authHeaders() });
      const data = await res.json();
      setBloquesAfectados(res.ok && Array.isArray(data) ? data : []);
    } catch {
      setBloquesAfectados([]);
    } finally {
      setCargandoAfectados(false);
    }
  };

  const cerrarPanel = () => { setPanelAbierto(false); setErrorPanel(""); setBloquesAfectados([]); };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorPanel("");
    try {
      const url    = editando ? `${API}/eventos/${editando}` : `${API}/eventos`;
      const method = editando ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error);
      cerrarPanel();
      cargar();
      // CU70/71: confirmar al usuario que el evento quedó registrado/actualizado
      setExito(data.mensaje || (editando ? "Evento actualizado correctamente" : "Evento registrado correctamente"));
      setTimeout(() => setExito(""), 3500);
    } catch (e) {
      setErrorPanel(e.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (id) => {
    setEliminando(id);
    setError("");
    try {
      const res  = await fetch(`${API}/eventos/${id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      cargar();
      // CU72: confirmar al usuario que el evento fue eliminado
      setExito(data.mensaje || "Evento eliminado correctamente");
      setTimeout(() => setExito(""), 3500);
    } catch (e) {
      setError(e.message || "Error al eliminar");
    } finally {
      setEliminando(null);
    }
  };

  const hoy      = toISODate(new Date());
  const proximos = eventos.filter((ev) => ev.Evento_Institucional_Fecha?.slice(0, 10) >= hoy);
  const pasados  = eventos.filter((ev) => ev.Evento_Institucional_Fecha?.slice(0, 10)  < hoy);

  const impactoActivo = IMPACTO_COLORES[form.Evento_Institucional_Impacto_Clases] || IMPACTO_COLORES["Sin impacto"];

  return (
    <div style={s.seccion}>
      <div style={{ ...s.seccionHeader, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={s.seccionTitulo}>Eventos institucionales</h2>
          <p style={s.seccionDesc}>
            Registra excepciones que afectan el desarrollo normal de clases: retiros tempranos,
            suspensiones parciales o totales de jornada.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setVista("calendario")}
              style={{ padding: "0.35rem 0.75rem", border: "none", cursor: "pointer",
                background: vista === "calendario" ? "#1e3a5f" : "#f9fafb",
                color: vista === "calendario" ? "#fff" : "#6b7280",
                fontSize: "0.82rem", fontWeight: 500 }}>📅 Semana</button>
            <button onClick={() => setVista("lista")}
              style={{ padding: "0.35rem 0.75rem", border: "none", borderLeft: "1px solid #e5e7eb",
                cursor: "pointer",
                background: vista === "lista" ? "#1e3a5f" : "#f9fafb",
                color: vista === "lista" ? "#fff" : "#6b7280",
                fontSize: "0.82rem", fontWeight: 500 }}>☰ Lista</button>
          </div>
          <button style={s.btnSecundario} onClick={() => setModalJornada(true)}>⏸ Suspender jornada completa</button>
          <button className="btn-primary" onClick={abrirCrear}>+ Nuevo evento</button>
        </div>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}
      {exito && <div style={s.exitoBanner}>✅ {exito}</div>}

      {loading ? (
        <p style={s.loadingText}>Cargando eventos...</p>
      ) : eventos.length === 0 ? (
        <div style={s.emptyState}>
          <span style={{ fontSize: "2.5rem" }}>📅</span>
          <p>No hay eventos institucionales registrados.</p>
        </div>
      ) : (
        <>
          <div style={s.statsRow}>
            <StatMini label="Próximos" value={proximos.length} color="#1e40af" bg="#dbeafe" />
            <StatMini label="Pasados"  value={pasados.length}  color="#6b7280" bg="#f3f4f6" />
            <StatMini label="Total"    value={eventos.length}  color="#374151" bg="#f9fafb" />
          </div>

          {vista === "calendario" ? (
            <VistaCalendarioEventos
              eventos={eventos}
              onVerDetalle={(ev) => setDetalleId(ev.Evento_Institucional_Id)}
              onEditar={abrirEditar}
              onEliminar={handleEliminar}
              eliminando={eliminando}
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={s.tabla}>
                <thead>
                  <tr style={s.theadRow}>
                    <th style={s.th}>Nombre</th>
                    <th style={s.th}>Fecha</th>
                    <th style={s.th}>Impacto en clases</th>
                    <th style={s.th}>Descripción</th>
                    <th style={s.th}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((ev, idx) => {
                    const esPasado = ev.Evento_Institucional_Fecha?.slice(0, 10) < hoy;
                    return (
                      <tr key={ev.Evento_Institucional_Id}
                        style={{ background: idx % 2 === 0 ? "#f9fafb" : "#fff",
                          borderBottom: "1px solid #e5e7eb", opacity: esPasado ? 0.65 : 1 }}>
                        <td style={{ ...s.td, fontWeight: 600 }}>
                          {ev.Evento_Institucional_Nombre}
                          {esPasado && <span style={{ marginLeft: 6, fontSize: "0.72rem",
                            color: "#9ca3af", fontWeight: 400 }}>Pasado</span>}
                        </td>
                        <td style={s.td}>
                          {formatearFechaEvento(ev.Evento_Institucional_Fecha)}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                            <ImpactoChip impacto={ev.Evento_Institucional_Impacto_Clases} />
                            <BloquesAfectadosBadge count={ev.bloques_afectados_count} />
                          </div>
                        </td>
                        <td style={{ ...s.td, maxWidth: 280, color: "#6b7280", fontSize: "0.85rem" }}>
                          {ev.Evento_Institucional_Descripcion}
                        </td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                          <button onClick={() => setDetalleId(ev.Evento_Institucional_Id)} style={s.btnAccion}>👁 Ver detalle</button>
                          <button onClick={() => abrirEditar(ev)} style={{ ...s.btnAccion, marginLeft: "0.4rem" }}>✏ Editar</button>
                          <button
                            onClick={() => { if (window.confirm("¿Eliminar este evento? Los bloques que quedaron marcados como afectados se liberarán.")) handleEliminar(ev.Evento_Institucional_Id); }}
                            style={{ ...s.btnAccion, marginLeft: "0.4rem", background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" }}
                            disabled={eliminando === ev.Evento_Institucional_Id}
                          >
                            {eliminando === ev.Evento_Institucional_Id ? "..." : "🗑 Eliminar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Panel lateral derecho */}
      {panelAbierto && (
        <div style={s.panel}>
            <div style={s.panelHeader}>
              <div>
                <h2 style={{ margin: 0, color: "#fff", fontSize: "1.05rem", fontWeight: 700 }}>
                  {editando ? "Editar evento" : "Nuevo evento institucional"}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>
                  Excepción institucional — suspende clases individualmente
                </p>
              </div>
              <button onClick={cerrarPanel} style={s.panelBtnClose} title="Cerrar">✕</button>
            </div>

            <div style={s.panelBody}>
              {/* Chip de impacto activo (preview visual) */}
              <div style={{
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                background: impactoActivo.bg,
                border: `2px solid ${impactoActivo.borde}`,
                textAlign: "center",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: impactoActivo.acento,
              }}>
                {impactoActivo.icono} {form.Evento_Institucional_Impacto_Clases || "Sin impacto"}
                {form.Evento_Institucional_Nombre && (
                  <div style={{ fontWeight: 400, fontSize: "0.78rem", marginTop: 2 }}>
                    {form.Evento_Institucional_Nombre}
                  </div>
                )}
              </div>

              {/* CU70/71 — detalle de bloques afectados (solo al editar) */}
              {editando && (
                <div style={{
                  marginBottom: "1rem", padding: "0.6rem 0.75rem", borderRadius: 8,
                  background: "#fafafa", border: "1px solid #e5e7eb",
                }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                    Bloques horarios afectados
                  </div>
                  {cargandoAfectados ? (
                    <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: 0 }}>Cargando...</p>
                  ) : bloquesAfectados.length === 0 ? (
                    <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: 0 }}>
                      Este evento no afecta ningún bloque horario.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {bloquesAfectados.map((b) => (
                        <span key={b.Afecta_Id} style={{
                          fontSize: "0.72rem", padding: "2px 8px", borderRadius: 10,
                          background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca",
                        }}>
                          {hhmm(b.Bloque_Horario_Hora_Inicio)}–{hhmm(b.Bloque_Horario_Hora_Fin)} ({b.Bloque_Horario_Jornada})
                        </span>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: "0.7rem", color: "#9ca3af", margin: "6px 0 0" }}>
                    Se recalculan automáticamente al guardar según el impacto seleccionado.
                  </p>
                </div>
              )}

              <form onSubmit={handleGuardar}>
                <label style={s.labelPanel}>Nombre del evento *</label>
                <input type="text"
                  value={form.Evento_Institucional_Nombre}
                  onChange={(e) => setForm((p) => ({ ...p, Evento_Institucional_Nombre: e.target.value }))}
                  style={s.inputPanel}
                  placeholder="Ej: Licenciatura 4tos Medios, Retiro anticipado" required />

                <label style={{ ...s.labelPanel, marginTop: "0.85rem" }}>Fecha *</label>
                <input type="date"
                  value={form.Evento_Institucional_Fecha}
                  onChange={(e) => setForm((p) => ({ ...p, Evento_Institucional_Fecha: e.target.value }))}
                  style={s.inputPanel} required />

                <label style={{ ...s.labelPanel, marginTop: "0.85rem" }}>Impacto en clases *</label>
                <div style={{ display: "flex", gap: "0.4rem", flexDirection: "column", marginBottom: "0.5rem" }}>
                  {(form.Evento_Institucional_Impacto_Clases === "Suspensión parcial" ? [...IMPACTOS, "Suspensión parcial"] : IMPACTOS).map((imp) => {
                    const col    = IMPACTO_COLORES[imp];
                    const activo = form.Evento_Institucional_Impacto_Clases === imp;
                    return (
                      <button key={imp} type="button"
                        onClick={() => setForm((p) => ({ ...p, Evento_Institucional_Impacto_Clases: imp }))}
                        style={{
                          padding: "0.45rem 0.75rem", borderRadius: "8px", textAlign: "left",
                          border: `2px solid ${activo ? col.acento : "#e5e7eb"}`,
                          background: activo ? col.bg : "#f9fafb",
                          color: activo ? col.acento : "#6b7280",
                          fontWeight: activo ? 700 : 400,
                          fontSize: "0.82rem", cursor: "pointer", transition: "all 0.15s",
                        }}>
                        {col.icono} {imp}
                        {imp === "Salida anticipada" && (
                          <span style={{ display: "block", fontWeight: 400, fontSize: "0.7rem", opacity: 0.8, marginTop: 2 }}>
                            Afecta bloques de la jornada Tarde
                          </span>
                        )}
                        {imp === "Suspensión total" && (
                          <span style={{ display: "block", fontWeight: 400, fontSize: "0.7rem", opacity: 0.8, marginTop: 2 }}>
                            Afecta todos los bloques de Clase del día
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <label style={{ ...s.labelPanel, marginTop: "0.85rem" }}>Descripción *</label>
                <textarea
                  value={form.Evento_Institucional_Descripcion}
                  onChange={(e) => setForm((p) => ({ ...p, Evento_Institucional_Descripcion: e.target.value }))}
                  style={{ ...s.inputPanel, minHeight: 80, resize: "vertical" }}
                  placeholder="Describe el evento, su motivo y el impacto en el horario" required />

                {errorPanel && (
                  <p style={{ color: "#dc2626", fontSize: "0.875rem", marginTop: "0.5rem",
                    background: "#fee2e2", padding: "0.5rem 0.75rem", borderRadius: "6px" }}>
                    {errorPanel}
                  </p>
                )}

                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                  <button type="button" onClick={cerrarPanel}
                    style={{ ...s.btnSecundario, flex: 1 }} disabled={guardando}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={guardando}>
                    {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear evento"}
                  </button>
                </div>
              </form>
            </div>
          </div>
      )}

      {detalleId && (
        <DetalleEventoModal
          eventoId={detalleId}
          onClose={() => setDetalleId(null)}
          onEditar={(ev) => { setDetalleId(null); abrirEditar(ev); }}
        />
      )}

      {/* CU66 — Suspendiendo jornada completa por evento institucional */}
      {modalJornada && (
        <SuspenderJornadaModal
          onClose={() => setModalJornada(false)}
          onExito={(mensaje) => {
            setModalJornada(false);
            setExito(mensaje);
            setTimeout(() => setExito(""), 3500);
            cargar();
          }}
        />
      )}
    </div>
  );
}

/* Detalle de un evento institucional: datos, bloques afectados y clases suspendidas */
function DetalleEventoModal({ eventoId, onClose, onEditar }) {
  const [evento,   setEvento]   = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState("");

  useEffect(() => {
    let vigente = true;
    fetch(`${API}/eventos/${eventoId}`, { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!vigente) return;
        if (!res.ok) setError(data.error || "No fue posible cargar el evento");
        else setEvento(data);
      })
      .catch(() => { if (vigente) setError("No fue posible conectar con el servidor"); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [eventoId]);

  const col = IMPACTO_COLORES[evento?.Evento_Institucional_Impacto_Clases] || IMPACTO_COLORES["Sin impacto"];
  const esPasado = evento && evento.Evento_Institucional_Fecha < toISODate(new Date());
  const fechaLarga = evento
    ? formatearFechaEvento(evento.Evento_Institucional_Fecha, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{evento ? evento.Evento_Institucional_Nombre : "Detalle del evento"}</h2>
          <button className="btn-cerrar" onClick={onClose} title="Cerrar">✕</button>
        </div>

        {cargando ? (
          <p style={s.loadingText}>Cargando...</p>
        ) : error ? (
          <div style={s.errorBanner}>{error}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "#1e3a5f" }}>
                📅 {fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}
              </span>
              {esPasado && <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Pasado</span>}
              <ImpactoChip impacto={evento.Evento_Institucional_Impacto_Clases} />
            </div>

            <div>
              <div style={s.label}>Descripción</div>
              <p style={{ margin: 0, color: "#374151", whiteSpace: "pre-wrap" }}>
                {evento.Evento_Institucional_Descripcion}
              </p>
            </div>

            <div>
              <div style={s.label}>Bloques horarios afectados ({evento.bloques.length})</div>
              {evento.bloques.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#9ca3af" }}>Este evento no afecta ningún bloque horario.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {evento.bloques.map((b) => (
                    <span key={b.Afecta_Id} style={{
                      fontSize: "0.75rem", padding: "2px 8px", borderRadius: 10,
                      background: col.bg, color: col.acento, border: `1px solid ${col.borde}`,
                    }}>
                      {hhmm(b.Bloque_Horario_Hora_Inicio)}–{hhmm(b.Bloque_Horario_Hora_Fin)} ({b.Bloque_Horario_Jornada})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {evento.bloques.length > 0 && (
              <div>
                <div style={s.label}>
                  Clases suspendidas el {evento.dia_semana?.toLowerCase()} ({evento.clases.length})
                </div>
                {evento.clases.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#9ca3af" }}>
                    No hay clases programadas en esos bloques ese día de la semana.
                  </p>
                ) : (
                  <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                    <table style={s.tabla}>
                      <thead>
                        <tr style={s.theadRow}>
                          <th style={s.th}>Horario</th>
                          <th style={s.th}>Curso</th>
                          <th style={s.th}>Asignatura</th>
                          <th style={s.th}>Docente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evento.clases.map((c) => (
                          <tr key={c.Horario_Asignatura_Id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                              {hhmm(c.Bloque_Horario_Hora_Inicio)}–{hhmm(c.Bloque_Horario_Hora_Fin)}
                            </td>
                            <td style={s.td}>{c.Curso_Nombre}</td>
                            <td style={s.td}>{c.Asignatura_Nombre}</td>
                            <td style={{ ...s.td, color: c.Docente_Nombre ? "#374151" : "#9ca3af" }}>
                              {c.Docente_Nombre || "Sin docente"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" style={s.btnSecundario} onClick={onClose}>Cerrar</button>
              <button type="button" className="btn-primary" onClick={() => onEditar(evento)}>✏ Editar evento</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* CU66 — Suspendiendo jornada completa por evento institucional */
function SuspenderJornadaModal({ onClose, onExito }) {
  const [form, setForm] = useState({ fecha: "", jornada: "", nombre: "", descripcion: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState("");

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const confirmar = async (e) => {
    e.preventDefault();
    setError("");
    setDetalle("");
    setEnviando(true);
    try {
      const res = await fetch("/api/horarios/suspender-jornada", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No fue posible suspender la jornada");
        setDetalle(data.detalle || "");
        return;
      }
      onExito(data.mensaje || "Jornada suspendida correctamente");
    } catch {
      setError("No fue posible conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Suspender jornada completa</h2>
          <button className="btn-cerrar" onClick={onClose} title="Cerrar">✕</button>
        </div>
        <form onSubmit={confirmar} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label style={s.label}>Fecha *</label>
          <input type="date" style={s.input} value={form.fecha} onChange={set("fecha")} />
          <label style={s.label}>Jornada *</label>
          <select style={s.input} value={form.jornada} onChange={set("jornada")}>
            <option value="">— Selecciona la jornada —</option>
            {JORNADAS_SUSPENSION.map((j) => <option key={j.valor} value={j.valor}>{j.etiqueta}</option>)}
          </select>
          <label style={s.label}>Nombre del evento institucional *</label>
          <input style={s.input} value={form.nombre} onChange={set("nombre")} />
          <label style={s.label}>Descripción *</label>
          <textarea style={{ ...s.input, minHeight: 70 }} value={form.descripcion} onChange={set("descripcion")} />

          {error && (
            <div style={s.errorBanner}>
              <strong>{error}</strong>
              {detalle && <div style={{ marginTop: 4 }}>{detalle}</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
            <button type="button" style={{ ...s.btnSecundario, flex: 1 }} onClick={onClose} disabled={enviando}>Cancelar</button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={enviando}>
              {enviando ? "Suspendiendo..." : "Confirmar suspensión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Vista Calendario de Eventos (Google Calendar-style, 7 días)
══════════════════════════════════════════════════════════════════ */
const IMPACTO_COLORES = {
  "Sin impacto":       { bg: "#f0fdf4", borde: "#22c55e", acento: "#166534", icono: "✅" },
  "Salida anticipada": { bg: "#fefce8", borde: "#eab308", acento: "#92400e", icono: "⚠" },
  "Suspensión total":  { bg: "#fef2f2", borde: "#ef4444", acento: "#991b1b", icono: "🚫" },
  "Suspensión jornada mañana": { bg: "#fff7ed", borde: "#f97316", acento: "#9a3412", icono: "⏸" },
  "Suspensión parcial": { bg: "#f5f3ff", borde: "#8b5cf6", acento: "#5b21b6", icono: "⏸" },
};

const DIAS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function lunesDe(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function VistaCalendarioEventos({ eventos, onVerDetalle, onEditar, onEliminar, eliminando }) {
  const [lunes,   setLunes]   = useState(() => lunesDe(new Date()));
  const [hovered, setHovered] = useState(null);

  const hoyISO = toISODate(new Date());

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    return d;
  });

  const prevSemana = () => { const d = new Date(lunes); d.setDate(d.getDate() - 7); setLunes(d); };
  const nextSemana = () => { const d = new Date(lunes); d.setDate(d.getDate() + 7); setLunes(d); };
  const irHoy      = () => setLunes(lunesDe(new Date()));

  const domingo    = dias[6];
  const rangoLabel = `${lunes.toLocaleDateString("es-CL", { day: "numeric", month: "short" })} – ${domingo.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}`;

  const btnNav = {
    padding: "0.3rem 0.65rem", border: "1px solid #e5e7eb", borderRadius: 6,
    background: "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "#374151",
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <button onClick={prevSemana} style={btnNav}>‹</button>
          <button onClick={nextSemana} style={btnNav}>›</button>
          <button onClick={irHoy} style={{ ...btnNav, fontSize: "0.78rem", color: "#1e40af", borderColor: "#93c5fd" }}>Hoy</button>
        </div>
        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e3a5f" }}>{rangoLabel}</span>
        <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{eventos.length} evento{eventos.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {dias.map((dia, i) => {
          const diaISO        = toISODate(dia);
          const esHoy         = diaISO === hoyISO;
          const esPasado      = diaISO < hoyISO;
          const esFinde       = i >= 5;
          const eventosDelDia = eventos.filter(ev => ev.Evento_Institucional_Fecha?.slice(0, 10) === diaISO);

          return (
            <div key={i} style={{
              borderLeft: i > 0 ? "1px solid #e5e7eb" : "none",
              borderTop: "1px solid #e5e7eb",
              minHeight: 110,
              background: esHoy ? "#eff6ff" : esFinde ? "#fafafa" : "#fff",
              opacity: esPasado && !esHoy ? 0.72 : 1,
            }}>
              <div style={{ padding: "8px 6px 5px", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>
                <div style={{ fontSize: "0.65rem", color: esFinde ? "#9ca3af" : "#6b7280",
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {DIAS_ES[i]}
                </div>
                <div style={{
                  fontSize: "1.05rem", fontWeight: 700, lineHeight: 1, marginTop: 3,
                  color: esHoy ? "#fff" : esFinde ? "#9ca3af" : "#1e3a5f",
                  background: esHoy ? "#1e40af" : "transparent",
                  borderRadius: "50%", width: 28, height: 28,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  {dia.getDate()}
                </div>
              </div>

              <div style={{ padding: "4px 4px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                {eventosDelDia.map(ev => {
                  const col   = IMPACTO_COLORES[ev.Evento_Institucional_Impacto_Clases] || IMPACTO_COLORES["Sin impacto"];
                  const isHov = hovered === ev.Evento_Institucional_Id;
                  return (
                    <div key={ev.Evento_Institucional_Id}
                      onMouseEnter={() => setHovered(ev.Evento_Institucional_Id)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => onVerDetalle(ev)}
                      title="Ver detalle"
                      style={{
                        background: col.bg, border: `1px solid ${col.borde}`,
                        borderLeft: `3px solid ${col.acento}`, borderRadius: 5,
                        padding: "3px 5px", cursor: "pointer", fontSize: "0.7rem",
                        lineHeight: 1.35, position: "relative",
                        boxShadow: isHov ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                        transition: "box-shadow 0.15s",
                      }}>
                      <div style={{ fontWeight: 700, color: col.acento,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        paddingRight: isHov ? 38 : 0 }}>
                        {col.icono} {ev.Evento_Institucional_Nombre}
                      </div>
                      <div style={{ fontSize: "0.63rem", color: col.acento, opacity: 0.75, display: "flex", alignItems: "center", gap: 4 }}>
                        <span>{ev.Evento_Institucional_Impacto_Clases}</span>
                        {ev.bloques_afectados_count > 0 && (
                          <span style={{ fontWeight: 700 }}>· {ev.bloques_afectados_count} bloq.</span>
                        )}
                      </div>
                      {isHov && (
                        <div style={{ position: "absolute", top: 3, right: 4, display: "flex", gap: 2 }}>
                          <button title="Editar" onClick={e => { e.stopPropagation(); onEditar(ev); }}
                            style={{ width: 16, height: 16, padding: 0, border: "none", borderRadius: 3,
                              cursor: "pointer", background: col.acento, color: "#fff",
                              fontSize: "0.55rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✏</button>
                          <button title="Eliminar" disabled={eliminando === ev.Evento_Institucional_Id}
                            onClick={e => { e.stopPropagation(); if (window.confirm("¿Eliminar este evento?")) onEliminar(ev.Evento_Institucional_Id); }}
                            style={{ width: 16, height: 16, padding: 0, border: "none", borderRadius: 3,
                              cursor: "pointer", background: "#dc2626", color: "#fff",
                              fontSize: "0.65rem", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Vista Calendario de Bloques (Google Calendar-style, eje de tiempo)
══════════════════════════════════════════════════════════════════ */
const PX_POR_MIN = 1.5;

const TIPO_COLORES = {
  "Clase":  { bg: "#eff6ff", borde: "#3b82f6", acento: "#1e40af", icono: "📚" },
  "Recreo": { bg: "#f0fdf4", borde: "#22c55e", acento: "#166534", icono: "⛹" },
};

// Bloque reemplazado o fuera de la jornada, con clases pendientes de reubicar
const COLOR_DESAJUSTADO = { bg: "#fefce8", borde: "#facc15", acento: "#854d0e", icono: "⚠" };

function toMin(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

function minToHHMM(m) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function VistaCalendarioBloques({ bloques, onEditar, onEliminar, eliminando, preview }) {
  const [hovered, setHovered] = useState(null);

  const todosStarts = [
    ...bloques.map(b => toMin(b.Bloque_Horario_Hora_Inicio)),
    ...(preview ? [toMin(preview.hora_inicio)] : []),
  ];
  const todosEnds = [
    ...bloques.map(b => toMin(b.Bloque_Horario_Hora_Fin)),
    ...(preview ? [toMin(preview.hora_fin)] : []),
  ];

  if (!todosStarts.length) return null;

  const rangoMin = Math.floor(Math.min(...todosStarts) / 60) * 60;
  const rangoMax = Math.ceil(Math.max(...todosEnds) / 60) * 60;
  const totalMin = rangoMax - rangoMin;
  const totalPx  = totalMin * PX_POR_MIN;

  const horas   = Array.from({ length: totalMin / 60 + 1 }, (_, i) => rangoMin + i * 60);
  const diasAbr = ["Lun", "Mar", "Mié", "Jue", "Vie"];

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      {/* Encabezados */}
      <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb" }}>
        <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid #e5e7eb" }} />
        {diasAbr.map((d, i) => (
          <div key={d} style={{
            flex: 1, padding: "10px 0", textAlign: "center",
            background: preview ? "#fff7ed" : "#f8fafc",
            borderLeft: i > 0 ? "1px solid #e5e7eb" : "none",
            fontWeight: 700, fontSize: "0.82rem",
            color: preview ? "#c2410c" : "#1e3a5f",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Cuerpo */}
      <div style={{ display: "flex" }}>
        {/* Etiquetas de hora */}
        <div style={{ width: 56, flexShrink: 0, position: "relative", height: totalPx,
          borderRight: "1px solid #e5e7eb", background: "#fff" }}>
          {horas.map(m => (
            <div key={m} style={{
              position: "absolute", top: (m - rangoMin) * PX_POR_MIN - 7,
              right: 8, fontSize: "0.7rem", color: "#9ca3af", fontWeight: 600, lineHeight: 1,
            }}>
              {minToHHMM(m)}
            </div>
          ))}
        </div>

        {/* Columnas de días (todos ven los mismos bloques — plantilla diaria) */}
        {diasAbr.map((d, di) => (
          <div key={d} style={{
            flex: 1, position: "relative", height: totalPx,
            borderLeft: di > 0 ? "1px solid #e5e7eb" : "none",
            background: "#fafafa",
          }}>
            {horas.map(m => (
              <div key={m} style={{ position: "absolute", top: (m - rangoMin) * PX_POR_MIN,
                left: 0, right: 0, height: 1, background: "#e5e7eb" }} />
            ))}
            {horas.slice(0, -1).map(m => (
              <div key={`h${m}`} style={{ position: "absolute", top: (m + 30 - rangoMin) * PX_POR_MIN,
                left: 0, right: 0, height: 1, background: "#f3f4f6" }} />
            ))}

            {/* Bloques existentes */}
            {bloques.map(b => {
              const sMin   = toMin(b.Bloque_Horario_Hora_Inicio);
              const eMin   = toMin(b.Bloque_Horario_Hora_Fin);
              const top    = (sMin - rangoMin) * PX_POR_MIN;
              const h      = Math.max((eMin - sMin) * PX_POR_MIN - 3, 22);
              const desajustado = Number(b.desajustado) === 1;
              const col    = desajustado ? COLOR_DESAJUSTADO : TIPO_COLORES[b.Bloque_Horario_Tipo] || TIPO_COLORES["Clase"];
              const dur    = eMin - sMin;
              const hovKey = `${b.Bloque_Horario_Id}-${di}`;
              const isHov  = hovered === hovKey;

              return (
                <div key={b.Bloque_Horario_Id}
                  onMouseEnter={() => setHovered(hovKey)}
                  onMouseLeave={() => setHovered(null)}
                  title={desajustado ? `⚠ ${b.motivo_desajuste} · ${b.clases} clase(s) por reubicar` : undefined}
                  style={{
                    position: "absolute", top, left: desajustado ? "50%" : 5, right: 5, height: h,
                    background: col.bg, border: `1px solid ${col.borde}`,
                    borderLeft: `3px solid ${col.acento}`,
                    borderRadius: 6, padding: "2px 5px 2px 6px",
                    overflow: "hidden", cursor: "pointer",
                    zIndex: isHov ? 10 : 1,
                    boxShadow: isHov ? "0 3px 10px rgba(0,0,0,0.12)" : "none",
                    transition: "box-shadow 0.15s",
                  }}>
                  <div style={{ display: "flex", height: "100%", justifyContent: "space-between" }}>
                    <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }} onClick={() => onEditar(b)}>
                      <div style={{ fontWeight: 700, fontSize: "0.7rem", color: col.acento,
                        lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden" }}>
                        {hhmm(b.Bloque_Horario_Hora_Inicio)}–{hhmm(b.Bloque_Horario_Hora_Fin)}
                      </div>
                      {h > 32 && (
                        <div style={{ fontSize: "0.65rem", color: col.acento, opacity: 0.8 }}>
                          {desajustado
                            ? `⚠ ${b.clases} clase(s) por reubicar`
                            : `${col.icono} ${b.Bloque_Horario_Tipo} · ${dur} min`}
                        </div>
                      )}
                    </div>
                    {isHov && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 3, flexShrink: 0 }}>
                        <button title="Editar" onClick={e => { e.stopPropagation(); onEditar(b); }}
                          style={{ width: 18, height: 18, padding: 0, border: "none", borderRadius: 4,
                            cursor: "pointer", background: col.acento, color: "#fff",
                            fontSize: "0.6rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✏</button>
                        <button title="Eliminar" disabled={eliminando === b.Bloque_Horario_Id}
                          onClick={e => { e.stopPropagation(); if (window.confirm("¿Eliminar este bloque?")) onEliminar(b.Bloque_Horario_Id); }}
                          style={{ width: 18, height: 18, padding: 0, border: "none", borderRadius: 4,
                            cursor: "pointer", background: "#dc2626", color: "#fff",
                            fontSize: "0.65rem", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Preview naranja (aparece en TODAS las columnas) ── */}
            {preview && (() => {
              const sMin = toMin(preview.hora_inicio);
              const eMin = toMin(preview.hora_fin);
              if (eMin <= sMin) return null;
              const top = (sMin - rangoMin) * PX_POR_MIN;
              const h   = Math.max((eMin - sMin) * PX_POR_MIN - 3, 22);
              const dur = eMin - sMin;
              return (
                <div key="preview" style={{
                  position: "absolute", top, left: 5, right: 5, height: h,
                  background: "rgba(251, 146, 60, 0.18)",
                  border: "2px dashed #f97316",
                  borderLeft: "3px solid #ea580c",
                  borderRadius: 6, padding: "2px 5px 2px 6px",
                  overflow: "hidden", zIndex: 20, pointerEvents: "none",
                }}>
                  <div style={{ fontWeight: 700, fontSize: "0.7rem", color: "#c2410c",
                    lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden" }}>
                    {preview.hora_inicio}–{preview.hora_fin}
                  </div>
                  {h > 28 && (
                    <div style={{ fontSize: "0.65rem", color: "#ea580c", opacity: 0.9 }}>
                      {preview.tipo} · {dur} min
                    </div>
                  )}
                  {h > 44 && (
                    <div style={{ fontSize: "0.6rem", color: "#9a3412", fontStyle: "italic" }}>
                      Vista previa
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────── */
function StatMini({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 8,
      padding: "0.6rem 1rem", textAlign: "center", minWidth: 90 }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{label}</div>
    </div>
  );
}

/* ── Estilos ───────────────────────────────────────────────────── */
const s = {
  page:     { padding: "1.75rem" },
  header:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "1.5rem", gap: "1rem", flexWrap: "wrap" },
  titulo:   { margin: 0, color: "#1e3a5f", fontSize: "1.5rem" },
  subtitulo:{ margin: "0.3rem 0 0 0", color: "#6b7280", fontSize: "0.9rem" },
  rolBadge: { padding: "4px 14px", borderRadius: 20, fontSize: "0.82rem", fontWeight: 700,
    background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", flexShrink: 0 },

  tabBar:      { display: "flex", gap: "0.25rem", borderBottom: "2px solid #e5e7eb",
    marginBottom: "1.75rem", flexWrap: "wrap" },
  tabBtn:      { padding: "0.6rem 1.1rem", border: "none", background: "transparent",
    cursor: "pointer", fontSize: "0.9rem", color: "#6b7280", borderRadius: "8px 8px 0 0",
    fontWeight: 500, transition: "all .15s" },
  tabBtnActive:{ background: "#1e3a5f", color: "#fff", fontWeight: 700 },
  tabContent:  { },

  seccion:       { },
  seccionHeader: { display: "flex", flexDirection: "column", marginBottom: "1.25rem" },
  seccionTitulo: { margin: "0 0 0.3rem 0", color: "#1e3a5f", fontSize: "1.15rem" },
  seccionDesc:   { margin: 0, color: "#6b7280", fontSize: "0.875rem" },

  fieldset:{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1rem" },
  legend:  { fontWeight: 700, color: "#1e3a5f", fontSize: "0.9rem", padding: "0 0.4rem" },
  formRow: { display: "flex", gap: "1rem", flexWrap: "wrap" },
  formField:{ flex: "1 1 160px", display: "flex", flexDirection: "column" },
  label:   { fontWeight: 600, fontSize: "0.875rem", color: "#374151", marginBottom: "0.3rem" },
  input:   { padding: "0.45rem 0.65rem", borderRadius: 6, border: "1px solid #d1d5db",
    fontSize: "0.9rem", boxSizing: "border-box", width: "100%" },
  resumenBox: { background: "#f0f4ff", border: "1px solid #dbeafe", borderRadius: 8,
    padding: "0.9rem 1.1rem", marginBottom: "0.5rem" },
  resumenList:{ margin: "0.3rem 0 0 1rem", padding: 0, fontSize: "0.85rem", color: "#374151" },

  statsRow:   { display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" },
  tabla:      { width: "100%", borderCollapse: "collapse", minWidth: 560 },
  theadRow:   { background: "#1e3a5f", color: "#fff" },
  th:         { padding: "0.7rem 1rem", textAlign: "left", fontWeight: 600, fontSize: "0.85rem" },
  td:         { padding: "0.6rem 1rem", verticalAlign: "middle", fontSize: "0.875rem" },
  emptyState: { textAlign: "center", padding: "2.5rem 1rem", color: "#6b7280",
    background: "#f9fafb", borderRadius: 10, border: "1px dashed #d1d5db" },

  btnAccion:    { padding: "0.35rem 0.75rem", borderRadius: 6, border: "1px solid #d1d5db",
    background: "#f9fafb", cursor: "pointer", fontSize: "0.8rem", fontWeight: 500 },
  btnSecundario:{ padding: "0.4rem 0.9rem", borderRadius: 6, border: "1px solid #d1d5db",
    background: "#f9fafb", cursor: "pointer", fontSize: "0.875rem" },
  btnDestructivoSolido: { padding: "0.5rem 1rem", borderRadius: 8, border: "none",
    background: "#991b1b", color: "#fff", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600 },

  errorBanner: { color: "#dc2626", background: "#fee2e2", border: "1px solid #fecaca",
    padding: "0.7rem 1rem", borderRadius: 8, marginBottom: "1rem", fontSize: "0.9rem" },
  exitoBanner: { color: "#166534", background: "#dcfce7", border: "1px solid #bbf7d0",
    padding: "0.7rem 1rem", borderRadius: 8, marginBottom: "1rem", fontSize: "0.9rem" },
  loadingText: { color: "#6b7280", fontStyle: "italic" },

  accessDenied:{ display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "4rem 2rem", textAlign: "center" },

  /* Panel lateral */
  panel: {
    position: "fixed", top: 0, right: 0, width: 440, height: "100vh",
    background: "#fff", boxShadow: "-6px 0 32px rgba(0,0,0,0.18)",
    zIndex: 990, display: "flex", flexDirection: "column",
    animation: "slideInRight 0.22s ease",
  },
  panelHeader: {
    background: "#0f172a", padding: "1rem 1.25rem",
    display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
  },
  panelBtnClose: {
    background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff", borderRadius: "6px", width: 32, height: 32,
    cursor: "pointer", fontSize: "0.9rem", display: "flex",
    alignItems: "center", justifyContent: "center",
  },
  panelBody: { flex: 1, overflowY: "auto", padding: "1.25rem" },

  labelPanel: {
    display: "block", fontWeight: 600, marginBottom: "0.25rem",
    marginTop: "0.85rem", fontSize: "0.875rem", color: "#374151",
  },
  inputPanel: {
    width: "100%", padding: "0.45rem 0.6rem", borderRadius: "6px",
    border: "1px solid #d1d5db", boxSizing: "border-box", fontSize: "0.9rem",
  },
};