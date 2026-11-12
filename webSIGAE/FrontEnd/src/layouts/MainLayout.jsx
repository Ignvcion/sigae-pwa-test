import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../pages/context/AuthContext";
import { MOSTRAR_MIS_CURSOS } from "../config/funcionalidades";
import { etiquetaRol, enlacesUTP, tieneUTPActiva } from "../utils/permisos";

function MainLayout() {
  const { usuario, rolActivo, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Sidebar responsiva: en pantallas angostas se comporta como panel deslizable
  // La sidebar móvil queda abierta solo en la página donde se abrió: al navegar a otra
  // se cierra sola (se deriva de la ruta, sin un efecto que cambie el estado).
  const [sidebarAbiertaEn, setSidebarAbiertaEn] = useState(null);
  const sidebarMovilAbierta = sidebarAbiertaEn === location.pathname;
  const setSidebarMovilAbierta = (abierta) => setSidebarAbiertaEn(abierta ? location.pathname : null);

  // Estados para los dropdowns
  const [gestionAbierto, setGestionAbierto] = useState(false);
  const [registrarAbierto, setRegistrarAbierto] = useState(false);
  const [gestionAcademicaAbierto, setGestionAcademicaAbierto] = useState(false);

  const rolEfectivo = rolActivo || usuario?.roles?.[0];
  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const esAdmin =
    rolEfectivo === "Administrador" ||
    esSuperAdmin ||
    usuario?.roles?.includes("Administrador");
  const esDocente = rolEfectivo === "Docente";
  const esApoderado = rolEfectivo === "Apoderado";
  // Etiqueta UTP: administrador con UTP (solo estas funciones) o docente con UTP (las suma)
  const conUTP = tieneUTPActiva(usuario, rolActivo);

  const confirmarCierre = async () => {
    if (!window.confirm("¿Estás seguro de que deseas cerrar tu sesión?")) return;
    await logout();
    navigate("/");
  };

  return (
    <div className="layout">
      {/* BARRA SUPERIOR MÓVIL — solo visible en pantallas angostas */}
      <header className="mobile-topbar">
        <button
          className="mobile-menu-toggle"
          onClick={() => setSidebarMovilAbierta(true)}
          aria-label="Abrir menú"
        >
          ☰
        </button>

        <img
          src="/logo-colegio.png"
          alt="Logo Colegio Jacques Cousteau"
          className="mobile-topbar-logo"
        />
      </header>

      {/* Fondo oscuro al abrir la sidebar en móvil */}
      {sidebarMovilAbierta && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarMovilAbierta(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`sidebar ${
          sidebarMovilAbierta ? "sidebar-abierta" : ""
        }`}
      >
        <button
          className="sidebar-close"
          onClick={() => setSidebarMovilAbierta(false)}
          aria-label="Cerrar menú"
        >
          ✕
        </button>

        <div>
          <div className="logo-row">
            <img
              src="/logo-colegio.png"
              alt="Logo Colegio Jacques Cousteau"
              className="sidebar-logo-img"
            />
          </div>

          {usuario && (
            <div className="sidebar-user-info">
              <div className="nombre">
                {usuario.nombre ||
                  usuario.Usuario_Nombre_Completo ||
                  "Usuario"}
              </div>

              <div className="rol-badge">
                {rolEfectivo ? etiquetaRol(rolEfectivo, usuario) : "Usuario"}
              </div>
            </div>
          )}

          <nav className="menu">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/perfil">Mi Perfil</Link>

            {esAdmin && (
              <>
                <span className="menu-section">Administración</span>

                {/* Dropdown: Gestión Usuarios, Roles y Apoderados */}
                <div className="menu-item-dropdown">
                  <button
                    className="dropdown-toggle"
                    onClick={() => setGestionAbierto(!gestionAbierto)}
                  >
                    Gestión Usuarios

                    <span
                      className={`dropdown-arrow ${
                        gestionAbierto ? "open" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>

                  {gestionAbierto && (
                    <div className="submenu">
                      <Link to="/usuarios">
                        Gestión de Usuarios
                      </Link>

                      <Link to="/buscar-usuarios">
                        Buscar Usuarios
                      </Link>

                      {esSuperAdmin && (
                        <Link to="/administradores">
                          Gestión de Administradores
                        </Link>
                      )}

                      {esSuperAdmin && (
                        <Link to="/gestion-roles">
                          Gestión de Roles
                        </Link>
                      )}

                      <Link to="/docentes">
                        Gestión de Docentes
                      </Link>

                      <Link to="/apoderados">
                        Gestión de Apoderados
                      </Link>
                    </div>
                  )}
                </div>

                {/* Dropdown: Registrar Usuario */}
                <div className="menu-item-dropdown">
                  <button
                    className="dropdown-toggle"
                    onClick={() =>
                      setRegistrarAbierto(!registrarAbierto)
                    }
                  >
                    Registrar Usuario

                    <span
                      className={`dropdown-arrow ${
                        registrarAbierto ? "open" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>

                  {registrarAbierto && (
                    <div className="submenu">
                      {esSuperAdmin && (
                        <Link to="/registrar-admin">
                          Registrar Admin
                        </Link>
                      )}

                      <Link to="/registrar-docente">
                        Registrar Docente
                      </Link>

                      <Link to="/registrar-apoderado">
                        Registrar Apoderado
                      </Link>
                    </div>
                  )}
                </div>

                {/* Dropdown: Gestión Académica */}
                <div className="menu-item-dropdown">
                  <button
                    className="dropdown-toggle"
                    onClick={() =>
                      setGestionAcademicaAbierto(
                        !gestionAcademicaAbierto
                      )
                    }
                  >
                    Gestión Académica

                    <span
                      className={`dropdown-arrow ${
                        gestionAcademicaAbierto ? "open" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>

                  {gestionAcademicaAbierto && (
                    <div className="submenu">
                      <Link to="/plan-educativo">
                        Plan Educativo
                      </Link>

                      <Link to="/electivos">
                        Electivos 3° y 4° medio
                      </Link>

                      <Link to="/asignaturas">
                        Asignaturas
                      </Link>

                      <Link to="/cursos">
                        Cursos
                      </Link>

                      <Link to="/estudiantes">
                        Estudiantes
                      </Link>

                      <Link to="/horarios">
                        Creador Horario
                      </Link>

                      <Link to="/mi-horario">
                        Horario de Docente
                      </Link>

                      <Link to="/horario-maestro">
                        Horario Maestro
                      </Link>
                      <Link to="/consulta-horarios">
                        Consulta de Horarios
                      </Link>

                      <Link to="/bloques-horarios">
                        Parámetros Institución
                      </Link>

                      <Link to="/registrar-estudiante">
                        Registrar Estudiante
                      </Link>

                      <Link to="/situacion-final">
                        Situación Final y Promoción
                      </Link>

                      <Link to="/cierre-periodo">
                        Cierre de Período
                      </Link>
                    </div>
                  )}
                </div>

                <Link to="/citaciones">Citaciones</Link>

                <Link to="/calendario-evaluaciones">Calendario de Evaluaciones</Link>

                <Link to="/citaciones/historial">
                  Historial de Citaciones
                </Link>
              </>
            )}

            {esDocente && (
              <>
                <span className="menu-section">
                  Docente
                </span>

                {MOSTRAR_MIS_CURSOS && (
                  <Link to="/mis-cursos">
                    Mis Cursos
                  </Link>
                )}

                <Link to="/estudiantes">
                  Estudiantes
                </Link>

                <Link to="/mi-horario">
                  Mi Horario
                </Link>

                {/* RF61: el profesor jefe registra la situación final de sus cursos */}
                <Link to="/situacion-final">
                  Situación Final
                </Link>

                <Link to="/citaciones">
                  Citaciones
                </Link>

                <Link to="/calendario-evaluaciones">
                  Calendario de Evaluaciones
                </Link>

                <Link to="/citaciones/historial">
                  Historial de Citaciones
                </Link>

                <Link to="/mensajes">
                  Mensajes
                </Link>
              </>
            )}

            {conUTP && (
              <>
                <span className="menu-section">
                  UTP
                </span>

                {enlacesUTP(usuario, rolActivo).map((enlace) => (
                  <Link key={enlace.to} to={enlace.to}>
                    {enlace.label}
                  </Link>
                ))}
              </>
            )}

            {esApoderado && (
              <>
                <span className="menu-section">
                  Apoderado
                </span>

                <Link to="/horario-alumno">
                  Horario del Alumno
                </Link>

                <Link to="/citaciones">
                  Citaciones
                </Link>

                <Link to="/calendario-evaluaciones">
                  Calendario de Evaluaciones
                </Link>

                <Link to="/citaciones/historial">
                  Historial de Citaciones
                </Link>

                <Link to="/mensajes">
                  Mensajes
                </Link>
              </>
            )}
          </nav>
        </div>

        <button
          className="logout-button"
          onClick={confirmarCierre}
        >
          Cerrar Sesión
        </button>
      </aside>

      {/* CONTENIDO */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;