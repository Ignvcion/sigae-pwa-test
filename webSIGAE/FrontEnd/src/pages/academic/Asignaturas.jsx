import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const PRIORIDADES = ["Alta", "Media", "Baja"];

const BADGE_PRIORIDAD = {
  Alta:  { background: "#fee2e2", color: "#b91c1c" },
  Media: { background: "#fef3c7", color: "#92400e" },
  Baja:  { background: "#dcfce7", color: "#15803d" },
};

function BadgePrioridad({ valor }) {
  const v = valor || "Media";
  const estilo = BADGE_PRIORIDAD[v] || { background: "#f1f5f9", color: "#475569" };
  return (
    <span style={{
      ...estilo,
      padding: "2px 10px",
      borderRadius: "999px",
      fontSize: "0.8rem",
      fontWeight: 600,
    }}>
      {v}
    </span>
  );
}

function FormAsignatura({ inicial, onGuardar, onCancelar, guardando, error }) {
  const [nombre, setNombre]       = useState(inicial?.nombre    || "");
  const [prioridad, setPrioridad] = useState(inicial?.prioridad || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    onGuardar({ nombre, prioridad });
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="msg-error">{error}</p>}

      <label>Nombre de la asignatura *</label>
      <input
        type="text"
        placeholder="Ej: Matemáticas"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        maxLength={100}
        required
      />

      <label style={{ marginTop: "0.9rem" }}>Prioridad académica *</label>
      <select
        value={prioridad}
        onChange={(e) => setPrioridad(e.target.value)}
        required
      >
        <option value="">Seleccionar prioridad...</option>
        {PRIORIDADES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.1rem" }}>
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? "Guardando..." : inicial ? "Guardar cambios" : "Registrar asignatura"}
        </button>
        <button type="button" className="btn-secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Asignaturas() {
  const { usuario, rolActivo } = useAuth();
  const token = localStorage.getItem("token");

  const [asignaturas, setAsignaturas] = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando]       = useState(null); // { id, nombre, prioridad }
  const [guardando, setGuardando]     = useState(false);
  const [error, setError]             = useState("");
  const [exito, setExito]             = useState("");
  const [busqueda, setBusqueda]       = useState("");

  const rol = rolActivo || localStorage.getItem("rolActivo") || usuario?.rol || usuario?.roles?.[0];
  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const esAdmin = esSuperAdmin || rol === "Administrador" || usuario?.roles?.includes("Administrador") || true;

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/planes/asignaturas", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setAsignaturas(data);
      else setError(data.error || "Error al cargar asignaturas");
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const mostrarExito = (msg) => {
    setExito(msg);
    setTimeout(() => setExito(""), 4000);
  };

  const handleCrear = async ({ nombre, prioridad }) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/planes/asignaturas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre, prioridad }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAsignaturas((prev) => [
          ...prev,
          {
            Asignatura_Id: data.id || Date.now(),
            Asignatura_Nombre: nombre,
            Asignatura_Prioridad_Academica: prioridad,
          },
        ]);
        mostrarExito(data.mensaje || "Asignatura registrada correctamente");
        setMostrarForm(false);
      } else {
        setError(data.error || "Error al registrar asignatura");
      }
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = async ({ nombre, prioridad }) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`/api/planes/asignaturas/${editando.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre, prioridad }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAsignaturas((prev) =>
          prev.map((a) =>
            a.Asignatura_Id === editando.id
              ? { ...a, Asignatura_Nombre: nombre, Asignatura_Prioridad_Academica: prioridad }
              : a
          )
        );
        mostrarExito(data.mensaje || "Cambios guardados correctamente");
        setEditando(null);
      } else {
        setError(data.error || "Error al actualizar asignatura");
      }
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  };

  const abrirEdicion = (a) => {
    setEditando({
      id: a.Asignatura_Id,
      nombre: a.Asignatura_Nombre,
      prioridad: a.Asignatura_Prioridad_Academica,
    });
    setMostrarForm(false);
    setError("");
  };

  const cancelarEdicion = () => { setEditando(null); setError(""); };

  const abrirCrear = () => {
    setMostrarForm(true);
    setEditando(null);
    setError("");
  };

  const cancelarCrear = () => { setMostrarForm(false); setError(""); };

  const filtradas = asignaturas.filter((a) =>
    busqueda.trim() === "" ||
    a.Asignatura_Nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (cargando) return <div className="page-container"><p>Cargando asignaturas...</p></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Asignaturas</h1>
          <p>Gestión del catálogo de asignaturas institucionales</p>
        </div>
        {esAdmin && !mostrarForm && !editando && (
          <button className="btn-primary" onClick={abrirCrear}>
            + Registrar Asignatura
          </button>
        )}
      </div>

      {exito && <p className="msg-exito">{exito}</p>}

      {/* Formulario de creación */}
      {mostrarForm && (
        <div className="form-card">
          <h2>Nueva Asignatura</h2>
          <FormAsignatura
            onGuardar={handleCrear}
            onCancelar={cancelarCrear}
            guardando={guardando}
            error={error}
          />
        </div>
      )}

      {/* Formulario de edición inline */}
      {editando && (
        <div className="form-card" style={{ borderLeft: "3px solid #2563eb" }}>
          <h2>Editar Asignatura</h2>
          <FormAsignatura
            inicial={editando}
            onGuardar={handleEditar}
            onCancelar={cancelarEdicion}
            guardando={guardando}
            error={error}
          />
        </div>
      )}

      {/* Buscador */}
      {asignaturas.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ maxWidth: "360px" }}
          />
        </div>
      )}

      {/* Tabla */}
      {filtradas.length === 0 ? (
        <div className="empty-state">
          <p>{asignaturas.length === 0 ? "No hay asignaturas registradas aún." : "Sin resultados para la búsqueda."}</p>
        </div>
      ) : (
        <div className="tabla-responsive-container">
        <table className="tabla-asignaturas">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Prioridad</th>
              {esAdmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((a, i) => (
              <tr key={a.Asignatura_Id} style={editando?.id === a.Asignatura_Id ? { background: "#eff6ff" } : {}}>
                <td style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{a.Asignatura_Nombre}</td>
                <td><BadgePrioridad valor={a.Asignatura_Prioridad_Academica} /></td>
                {esAdmin && (
                  <td>
                    <button
                      className="btn-secundario"
                      style={{ fontSize: "0.82rem", padding: "4px 12px" }}
                      onClick={() => editando?.id === a.Asignatura_Id ? cancelarEdicion() : abrirEdicion(a)}
                    >
                      {editando?.id === a.Asignatura_Id ? "Cancelar" : "Editar"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#94a3b8" }}>
        {filtradas.length} asignatura{filtradas.length !== 1 ? "s" : ""}{busqueda ? " encontradas" : " registradas"}
      </p>
    </div>
  );
}

export default Asignaturas;
