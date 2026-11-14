import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { puedeGestionAcademica } from "../../utils/permisos";
import SelectorColor, { PuntoColor } from "../../components/SelectorColor";
import { colorAleatorio, nombreColor } from "../../utils/colores";
import { fijarColor } from "../../hooks/useColores";
import { apiUrl } from '../../services/api';

// Tramo de la asignatura: solo se usa en planes (cursos, horarios) de niveles de ese tramo
const TRAMOS = [
  { valor: "Kinder", detalle: "Pre-Kinder y Kinder" },
  { valor: "Básica", detalle: "1ero a 6to Básico" },
  { valor: "Media",  detalle: "7mo Básico a 4to Medio" },
];

const BADGE_TRAMO = {
  Kinder: { background: "#fce7f3", color: "#9d174d" },
  Básica: { background: "#dbeafe", color: "#1e40af" },
  Media:  { background: "#ede9fe", color: "#5b21b6" },
};

function BadgeTramo({ valor }) {
  const estilo = BADGE_TRAMO[valor] || { background: "#f1f5f9", color: "#475569" };
  const detalle = TRAMOS.find((t) => t.valor === valor)?.detalle;
  return (
    <span title={detalle} style={{
      ...estilo,
      padding: "2px 10px",
      borderRadius: "999px",
      fontSize: "0.8rem",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {valor}
    </span>
  );
}

function FormAsignatura({ inicial, onGuardar, onCancelar, guardando, error, usados }) {
  const [nombre, setNombre]       = useState(inicial?.nombre    || "");
  const [tramo, setTramo]         = useState(inicial?.tramo || "");
  const [electiva, setElectiva]   = useState(Boolean(inicial?.electiva));
  // Una asignatura nueva parte con un color aleatorio de la paleta (entre los menos usados)
  const [color, setColor]         = useState(() => inicial?.color || colorAleatorio(usados));

  const handleSubmit = (e) => {
    e.preventDefault();
    onGuardar({ nombre, tramo, electiva, color });
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

      <label style={{ marginTop: "0.9rem" }}>Tramo *</label>
      <select
        value={tramo}
        onChange={(e) => setTramo(e.target.value)}
        disabled={electiva}
        required
      >
        <option value="">Seleccionar tramo...</option>
        {TRAMOS.map((t) => (
          <option key={t.valor} value={t.valor}>{t.valor} ({t.detalle})</option>
        ))}
      </select>
      <span style={{ display: "block", fontSize: "0.8rem", color: "#64748b", marginTop: 4 }}>
        La asignatura solo podrá incluirse en planes de niveles de este tramo.
        {inicial && " Si ya se usa en planes, cursos u horarios, su tramo no se puede cambiar."}
      </span>

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
          onChange={(e) => {
            setElectiva(e.target.checked);
            // Los electivos son de 3° y 4° medio: tramo Media
            if (e.target.checked) setTramo("Media");
          }}
          style={{ width: "auto", marginTop: 3 }}
        />
        <span>
          <strong>Asignatura electiva de 3° y 4° medio</strong>
          <span style={{ display: "block", fontSize: "0.8rem", color: "#64748b" }}>
            Solo se incluye en el plan de electivos; no entra en planes educativos ni se asocia a cursos. Siempre del tramo Media.
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
  const { usuario, rolActivo } = useAuth();
  const token = localStorage.getItem("token");

  const [asignaturas, setAsignaturas] = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando]       = useState(null); // { id, nombre, tramo, electiva, color }
  const [filtroTramo, setFiltroTramo] = useState("");
  const [guardando, setGuardando]     = useState(false);
  const [error, setError]             = useState("");
  const [exito, setExito]             = useState("");
  const [busqueda, setBusqueda]       = useState("");

  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const esAdmin = esSuperAdmin || puedeGestionAcademica(usuario, rolActivo); // también la etiqueta UTP

  // Pide las asignaturas y actualiza el estado solo al llegar la respuesta (en callbacks),
  // así puede llamarse desde el efecto de montaje. `cargando` parte en true; recargar()
  // lo vuelve a encender antes de pedir de nuevo.
  const cargar = () =>
    fetch(apiUrl("/api/planes/asignaturas"), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setAsignaturas(data);
        else setError(data.error || "Error al cargar asignaturas");
      })
      .catch(() => setError("Error al conectar con el servidor"))
      .finally(() => setCargando(false));

  const recargar = () => {
    setCargando(true);
    return cargar();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- carga una sola vez al montar
  useEffect(() => { cargar(); }, []);

  const mostrarExito = (msg) => {
    setExito(msg);
    setTimeout(() => setExito(""), 4000);
  };

  const handleCrear = async ({ nombre, tramo, electiva, color }) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/planes/asignaturas"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre, tramo, electiva, color }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fijarColor("asignaturas", data.asignatura_id, data.color);
      mostrarExito(data.mensaje);
      setMostrarForm(false);
      recargar();
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = async ({ nombre, tramo, electiva, color }) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(apiUrl(`/api/planes/asignaturas/${editando.id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre, tramo, electiva, color }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fijarColor("asignaturas", editando.id, color);
      mostrarExito(data.mensaje);
      setEditando(null);
      recargar();
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
      const res = await fetch(apiUrl(`/api/colores/asignaturas/${a.Asignatura_Id}`), {
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
      tramo: a.Asignatura_Tramo,
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
    (filtroTramo === "" || a.Asignatura_Tramo === filtroTramo) &&
    (busqueda.trim() === "" || a.Asignatura_Nombre.toLowerCase().includes(busqueda.toLowerCase()))
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
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ maxWidth: "360px" }}
            />
            <select
              value={filtroTramo}
              onChange={(e) => setFiltroTramo(e.target.value)}
              aria-label="Filtrar por tramo"
              style={{ maxWidth: "220px" }}
            >
              <option value="">Todos los tramos</option>
              {TRAMOS.map((t) => <option key={t.valor} value={t.valor}>{t.valor}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Tabla */}
      {filtradas.length === 0 ? (
        <div className="empty-state">
          <p>{asignaturas.length === 0 ? "No hay asignaturas registradas aún." : "Sin resultados para la búsqueda o el tramo elegido."}</p>
        </div>
      ) : (
        <table className="tabla-asignaturas">
          <thead>
            <tr>
              <th>#</th>
              <th>Color</th>
              <th>Nombre</th>
              <th>Tramo</th>
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
                <td><BadgeTramo valor={a.Asignatura_Tramo} /></td>
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
        {filtradas.length} asignatura{filtradas.length !== 1 ? "s" : ""}{busqueda || filtroTramo ? " encontradas" : " registradas"}
      </p>
    </div>
  );
}

export default Asignaturas;
