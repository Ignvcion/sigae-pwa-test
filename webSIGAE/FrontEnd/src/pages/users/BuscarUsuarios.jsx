import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { buscarUsuarioExistente } from "../../services/api";

function BuscarUsuarios() {
  const navigate = useNavigate();
  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [mensajeInfo, setMensajeInfo] = useState("");
  const [errorCarga, setErrorCarga] = useState("");

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

  const getCorreoPrincipal = (u) =>
    u.Administrador_Correo_Institucional || u.Docente_Correo_Institucional || u.Apoderado_Correo_Natural || "—";

  // CU28: buscar usuarios por nombre completo, RUT o correo electrónico
  const buscar = async (e) => {
    e.preventDefault();
    setLoading(true);
    setBuscado(true);
    setErrorCarga("");
    setMensajeInfo("");
    try {
      const data = await buscarUsuarioExistente({ rut, nombre, correo });
      if (Array.isArray(data)) {
        setUsuarios(data);
      } else {
        // CU28 - Excepción "Sin coincidencias"
        setUsuarios(data.usuarios || []);
        setMensajeInfo(data.mensaje || "No se encontraron usuarios");
      }
    } catch (error) {
      // CU28 - Excepción "Campos inválidos o incompletos", "Búsqueda fuera de alcance" o "Problema técnico"
      setUsuarios([]);
      setErrorCarga(error.message || "Ocurrió un problema técnico");
    } finally {
      setLoading(false);
    }
  };

  const limpiar = () => {
    setRut("");
    setNombre("");
    setCorreo("");
    setUsuarios([]);
    setMensajeInfo("");
    setErrorCarga("");
    setBuscado(false);
  };

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Buscar Usuarios</h1>
        <p>Busca usuarios registrados por nombre completo, RUT o correo electrónico</p>
      </div>

      <form className="usuarios-filtros" onSubmit={buscar}>
        <input
          type="text"
          className="usuarios-search"
          placeholder="Nombre completo..."
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <input
          type="text"
          className="usuarios-search"
          placeholder="RUT..."
          value={rut}
          onChange={(e) => setRut(e.target.value)}
        />
        <input
          type="text"
          className="usuarios-search"
          placeholder="Correo electrónico..."
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
        <button type="submit" className="btn-roles" disabled={loading}>
          {loading ? "Buscando..." : "Buscar"}
        </button>
        <button type="button" className="btn-roles" onClick={limpiar}>Limpiar</button>
      </form>

      {errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!errorCarga && mensajeInfo && (
        <div className="usuarios-empty">{mensajeInfo}</div>
      )}

      {!errorCarga && !mensajeInfo && buscado && usuarios.length === 0 && !loading && (
        <div className="usuarios-empty">No se encontraron usuarios</div>
      )}

      {!errorCarga && !mensajeInfo && usuarios.length > 0 && (
        <div className="tabla-responsive-container">
        <table className="tabla-usuarios">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>RUT</th>
              <th>Roles</th>
              <th className="col-correo-th">Correo</th>
              <th>Estado</th>
              <th>Perfil</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u, idx) => (
              <tr key={u.Usuario_Id}>
                <td>{idx + 1}</td>
                <td>{u.Usuario_Nombre_Completo}</td>
                <td>{u.Usuario_RUT}</td>
                <td>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {getBadgesRoles(u)}
                  </div>
                </td>
                <td className="col-correo-td correo-celda" title={getCorreoPrincipal(u)}>{getCorreoPrincipal(u)}</td>
                <td>
                  {u.Usuario_Estado_Cuenta
                    ? <span className="badge-activo">Activo</span>
                    : <span className="badge-inactivo">Inactivo</span>}
                </td>
                <td>
                  {/* CU18: seleccionar el usuario cuyo perfil desea visualizar */}
                  <button className="btn-roles" onClick={() => navigate(`/perfil/${u.Usuario_Id}`)}>
                    Ver Perfil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

export default BuscarUsuarios;
