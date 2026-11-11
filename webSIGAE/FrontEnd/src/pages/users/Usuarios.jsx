import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, getUsuariosPorFiltro } from "../../services/api";
import { normalizarTexto } from "../../utils/validaciones";

function Usuarios() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const navigate = useNavigate();

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tras la primera carga, los filtros recargan sin reemplazar la pantalla (no se pierde el foco)
  const [cargado, setCargado] = useState(false);
  const ultimaPeticion = useRef(0);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("Todos");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [mensajeInfo, setMensajeInfo] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  // { usuario, conEleccion: bool, accion: 'cuenta'|'rol', rolAQuitar: string|null, rolesActivos: string[] }
  const [loadingToggle, setLoadingToggle] = useState(false);

  // CU29: listado con filtros avanzados por rol y estado de cuenta, resueltos en el backend
  // Pide el listado; el estado cambia solo al llegar la respuesta (callbacks), así el efecto
  // de montaje no provoca renders en cascada. cargarUsuarios() además limpia los avisos.
  const pedirUsuarios = (rol, estado) => {
    // Si se cambia un filtro antes de que llegue la respuesta anterior, esta se descarta
    const peticion = ++ultimaPeticion.current;
    const vigente = () => peticion === ultimaPeticion.current;
    return getUsuariosPorFiltro({
      rol: rol === "Todos" ? undefined : rol,
      estado: estado === "Todos" ? undefined : (estado === "Activo" ? "1" : "0"),
    })
      .then((data) => {
        if (!vigente()) return;
        if (Array.isArray(data)) {
          setUsuarios(data);
        } else {
          // CU29 - Excepción "Sin coincidencias"
          setUsuarios(data.usuarios || []);
          setMensajeInfo(data.mensaje || "No se encontraron usuarios con esos filtros");
        }
      })
      .catch((error) => {
        if (!vigente()) return;
        // CU29 - Excepción "Filtros fuera de privilegios" o "Problema técnico"
        setErrorCarga(error.message || "Ocurrió un problema técnico");
      })
      .finally(() => {
        if (!vigente()) return;
        setLoading(false);
        setCargado(true);
      });
  };

  const cargarUsuarios = (rol, estado) => {
    setLoading(true);
    setErrorCarga("");
    setMensajeInfo("");
    return pedirUsuarios(rol, estado);
  };

  useEffect(() => {
    pedirUsuarios("Todos", "Todos");
  }, []);

  // Los filtros de rol y estado se aplican al elegirlos (sin botón "Filtrar")
  const cambiarRol = (rol) => {
    setFiltroRol(rol);
    cargarUsuarios(rol, filtroEstado);
  };
  const cambiarEstado = (estado) => {
    setFiltroEstado(estado);
    cargarUsuarios(filtroRol, estado);
  };

  const limpiarFiltros = () => {
    setFiltroRol("Todos");
    setFiltroEstado("Todos");
    setBusqueda("");
    cargarUsuarios("Todos", "Todos");
  };

// CU 21/22: desactivar o reactivar la cuenta, previa confirmación
const cambiarEstadoCuenta = async (u) => {
  const desactivando = !!u.Usuario_Estado_Cuenta;
  const mensaje = desactivando
    ? `¿Desactivar la cuenta de ${u.Usuario_Nombre_Completo}?\n\n` +
      "• El acceso del usuario quedará restringido.\n" +
      "• Todas sus sesiones activas serán invalidadas.\n" +
      "• La información histórica se conservará.\n\n" +
      "Si solo necesitas quitar un rol, usa el módulo Gestión de Roles."
    : `¿Reactivar la cuenta de ${u.Usuario_Nombre_Completo}?\n\n` +
      "• El usuario podrá volver a iniciar sesión.\n" +
      "• Sus permisos serán restaurados según su rol.\n" +
      "• Las sesiones anteriores NO se restauran automáticamente.";
  if (!window.confirm(mensaje)) return;

  setLoadingToggle(true);
  try {
    const res = await apiFetch(`/api/usuarios/${u.Usuario_Id}/estado`, { method: "PUT" });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) alert(data.mensaje || "Error al cambiar estado");
    else cargarUsuarios(filtroRol, filtroEstado);
  } catch (error) {
    console.error(error);
  } finally {
    setLoadingToggle(false);
  }
};

  const getCorreoPrincipal = (u) => {
    return u.Administrador_Correo_Institucional || u.Docente_Correo_Institucional || u.Apoderado_Correo_Natural || "—";
  };

  const getBadgesRoles = (u) => {
    const badges = [];
    if (u.Es_Administrador) {
      if (u.Administrador_Tipo === "Super Admin") {
        badges.push(<span key="sa" className="badge-rol badge-superadmin">Super Admin</span>);
      } else {
        badges.push(<span key="adm" className="badge-rol badge-admin">Administrador</span>);
      }
    }
    if (u.Es_Docente) badges.push(<span key="doc" className="badge-rol badge-docente">Docente</span>);
    if (u.Es_Apoderado) badges.push(<span key="apo" className="badge-rol badge-apoderado">Apoderado</span>);
    return badges.length > 0 ? badges : <span style={{ color: "#94a3b8" }}>Sin roles</span>;
  };

  // El filtro por rol/estado ya lo resuelve el backend (CU29); acá solo queda la búsqueda de texto libre
  const usuariosFiltrados = usuarios.filter((u) => {
    const textoBusqueda = normalizarTexto(busqueda);
    return (
      !busqueda ||
      normalizarTexto(u.Usuario_Nombre_Completo ?? "").includes(textoBusqueda) ||
      normalizarTexto(u.Usuario_RUT ?? "").includes(textoBusqueda) ||
      normalizarTexto(u.Administrador_Correo_Institucional ?? "").includes(textoBusqueda) ||
      normalizarTexto(u.Docente_Correo_Institucional ?? "").includes(textoBusqueda) ||
      normalizarTexto(u.Apoderado_Correo_Natural ?? "").includes(textoBusqueda)
    );
  });

  if (!cargado) {
    return (
      <div className="usuarios-container">
        <p>Cargando usuarios...</p>
      </div>
    );
  }

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Gestión de Usuarios</h1>
        <p>Administra los usuarios del sistema SIGAE</p>
      </div>

      {/* Filtros */}
      <div className="usuarios-filtros usuarios-filtros--en-linea">
        <input
          type="text"
          className="usuarios-search"
          placeholder="Buscar por nombre, RUT o correo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="usuarios-select"
          value={filtroRol}
          onChange={(e) => cambiarRol(e.target.value)}
        >
          <option value="Todos">Todos los roles</option>
          <option value="Administrador">Administrador</option>
          <option value="Docente">Docente</option>
          <option value="Apoderado">Apoderado</option>
        </select>
        <select
          className="usuarios-select"
          value={filtroEstado}
          onChange={(e) => cambiarEstado(e.target.value)}
        >
          <option value="Todos">Todos los estados</option>
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
        <button type="button" className="btn-roles" onClick={limpiarFiltros}>Limpiar</button>
        {loading && <span className="usuarios-actualizando" role="status">Actualizando…</span>}
      </div>

      {/* Tabla */}
      {errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!errorCarga && mensajeInfo && (
        <div className="usuarios-empty">{mensajeInfo}</div>
      )}

      {!errorCarga && !mensajeInfo && usuariosFiltrados.length === 0 ? (
        <div className="usuarios-empty">No se encontraron usuarios</div>
      ) : !errorCarga && !mensajeInfo && (
        <table className="tabla-usuarios">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>RUT</th>
              <th>Roles</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Perfil</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuariosFiltrados.map((u, idx) => {
              const esMismoUsuario = u.Usuario_Id === usuario?.id;
              const esSuperAdminFila = u.Administrador_Tipo === "Super Admin";

              return (
                <tr key={u.Usuario_Id}>
                  <td>{idx + 1}</td>
                  <td>{u.Usuario_Nombre_Completo}</td>
                  <td>{u.Usuario_RUT}</td>
                  <td>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {getBadgesRoles(u)}
                    </div>
                  </td>
                  <td>{getCorreoPrincipal(u)}</td>
                  <td>
                    {u.Usuario_Estado_Cuenta
                      ? <span className="badge-activo">Activo</span>
                      : <span className="badge-inactivo">Inactivo</span>}
                  </td>
                  <td>
                    <button
                    className="btn-roles"
                    onClick={() =>
                      navigate(`/perfil/${u.Usuario_Id}`)
                    }
                    >
                      Ver Perfil
                      </button>
                      </td>
                  <td>
                    <div className="acciones-grupo">
{!esMismoUsuario &&
 !esSuperAdminFila &&
 !(u.Es_Administrador && !esSuperAdmin) && (
  <button
    className={u.Usuario_Estado_Cuenta ? "btn-desactivar" : "btn-reactivar"}
    onClick={() => cambiarEstadoCuenta(u)}
    disabled={loadingToggle}
  >
    {u.Usuario_Estado_Cuenta ? "Desactivar" : "Reactivar"}
  </button>
)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

    </div>
  );
}

export default Usuarios;
