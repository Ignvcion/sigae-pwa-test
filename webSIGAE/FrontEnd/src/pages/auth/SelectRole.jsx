import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Descripción de cada perfil para ayudar a elegir con cuál ingresar
const INFO_ROLES = {
  Administrador: { icono: "🛡️", detalle: "Usuarios, cursos, planes y horarios" },
  Docente:       { icono: "📚", detalle: "Tus clases, horario, citaciones y mensajes" },
  Apoderado:     { icono: "👪", detalle: "Horario de tus alumnos, citaciones y mensajes" },
};

function SelectRole() {

  const navigate = useNavigate();

  const {
    usuario,
    seleccionarRol,
  } = useAuth();

  const handleSelectRole = (rol) => {

    seleccionarRol(rol);

    navigate("/dashboard");
  };

  if (!usuario) {

    return <div className="select-role-container"><p>Cargando...</p></div>;
  }

  return (

    <div className="select-role-container">

      <div className="select-role-card">

        <img src={`${import.meta.env.BASE_URL}logo-colegio.png`} alt="Logo Colegio Jacques Cousteau" className="select-role-logo" />

        <h1>Seleccionar perfil</h1>

        <p className="select-role-saludo">
          Bienvenido(a), <strong>{usuario.nombre}</strong>.<br />
          ¿Con qué perfil quieres ingresar?
        </p>

        <div className="roles-container">

          {(usuario?.roles || []).map((rol) => {

            const info = INFO_ROLES[rol] || { icono: "👤", detalle: "" };

            return (

              <button
                key={rol}
                type="button"
                className="role-button"
                onClick={() =>
                  handleSelectRole(rol)
                }
              >
                <span className="role-button-icono" aria-hidden="true">{info.icono}</span>
                <span className="role-button-texto">
                  <strong>{rol}</strong>
                  {info.detalle && <small>{info.detalle}</small>}
                </span>
                <span className="role-button-flecha" aria-hidden="true">→</span>
              </button>

            );
          })}

        </div>

      </div>

    </div>
  );
}

export default SelectRole;
