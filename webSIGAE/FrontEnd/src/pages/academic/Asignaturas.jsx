import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import SelectorColor, { PuntoColor } from "../../components/SelectorColor";
import { colorAleatorio, nombreColor } from "../../utils/colores";
import { fijarColor } from "../../hooks/useColores";

const PRIORIDADES = ["Alta", "Media", "Baja"];

const BADGE_PRIORIDAD = {
  Alta:  { background: "#fee2e2", color: "#b91c1c" },
  Media: { background: "#fef3c7", color: "#92400e" },
  Baja:  { background: "#dcfce7", color: "#15803d" },
};

function BadgePrioridad({ valor }) {
  const estilo = BADGE_PRIORIDAD[valor] || { background: "#f1f5f9", color: "#475569" };
  return (
    <span style={{
      ...estilo,
      padding: "2px 10px",
      borderRadius: "999px",
      fontSize: "0.8rem",
      fontWeight: 600,
    }}>
      {valor}
    </span>
  );
}

function FormAsignatura({ inicial, onGuardar, onCancelar, guardando, error, usados }) {
  const [nombre, setNombre]       = useState(inicial?.nombre    || "");
  const [prioridad, setPrioridad] = useState(inicial?.prioridad || "");
  const [electiva, setElectiva]   = useState(Boolean(inicial?.electiva));
  // Una asignatura nueva parte con un color aleatorio de la paleta (entre los menos usados)
  const [color, setColor]         = useState(() => inicial?.color || colorAleatorio(usados));

  const handleSubmit = (e) => {
    e.preventDefault();
    onGuardar({ nombre, prioridad, electiva, color });
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

      <label style={{ marginTop: "0.9rem" }}>Color en los horarios</label>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <SelectorColor value={color} onChange={setColor} usados={usados} etiqueta="Color de la asignatura" mostrarHex />
        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
          {nombreColor(color)}{inicial ? "" : " · asignado al azar, puedes cambiarlo"}
        </span>
      </div>

      {/* CU47 / RF28: las electivas solo van en el plan de electivos de 3° y 4° medio */}
      <label style={{ marginTop: "0.9rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", fontWeight: 400 }}>
        <input
          type="checkbox"
          checked={electiva}
          onChange={(e) => setElectiva(e.target.checked)}
          style={{ width: "auto", marginTop: 3 }}
        />
        <span>
          <strong>Asignatura electiva de 3° y 4° medio</strong>
          <span style={{ display: "block", fontSize: "0.8rem", color: "#64748b" }}>
            Solo se incluye en el plan de electivos; no entra en planes educativos ni se asocia a cursos.
          </span>
        </span>
      </label>

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
  const { usuario } = useAuth();
  const token = localStorage.getItem("token");

  const [asignaturas, setAsignaturas] = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando]       = useState(null); // { id, nombre, prioridad }
  const [guardando, setGuardando]     = useState(false);
  const [error, setError]             = useState("");
  const [exito, setExito]             = useState("");
  const [busqueda, setBusqueda]       = useState("");

  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const esAdmin = esSuperAdmin || usuario?.roles?.includes("Administrador");

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

  const handleCrear = async ({ nombre, prioridad, electiva, color }) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/planes/asignaturas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre, prioridad, electiva, color }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fijarColor("asignaturas", data.asignatura_id, data.color);
      mostrarExito(data.mensaje);
      setMostrarForm(false);
      cargar();
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = async ({ nombre, prioridad, electiva, color }) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`/api/planes/asignaturas/${editando.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre, prioridad, electiva, color }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fijarColor("asignaturas", editando.id, color);
      mostrarExito(data.mensaje);
      setEditando(null);
      cargar();
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  };

  // Cambio rápido del color desde la tabla (se guarda al cerrar el selector)
  const cambiarColor = async (a, color) => {
    const anterior = a.Asignatura_Color;
    setAsignaturas((lista) => lista.map((x) => (x.Asignatura_Id === a.Asignatura_Id ? { ...x, Asignatura_Color: color } : x)));
    setError("");
    try {
      const res = await fetch(`/api/colores/asignaturas/${a.Asignatura_Id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ color }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No fue posible guardar el color");
      fijarColor("asignaturas", a.Asignatura_Id, data.color);
      mostrarExito(`Color de "${a.Asignatura_Nombre}" actualizado`);
    } catch (err) {
      setAsignaturas((lista) => lista.map((x) => (x.Asignatura_Id === a.Asignatura_Id ? { ...x, Asignatura_Color: anterior } : x)));
      setError(err.message || "No fue posible guardar el color");
    }
  };

  const coloresDeOtras = (id) => asignaturas.filter((a) => a.Asignatura_Id !== id).map((a) => a.Asignatura_Color);

  const abrirEdicion = (a) => {
    setEditando({
      id: a.Asignatura_Id,
      nombre: a.Asignatura_Nombre,
      prioridad: a.Asignatura_Prioridad_Academica,
      electiva: Number(a.Asignatura_Es_Electiva) === 1,
      color: a.Asignatura_Color,
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
      {error && !mostrarForm && !editando && <p className="msg-error">{error}</p>}

      {/* Formulario de creación */}
      {mostrarForm && (
        <div className="form-card">
          <h2>Nueva Asignatura</h2>
          <FormAsignatura
            usados={coloresDeOtras(null)}
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
            key={editando.id}
            usados={coloresDeOtras(editando.id)}
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
        <table className="tabla-asignaturas">
          <thead>
            <tr>
              <th>#</th>
              <th>Color</th>
              <th>Nombre</th>
              <th>Prioridad</th>
              {esAdmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((a, i) => (
              <tr key={a.Asignatura_Id} style={editando?.id === a.Asignatura_Id ? { background: "#eff6ff" } : {}}>
                <td style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{i + 1}</td>
                <td>
                  {esAdmin ? (
                    <SelectorColor
                      value={a.Asignatura_Color}
                      usados={coloresDeOtras(a.Asignatura_Id)}
                      onChange={(color) => cambiarColor(a, color)}
                      etiqueta={`Color de ${a.Asignatura_Nombre}`}
                      diferido
                    />
                  ) : (
                    <PuntoColor color={a.Asignatura_Color} titulo={nombreColor(a.Asignatura_Color)} />
                  )}
                </td>
                <td style={{ fontWeight: 500 }}>
                  {a.Asignatura_Nombre}
                  {Number(a.Asignatura_Es_Electiva) === 1 && (
                    <span className="badge-electiva" title="Electiva de 3° y 4° medio: va en el plan de electivos">Electiva</span>
                  )}
                </td>
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
      )}

      <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#94a3b8" }}>
        {filtradas.length} asignatura{filtradas.length !== 1 ? "s" : ""}{busqueda ? " encontradas" : " registradas"}
      </p>
    </div>
  );
}

export default Asignaturas;
