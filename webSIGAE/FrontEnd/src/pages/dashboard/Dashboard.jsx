import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, getAsignacionesDocente, getCitaciones, getConversaciones } from "../../services/api";
import EstadoCitacionBadge from "../../components/citaciones/EstadoCitacionBadge";
import { MOSTRAR_MIS_CURSOS } from "../../config/funcionalidades";
import { esCancelada, fechaISO, formatearFecha, hoyISO } from "../../utils/citaciones";

/* ── Grupo de navegación ───────────────────────────── */
function NavGroup({ titulo, icono, color, links }) {
  return (
    <div className="nav-group">
      <div className="nav-group-header" style={{ background: color }}>
        <span>{icono}</span>
        <span>{titulo}</span>
      </div>
      <div className="nav-group-links">
        {links.filter(Boolean).map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Dashboard de Administrador ───────────────────── */
// Mismos enlaces que el bloque "Administración" del sidebar (MainLayout.jsx),
// más accesos directos a las pestañas de Parámetros Institución. Los marcados con
// superAdmin solo los ve el Super Admin (rutas superAdminOnly o enlaces que el
// sidebar le reserva).
const MODULOS_ADMIN = [
  {
    titulo: "Registro de Usuarios",
    icono: "✏",
    color: "#4f46e5",
    links: [
      { label: "Registrar Administrador", to: "/registrar-admin", superAdmin: true },
      { label: "Registrar Docente",       to: "/registrar-docente" },
      { label: "Registrar Apoderado",     to: "/registrar-apoderado" },
      { label: "Registrar Estudiante",    to: "/registrar-estudiante" },
    ],
  },
  {
    titulo: "Gestión de Usuarios",
    icono: "👤",
    color: "#0f766e",
    links: [
      { label: "Gestión de Usuarios",        to: "/usuarios" },
      { label: "Buscar Usuarios",            to: "/buscar-usuarios" },
      { label: "Gestión de Administradores", to: "/administradores", superAdmin: true },
      { label: "Gestión de Roles",           to: "/gestion-roles", superAdmin: true },
      { label: "Gestión de Docentes",        to: "/docentes" },
      { label: "Gestión de Apoderados",      to: "/apoderados" },
    ],
  },
  {
    titulo: "Gestión Académica",
    icono: "📚",
    color: "#7c3aed",
    links: [
      { label: "Plan Educativo", to: "/plan-educativo" },
      { label: "Asignaturas",    to: "/asignaturas" },
      { label: "Cursos",         to: "/cursos" },
      { label: "Estudiantes",    to: "/estudiantes" },
    ],
  },
  {
    titulo: "Horarios",
    icono: "🕐",
    color: "#0369a1",
    links: [
      { label: "Creador Horario",              to: "/horarios" },
      { label: "Horario Maestro",              to: "/horario-maestro" },
      { label: "Horario de Docente",           to: "/mi-horario" },
      { label: "Consulta de Horarios",         to: "/consulta-horarios" },
      { label: "Parámetros Institución",       to: "/bloques-horarios" },
      { label: "Eventos Institucionales",      to: "/bloques-horarios?tab=eventos" },
    ],
  },
  {
    titulo: "Citaciones",
    icono: "📨",
    color: "#b45309",
    links: [
      { label: "Citaciones",              to: "/citaciones" },
      { label: "Historial de Citaciones", to: "/citaciones/historial" },
    ],
  },
];

const ACCESOS_RAPIDOS_ADMIN = [
  { label: "Gestión de Usuarios",        to: "/usuarios" },
  { label: "Gestión de Administradores", to: "/administradores", superAdmin: true },
  { label: "Registrar Administrador",    to: "/registrar-admin", superAdmin: true },
  { label: "Registrar Docente",          to: "/registrar-docente" },
  { label: "Registrar Estudiante",       to: "/registrar-estudiante" },
  { label: "Plan Educativo",             to: "/plan-educativo" },
  { label: "Creador Horario",            to: "/horarios" },
  { label: "Horario Maestro",            to: "/horario-maestro" },
  { label: "Eventos Institucionales",    to: "/bloques-horarios?tab=eventos" },
  { label: "Citaciones",                 to: "/citaciones" },
];

function DashboardAdmin({ esSuperAdmin }) {
  const [stats, setStats] = useState({
    usuarios: 0, docentes: 0, apoderados: 0,
    estudiantes: 0, cursos: 0, citaciones: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard/stats")
      .then((r) => {
        if (!r || !r.ok) throw new Error();
        return r.json();
      })
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const visible = (link) => esSuperAdmin || !link.superAdmin;

  if (loading) return <h2>Cargando dashboard...</h2>;

  return (
    <div className="dashboard-container">
      <h1>Dashboard SIGAE</h1>
      <p>
        Bienvenido al Sistema de Gestión Académica Escolar
        {esSuperAdmin ? " — Super Administrador" : " — Administrador"}
      </p>

      <div className="dashboard-cards">
        <div className="card"><h3>Usuarios</h3><p>{stats.usuarios}</p></div>
        <div className="card"><h3>Docentes</h3><p>{stats.docentes}</p></div>
        <div className="card"><h3>Apoderados</h3><p>{stats.apoderados}</p></div>
        <div className="card"><h3>Estudiantes</h3><p>{stats.estudiantes}</p></div>
        <div className="card"><h3>Cursos</h3><p>{stats.cursos}</p></div>
        <div className="card"><h3>Citaciones</h3><p>{stats.citaciones}</p></div>
      </div>

      <div className="quick-actions">
        <h2>Accesos Rápidos</h2>
        <div className="actions-grid">
          {ACCESOS_RAPIDOS_ADMIN.filter(visible).map((link) => (
            <Link key={link.to} to={link.to}>{link.label}</Link>
          ))}
        </div>
      </div>

      {/* ── Navegación por secciones ── */}
      <div className="nav-sections">
        <h2>Módulos del sistema</h2>
        <div className="nav-sections-grid">
          {MODULOS_ADMIN.map((modulo) => (
            <NavGroup
              key={modulo.titulo}
              titulo={modulo.titulo}
              icono={modulo.icono}
              color={modulo.color}
              links={modulo.links.filter(visible)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Resumen de citaciones y mensajes (Docente / Apoderado) ── */
// Fig. 4.5.2: citaciones próximas (fecha, tramo y estado) y mensajes sin leer
const MAX_PROXIMAS = 5;

function ResumenComunicaciones({ rol }) {
  const [proximas, setProximas] = useState([]);
  const [noLeidos, setNoLeidos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    Promise.allSettled([getCitaciones(rol), getConversaciones(rol)])
      .then(([cit, conv]) => {
        if (!activo) return;
        if (cit.status === "fulfilled") {
          const lista = Array.isArray(cit.value) ? cit.value : cit.value?.citaciones || [];
          const hoy = hoyISO();
          setProximas(
            lista
              .filter((c) => fechaISO(c.Citacion_Fecha) >= hoy && !esCancelada(c))
              .slice(0, MAX_PROXIMAS)
          );
        }
        if (conv.status === "fulfilled" && Array.isArray(conv.value)) {
          setNoLeidos(conv.value.reduce((total, c) => total + (Number(c.No_Leidos) || 0), 0));
        }
        if (cit.status === "rejected" || conv.status === "rejected") {
          setError("No fue posible cargar parte del resumen");
        }
      })
      .finally(() => activo && setLoading(false));
    return () => { activo = false; };
  }, [rol]);

  return (
    <div className="quick-actions">
      <h2>Citaciones y mensajes</h2>
      {loading ? (
        <p>Cargando resumen...</p>
      ) : (
        <>
          {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
          <div className="dashboard-cards">
            <Link to="/mensajes" className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h3>Mensajes sin leer</h3>
              <p>{noLeidos}</p>
            </Link>
            <Link to="/citaciones" className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h3>Citaciones próximas</h3>
              <p>{proximas.length}</p>
            </Link>
          </div>
          {proximas.length === 0 ? (
            <p>No tienes citaciones próximas.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {proximas.map((c) => (
                <li
                  key={c.Citacion_Id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem",
                    padding: "0.6rem 0.8rem", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {formatearFecha(c.Citacion_Fecha, { corta: true })} · {c.Citacion_Tramo_Horario}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                      {c.Estudiante_Nombre_Completo}
                      {rol === "Apoderado" ? ` — ${c.Docente_Nombre}` : ` — ${c.Apoderado_Nombre}`}
                    </div>
                  </div>
                  <EstadoCitacionBadge citacion={c} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* ── Asignaturas por curso (Docente) ─────────────── */
const bloquesActivos = (a) => a.bloques.filter((b) => b.estado === "Activo").length;
const formatearBloques = (n) => `${n} ${n === 1 ? "bloque" : "bloques"}`;

// Cada tarjeta abre Mis Cursos solo si esa vista está habilitada
const TarjetaCurso = MOSTRAR_MIS_CURSOS ? Link : "div";

function AsignaturasPorCurso({ docenteId }) {
  const [cursos, setCursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    getAsignacionesDocente(docenteId)
      .then((data) => {
        if (!activo) return;
        const lista = Array.isArray(data) ? data : data?.asignaciones || [];
        const porCurso = new Map();
        for (const a of lista) {
          if (!porCurso.has(a.cursoId)) {
            porCurso.set(a.cursoId, { cursoId: a.cursoId, curso: a.curso, nivel: a.nivelEducativo, asignaturas: [], bloques: 0 });
          }
          const c = porCurso.get(a.cursoId);
          c.asignaturas.push(a);
          c.bloques += bloquesActivos(a);
        }
        setCursos([...porCurso.values()]);
      })
      .catch(() => activo && setError("No fue posible cargar tus asignaturas"))
      .finally(() => activo && setLoading(false));
    return () => { activo = false; };
  }, [docenteId]);

  return (
    <div className="quick-actions">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h2>Mis asignaturas por curso</h2>
        {MOSTRAR_MIS_CURSOS && cursos.length > 0 && <Link to="/mis-cursos">Ver Mis Cursos →</Link>}
      </div>

      {loading && <p>Cargando asignaturas...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {!loading && !error && cursos.length === 0 && <p>No tienes asignaturas asignadas.</p>}

      {cursos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {cursos.map((c) => (
            <TarjetaCurso
              key={c.cursoId}
              {...(MOSTRAR_MIS_CURSOS && { to: `/mis-cursos?curso=${c.cursoId}` })}
              style={{
                display: "block", textDecoration: "none", color: "inherit",
                background: "#fff", borderRadius: 12, padding: "1rem 1.1rem",
                border: "1px solid #e5e7eb", borderTop: "4px solid #2563eb",
                boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: "#1e3a5f", fontSize: "1.05rem" }}>{c.curso}</strong>
                <span style={{ color: "#2563eb", fontWeight: 700, whiteSpace: "nowrap" }}>{formatearBloques(c.bloques)}/sem</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.6rem" }}>{c.nivel}</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {c.asignaturas.map((a) => (
                  <li key={a.asignaturaId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.88rem" }}>
                    <span style={{ color: a.estadoVigencia === "Activo" ? "#334155" : "#9ca3af" }}>
                      {a.asignatura}
                      {a.estadoVigencia !== "Activo" && " (suspendida)"}
                    </span>
                    <span style={{ color: "#6b7280", whiteSpace: "nowrap" }}>{formatearBloques(bloquesActivos(a))}</span>
                  </li>
                ))}
              </ul>
            </TarjetaCurso>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Dashboard de Docente ──────────────────────────── */
function DashboardDocente({ nombre, docenteId }) {
  return (
    <div className="dashboard-container">
      <h1>Bienvenido, {nombre}</h1>
      <p>Panel del Docente — SIGAE</p>

      <div className="quick-actions">
        <h2>Accesos Rápidos</h2>
        <div className="actions-grid">
          {MOSTRAR_MIS_CURSOS && <Link to="/mis-cursos">Mis Cursos</Link>}
          <Link to="/mi-horario">Mi Horario</Link>
          <Link to="/estudiantes">Estudiantes</Link>
          <Link to="/citaciones">Mis Citaciones</Link>
          <Link to="/mensajes">Mensajes</Link>
          <Link to="/perfil">Mi Perfil</Link>
        </div>
      </div>

      <AsignaturasPorCurso docenteId={docenteId} />

      <ResumenComunicaciones rol="Docente" />
    </div>
  );
}

/* ── Dashboard de Apoderado ────────────────────────── */
function DashboardApoderado({ nombre }) {
  return (
    <div className="dashboard-container">
      <h1>Bienvenido, {nombre}</h1>
      <p>Panel del Apoderado — SIGAE</p>

      <div className="quick-actions">
        <h2>Accesos Rápidos</h2>
        <div className="actions-grid">
          <Link to="/horario-alumno">Horario del Alumno</Link>
          <Link to="/citaciones">Mis Citaciones</Link>
          <Link to="/mensajes">Mensajes</Link>
          <Link to="/perfil">Mi Perfil</Link>
        </div>
      </div>

      <ResumenComunicaciones rol="Apoderado" />
    </div>
  );
}

/* ── Componente principal ──────────────────────────── */
function Dashboard() {
  const { usuario, rolActivo } = useAuth();

  const rolEfectivo = rolActivo || usuario?.roles?.[0];
  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const esAdmin =
    rolEfectivo === "Administrador" ||
    esSuperAdmin ||
    usuario?.roles?.includes("Administrador");
  const esDocente  = rolEfectivo === "Docente";
  const esApoderado = rolEfectivo === "Apoderado";

  if (esAdmin)     return <DashboardAdmin esSuperAdmin={esSuperAdmin} />;
  if (esDocente)   return <DashboardDocente nombre={usuario?.nombre} docenteId={usuario?.id} />;
  if (esApoderado) return <DashboardApoderado nombre={usuario?.nombre} />;

  return (
    <div className="dashboard-container">
      <h1>Dashboard SIGAE</h1>
      <p>Bienvenido al Sistema de Gestión Académica Escolar</p>
    </div>
  );
}

export default Dashboard;

