import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, getEspecialidades } from "../../services/api";
import EtiquetasInput, { separarEtiquetas } from "../../components/EtiquetasInput";
import {
  normalizarTexto,
  validarCorreoInstitucional,
  validarCorreo,
  validarDireccion,
  DOMINIO_INSTITUCIONAL, TEXTO_DOMINIOS_INSTITUCIONALES,
} from "../../utils/validaciones";

// Columnas de la dirección estructurada ↔ claves que usa validarDireccion
const COLUMNAS_DIRECCION = {
  Usuario_Direccion_Calle : "calle",
  Usuario_Direccion_Numero: "numero",
  Usuario_Direccion_Depto : "depto",
  Usuario_Direccion_Comuna: "comuna",
};

/* ── Badge de roles ─────────────────────────────────── */
function BadgesRol({ u }) {
  const badges = [];
  if (u.Es_Administrador) {
    if (u.Administrador_Tipo === "Super Admin")
      badges.push(<span key="sa" className="badge-rol badge-superadmin">Super Admin</span>);
    else
      badges.push(<span key="adm" className="badge-rol badge-admin">Administrador</span>);
  }
  if (u.Es_Docente)   badges.push(<span key="doc" className="badge-rol badge-docente">Docente</span>);
  if (u.Es_Apoderado) badges.push(<span key="apo" className="badge-rol badge-apoderado">Apoderado</span>);
  return badges.length > 0
    ? <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{badges}</div>
    : <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Sin roles</span>;
}

/* ── Campos específicos por rol ─────────────────────── */
function CamposDocente({ datos, errores, onChange }) {
  const [catalogo, setCatalogo] = useState([]);
  useEffect(() => {
    getEspecialidades().then((d) => setCatalogo((d || []).map((e) => e.Especialidad_Nombre))).catch(() => {});
  }, []);
  return (
    <>
      <div className="campo-pwd">
        <label>Correo institucional</label>
        <input
          name="Docente_Correo_Institucional"
          value={datos.Docente_Correo_Institucional || ""}
          onChange={onChange}
          placeholder={`nombre${DOMINIO_INSTITUCIONAL}`}
          className={errores.Docente_Correo_Institucional ? "input-invalid" : ""}
          required
        />
        {errores.Docente_Correo_Institucional && (
          <span className="input-error-msg">{errores.Docente_Correo_Institucional}</span>
        )}
      </div>
      <div className="campo-pwd">
        <label htmlFor="rol-especialidades">Especialidades</label>
        <EtiquetasInput
          id="rol-especialidades"
          valores={datos.Docente_Especialidades || []}
          opciones={catalogo}
          invalido={!!errores.Docente_Especialidades}
          placeholder="Ej: Matemáticas"
          onChange={(valores) => onChange({ target: { name: "Docente_Especialidades", value: valores } })}
        />
        {errores.Docente_Especialidades && (
          <span className="input-error-msg">{errores.Docente_Especialidades}</span>
        )}
      </div>
      <div className="campo-pwd">
        <label>Carga horaria semanal (hrs)</label>
        <input
          type="number"
          name="Docente_Carga_Horaria_Semanal"
          value={datos.Docente_Carga_Horaria_Semanal || ""}
          onChange={onChange}
          min="1"
          max="44"
          required
        />
      </div>
    </>
  );
}

function CamposAdmin({ datos, errores, onChange, esSuperAdmin }) {
  return (
    <>
      {esSuperAdmin && (
        <div className="campo-pwd">
          <label>Tipo de administrador</label>
          <select
            name="Administrador_Tipo"
            value={datos.Administrador_Tipo || "Administrador Normal"}
            onChange={onChange}
          >
            <option value="Administrador Normal">Administrador Normal</option>
            <option value="Super Admin">Super Admin</option>
          </select>
        </div>
      )}
      <div className="campo-pwd">
        <label>Correo institucional</label>
        <input
          name="Administrador_Correo_Institucional"
          value={datos.Administrador_Correo_Institucional || ""}
          onChange={onChange}
          placeholder={`nombre${DOMINIO_INSTITUCIONAL}`}
          className={errores.Administrador_Correo_Institucional ? "input-invalid" : ""}
          required
        />
        {errores.Administrador_Correo_Institucional && (
          <span className="input-error-msg">{errores.Administrador_Correo_Institucional}</span>
        )}
      </div>
    </>
  );
}

function CamposApoderado({ datos, errores, onChange }) {
  return (
    <>
      <div className="campo-pwd">
        <label>Correo electrónico personal</label>
        <input
          type="email"
          name="Apoderado_Correo_Natural"
          value={datos.Apoderado_Correo_Natural || ""}
          onChange={onChange}
          placeholder="correo@ejemplo.com"
          className={errores.Apoderado_Correo_Natural ? "input-invalid" : ""}
          required
        />
        {errores.Apoderado_Correo_Natural && (
          <span className="input-error-msg">{errores.Apoderado_Correo_Natural}</span>
        )}
      </div>
      {[
        { name: "Usuario_Direccion_Calle",  label: "Calle",                  placeholder: "Ej: Av. Providencia", maxLength: 100, required: true },
        { name: "Usuario_Direccion_Numero", label: "Número",                 placeholder: "Ej: 123",             maxLength: 7,   required: true },
        { name: "Usuario_Direccion_Depto",  label: "Depto./Casa (opcional)", placeholder: "Ej: 45B",             maxLength: 20,  required: false },
        { name: "Usuario_Direccion_Comuna", label: "Comuna",                 placeholder: "Ej: Santiago",        maxLength: 60,  required: true },
      ].map((campo) => (
        <div className="campo-pwd" key={campo.name}>
          <label>{campo.label}</label>
          <input
            name={campo.name}
            value={datos[campo.name] || ""}
            onChange={onChange}
            placeholder={campo.placeholder}
            maxLength={campo.maxLength}
            className={errores[campo.name] ? "input-invalid" : ""}
            required={campo.required}
          />
          {errores[campo.name] && <span className="input-error-msg">{errores[campo.name]}</span>}
        </div>
      ))}
    </>
  );
}

/* ── Página principal ───────────────────────────────── */
function GestionRoles() {
  const { id: idParam } = useParams();
  const { usuario: usuarioLogueado } = useAuth();
  const esSuperAdmin = usuarioLogueado?.administradorTipo === "Super Admin";

  const [busqueda, setBusqueda]                 = useState("");
  const [usuarios, setUsuarios]                 = useState([]);
  const [seleccionado, setSeleccionado]         = useState(null);
  const [rolNuevo, setRolNuevo]                 = useState("");
  const [datosRol, setDatosRol]                 = useState({});
  const [errores, setErrores]                   = useState({});
  const [loadingPage, setLoadingPage]           = useState(true);
  const [loadingEnvio, setLoadingEnvio]         = useState(false);
  const [msgExito, setMsgExito]                 = useState("");
  const [msgError, setMsgError]                 = useState("");
  // Gestión de roles activos (CU 21/22/23/24)
  const [loadingGestion, setLoadingGestion]     = useState(false);
  const [msgGestion, setMsgGestion]             = useState({ tipo: "", texto: "" });

  /* Filtro de búsqueda: se deriva de lo escrito y de la lista (máx. 8 coincidencias) */
  const textoBusqueda = normalizarTexto(busqueda.trim());
  const resultados = textoBusqueda
    ? usuarios
      .filter(u =>
        normalizarTexto(u.Usuario_Nombre_Completo || "").includes(textoBusqueda) ||
        normalizarTexto(u.Usuario_RUT || "").includes(textoBusqueda)
      )
      .slice(0, 8)
    : [];

  // El estado cambia solo al llegar la respuesta (callbacks), así puede llamarse desde el efecto.
  const cargarUsuarios = () =>
    apiFetch("/api/usuarios")
      .then(async (res) => {
        if (!res) return;
        const data = await res.json();
        const lista = Array.isArray(data) ? data : [];
        setUsuarios(lista);
        // Si venimos desde un formulario de registro con id en la URL, preseleccionar
        if (idParam) {
          const u = lista.find(u => u.Usuario_Id === Number(idParam));
          if (u) elegirUsuario(u);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingPage(false));

  const elegirUsuario = (u) => {
    setSeleccionado(u);
    setBusqueda("");
    setRolNuevo("");
    setDatosRol({});
    setErrores({});
    setMsgExito("");
    setMsgError("");
    setMsgGestion({ tipo: "", texto: "" });
  };

  /* Carga inicial */
  useEffect(() => {
    cargarUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga una sola vez al montar
  }, []);

  const refreshSeleccionado = async () => {
    try {
      const res = await apiFetch("/api/usuarios");
      if (!res) return;
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      setUsuarios(lista);
      if (seleccionado) {
        const actualizado = lista.find(u => u.Usuario_Id === seleccionado.Usuario_Id);
        if (actualizado) setSeleccionado(actualizado);
      }
    } catch (e) { console.error(e); }
  };

  // CU 21/22/23/24: confirma con el usuario antes de desactivar un rol o reactivar la cuenta
  const MENSAJES_CONFIRMACION = {
    "desactivar-rol": (rol) =>
      `¿Desactivar el rol ${rol} de ${seleccionado.Usuario_Nombre_Completo}?\n\n` +
      `• El usuario perderá el acceso asociado al rol ${rol}.\n` +
      "• Su cuenta y otros roles permanecerán activos.\n" +
      "• La información histórica se conservará.",
    "reactivar-cuenta": () =>
      `¿Reactivar la cuenta de ${seleccionado.Usuario_Nombre_Completo}?\n\n` +
      "• El usuario podrá volver a iniciar sesión.\n" +
      "• Sus permisos serán restaurados según sus roles asignados.\n" +
      "• Las sesiones anteriores no se restauran automáticamente.",
  };

  const confirmarGestion = async (accion) => {
    if (!seleccionado) return;
    setMsgGestion({ tipo: "", texto: "" });
    if (!window.confirm(MENSAJES_CONFIRMACION[accion.tipo](accion.rol))) return;
    setLoadingGestion(true);
    try {
      if (accion.tipo === "desactivar-rol") {
        const { rol } = accion;
        const body = {
          Es_Administrador: rol === "Administrador" ? 0 : (seleccionado.Es_Administrador ? 1 : 0),
          Es_Docente:       rol === "Docente"       ? 0 : (seleccionado.Es_Docente       ? 1 : 0),
          Es_Apoderado:     rol === "Apoderado"     ? 0 : (seleccionado.Es_Apoderado     ? 1 : 0),
          Administrador_Tipo: rol === "Administrador" ? null : (seleccionado.Administrador_Tipo || null),
        };
        const res = await apiFetch(`/api/usuarios/${seleccionado.Usuario_Id}/roles`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res) return;
        const data = await res.json();
        if (!res.ok) {
          setMsgGestion({ tipo: "error", texto: data.mensaje || "Error al desactivar el rol" });
        } else {
          setMsgGestion({ tipo: "exito", texto: `Rol ${rol} desactivado correctamente.` });
          setRolNuevo("");
          await refreshSeleccionado();
        }
      } else if (accion.tipo === "reactivar-cuenta") {
        const res = await apiFetch(`/api/usuarios/${seleccionado.Usuario_Id}/estado`, { method: "PUT" });
        if (!res) return;
        const data = await res.json();
        if (!res.ok) {
          setMsgGestion({ tipo: "error", texto: data.mensaje || "Error al reactivar la cuenta" });
        } else {
          setMsgGestion({ tipo: "exito", texto: "Cuenta reactivada correctamente." });
          await refreshSeleccionado();
        }
      }
    } catch { setMsgGestion({ tipo: "error", texto: "Error de conexión al servidor" }); }
    finally { setLoadingGestion(false); }
  };

  /* Roles que aún puede recibir este usuario (con exclusividad Admin) */
  const esAdminUser = !!seleccionado?.Es_Administrador;
  const rolesDisponibles = seleccionado
    ? [
        // Docente/Apoderado solo si el usuario NO es Admin
        !esAdminUser && !seleccionado.Es_Docente   && "Docente",
        !esAdminUser && !seleccionado.Es_Apoderado && "Apoderado",
        // Administrador: solo Super Admin puede asignarlo y solo si el usuario no es ya Admin
        esSuperAdmin && !esAdminUser && "Administrador",
      ].filter(Boolean)
    : [];

  /* Validación por campo */
  const validarCampo = (name, value, datos = datosRol) => {
    if (COLUMNAS_DIRECCION[name]) {
      const direccion = Object.fromEntries(
        Object.entries(COLUMNAS_DIRECCION).map(([col, clave]) => [clave, (col === name ? value : datos[col]) || ""])
      );
      return validarDireccion(direccion)[COLUMNAS_DIRECCION[name]] || "";
    }
    if (name === "Docente_Especialidades")
      return value.length === 0 ? "Agrega al menos una especialidad" : "";
    if (!value) return "";
    if (name === "Docente_Correo_Institucional" || name === "Administrador_Correo_Institucional")
      return !validarCorreoInstitucional(value)
        ? `El correo debe pertenecer al dominio ${TEXTO_DOMINIOS_INSTITUCIONALES}`
        : "";
    if (name === "Apoderado_Correo_Natural")
      return !validarCorreo(value) ? "Ingrese un correo electrónico válido" : "";
    return "";
  };

  const handleDatosChange = (e) => {
    const { name, value } = e.target;
    setDatosRol(prev => ({ ...prev, [name]: value }));
    setErrores(prev => ({ ...prev, [name]: validarCampo(name, value) }));
  };

  const handleRolChange = (nuevoRol) => {
    setRolNuevo(nuevoRol);
    setErrores({});
    setMsgExito("");
    setMsgError("");

    if (!seleccionado || !nuevoRol) {
      setDatosRol({});
      return;
    }

    if (nuevoRol === "Docente") {
      setDatosRol({
        Docente_Correo_Institucional: seleccionado.Docente_Correo_Institucional || "",
        Docente_Especialidades:       separarEtiquetas(seleccionado.Docente_Especialidad),
        Docente_Carga_Horaria_Semanal: seleccionado.Docente_Carga_Horaria_Semanal || "",
      });
    } else if (nuevoRol === "Administrador") {
      setDatosRol({
        Administrador_Tipo:                 seleccionado.Administrador_Tipo                 || "Administrador Normal",
        Administrador_Correo_Institucional: seleccionado.Administrador_Correo_Institucional || "",
      });
    } else if (nuevoRol === "Apoderado") {
      setDatosRol({
        Apoderado_Correo_Natural: seleccionado.Apoderado_Correo_Natural || "",
        Usuario_Direccion_Calle:  seleccionado.Usuario_Direccion_Calle  || "",
        Usuario_Direccion_Numero: seleccionado.Usuario_Direccion_Numero || "",
        Usuario_Direccion_Depto:  seleccionado.Usuario_Direccion_Depto  || "",
        Usuario_Direccion_Comuna: seleccionado.Usuario_Direccion_Comuna || "",
      });
    } else {
      setDatosRol({});
    }
  };

  /* Envío del formulario */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!seleccionado || !rolNuevo) return;

    // Validación previa
    const nuevosErrores = {};
    Object.keys(datosRol).forEach(name => {
      const msg = validarCampo(name, datosRol[name]);
      if (msg) nuevosErrores[name] = msg;
    });
    if (Object.keys(nuevosErrores).length > 0) { setErrores(nuevosErrores); return; }

    setLoadingEnvio(true);
    setMsgExito("");
    setMsgError("");

    try {
      const res = await apiFetch(`/api/usuarios/${seleccionado.Usuario_Id}/asignar-rol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol: rolNuevo, ...datosRol }),
      });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) {
        setMsgError(data.mensaje || "Error al asignar el rol");
      } else {
        setMsgExito(`Rol ${rolNuevo} asignado correctamente a ${seleccionado.Usuario_Nombre_Completo}`);
        setSeleccionado(data.usuario);
        setRolNuevo("");
        setDatosRol({});
        cargarUsuarios();
      }
    } catch {
      setMsgError("Error de conexión al servidor");
    } finally {
      setLoadingEnvio(false);
    }
  };

  if (loadingPage) return <div className="page-container"><p>Cargando...</p></div>;

  // Al elegir el rol, sus datos se completan en una tarjeta a la derecha de la principal
  // (debajo en pantallas angostas). Ambas quedan centradas en la página.
  const FORM_ROL_ID = "form-asignar-rol";
  const mostrarPanelRol = Boolean(seleccionado && rolNuevo && rolesDisponibles.length > 0);

  return (
    <div className="page-container">
      <div className={`roles-layout${mostrarPanelRol ? " roles-layout--con-panel" : ""}`}>
      <div className="form-card roles-card">

        <h1>Asignar Rol a Usuario Existente</h1>
        <p style={{ color: "#64748b", marginBottom: "24px" }}>
          Busca un usuario registrado y asígnale un nuevo rol junto con sus datos específicos.
        </p>

        {/* ── Buscador (oculto si venimos con id en URL) ── */}
        {!idParam && (
          <div style={{ position: "relative", marginBottom: "24px" }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>
              Buscar usuario por nombre o RUT
            </label>
            <input
              type="text"
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setSeleccionado(null); }}
              placeholder="Escribe nombre o RUT..."
              style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
            />
            {resultados.length > 0 && (
              <ul style={{
                position: "absolute", zIndex: 100, background: "#fff",
                border: "1px solid #e2e8f0", borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                width: "100%", margin: 0, padding: 0, listStyle: "none",
                maxHeight: "260px", overflowY: "auto",
              }}>
                {resultados.map(u => (
                  <li
                    key={u.Usuario_Id}
                    onMouseDown={() => elegirUsuario(u)}
                    style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <span>
                      <strong>{u.Usuario_Nombre_Completo}</strong>
                      <span style={{ color: "#64748b", marginLeft: "8px", fontSize: "0.88rem" }}>
                        {u.Usuario_RUT}
                      </span>
                    </span>
                    <BadgesRol u={u} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Placeholder vacío ── */}
        {!seleccionado && !busqueda && !idParam && (
          <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px 0", fontStyle: "italic" }}>
            Ingresa el nombre o RUT del usuario para comenzar.
          </p>
        )}

        {/* ── Panel del usuario seleccionado ── */}
        {seleccionado && (
          <div>
            {/* Card informativa */}
            <div style={{
              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px",
              padding: "16px 20px", marginBottom: "24px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "1.05rem", margin: "0 0 2px" }}>
                    {seleccionado.Usuario_Nombre_Completo}
                  </p>
                  <p style={{ color: "#64748b", margin: "0 0 10px", fontSize: "0.88rem" }}>
                    RUT: {seleccionado.Usuario_RUT}
                  </p>
                  <BadgesRol u={seleccionado} />
                </div>
                {!idParam && (
                  <button
                    type="button"
                    className="btn-roles"
                    style={{ fontSize: "0.82rem", padding: "5px 12px", whiteSpace: "nowrap" }}
                    onClick={() => { setSeleccionado(null); setBusqueda(""); }}
                  >
                    Cambiar usuario
                  </button>
                )}
              </div>
            </div>

            {/* Mensajes de éxito / error */}
            {msgExito && <div className="msg-exito" style={{ marginBottom: "16px" }}>{msgExito}</div>}
            {msgError && <div className="msg-error-form" style={{ marginBottom: "16px" }}>{msgError}</div>}

            {/* Formulario de asignación */}
            {rolesDisponibles.length > 0 ? (
              <div className="campo-pwd" style={{ marginBottom: "20px" }}>
                <label htmlFor="rol-a-asignar" style={{ fontWeight: 600 }}>Rol a asignar</label>
                {/* Pertenece al formulario del panel derecho (atributo form): el "required" sigue validándolo */}
                <select
                  id="rol-a-asignar"
                  form={FORM_ROL_ID}
                  value={rolNuevo}
                  onChange={e => handleRolChange(e.target.value)}
                  required
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "6px" }}
                >
                  <option value="">— Seleccione un rol —</option>
                  {rolesDisponibles.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {rolNuevo && (
                  <span className="roles-ayuda-panel">
                    Completa los datos del rol {rolNuevo} en el panel{" "}
                    <span className="roles-ayuda-lado">de la derecha</span>
                    <span className="roles-ayuda-abajo">de abajo</span>.
                  </span>
                )}
              </div>
            ) : (
              <p style={{ color: "#64748b", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>
                {esAdminUser
                  ? "Los usuarios Administrador no pueden recibir roles adicionales."
                  : "Este usuario ya tiene todos los roles disponibles."}
              </p>
            )}

            {/* ── Panel gestión de roles activos (CU 21/22/23/24) ── */}
            {(() => {
              const rolesActivos = [
                seleccionado.Es_Administrador && "Administrador",
                seleccionado.Es_Docente       && "Docente",
                seleccionado.Es_Apoderado     && "Apoderado",
              ].filter(Boolean);

              if (rolesActivos.length === 0 && seleccionado.Usuario_Estado_Cuenta) return null;

              return (
                <div style={{ marginTop: "32px", borderTop: "1px solid #e2e8f0", paddingTop: "24px" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px", color: "#1e293b" }}>
                    Gestión de roles y cuenta
                  </h3>
                  <p style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: "16px" }}>
                    Desactiva un rol específico o reactiva la cuenta si está inactiva.
                  </p>

                  {/* Mensajes de resultado */}
                  {msgGestion.texto && (
                    <div
                      className={msgGestion.tipo === "exito" ? "msg-exito" : "msg-error-form"}
                      style={{ marginBottom: "16px" }}
                    >
                      {msgGestion.texto}
                    </div>
                  )}

                  {/* Roles activos desactivables */}
                  {rolesActivos.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                      {rolesActivos.map(rol => {
                        const puedeGestionar = rol !== "Administrador" || esSuperAdmin;
                        if (!puedeGestionar) return null;
                        return (
                          <div key={rol} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "10px 16px", border: "1px solid #e2e8f0", borderRadius: "8px",
                            background: "#f8fafc",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span className={`badge-rol badge-${rol.toLowerCase()}`}>{rol}</span>
                              <span style={{ fontSize: "0.85rem", color: "#16a34a", fontWeight: 500 }}>Activo</span>
                            </div>
                            <button
                              className="btn-desactivar"
                              style={{ fontSize: "0.82rem", padding: "5px 12px" }}
                              disabled={loadingGestion}
                              onClick={() => confirmarGestion({ tipo: "desactivar-rol", rol })}
                            >
                              Desactivar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Reactivar cuenta inactiva */}
                  {!seleccionado.Usuario_Estado_Cuenta && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 16px", border: "1px solid #fca5a5", borderRadius: "8px",
                      background: "#fff1f2",
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, color: "#991b1b", fontSize: "0.9rem" }}>
                          Cuenta desactivada
                        </span>
                        <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#b91c1c" }}>
                          El usuario no puede iniciar sesión.
                        </p>
                      </div>
                      <button
                        className="btn-reactivar"
                        style={{ fontSize: "0.82rem", padding: "5px 12px" }}
                        disabled={loadingGestion}
                        onClick={() => confirmarGestion({ tipo: "reactivar-cuenta" })}
                      >
                        Reactivar cuenta
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

      </div>

      {/* ── Panel derecho: datos del nuevo rol ── */}
      {mostrarPanelRol && (
        <form
          id={FORM_ROL_ID}
          onSubmit={handleSubmit}
          className="form-card roles-panel"
          aria-label={`Datos del rol ${rolNuevo}`}
        >
          <h2 className="roles-panel-titulo">Datos del rol {rolNuevo}</h2>
          <p className="roles-panel-desc">
            Para <strong>{seleccionado.Usuario_Nombre_Completo}</strong> · RUT {seleccionado.Usuario_RUT}
          </p>

          {rolNuevo === "Docente" && (
            <CamposDocente datos={datosRol} errores={errores} onChange={handleDatosChange} />
          )}
          {rolNuevo === "Administrador" && (
            <CamposAdmin datos={datosRol} errores={errores} onChange={handleDatosChange} esSuperAdmin={esSuperAdmin} />
          )}
          {rolNuevo === "Apoderado" && (
            <CamposApoderado datos={datosRol} errores={errores} onChange={handleDatosChange} />
          )}

          {/* Aviso de conversión cuando Super Admin asigna Admin a usuario con otros roles */}
          {rolNuevo === "Administrador" && (seleccionado.Es_Docente || seleccionado.Es_Apoderado) && (
            <div style={{
              background: "#fffbeb", border: "1px solid #fbbf24",
              borderRadius: "8px", padding: "12px 14px", marginTop: "16px",
            }}>
              <p style={{ margin: 0, color: "#92400e", fontSize: "0.88rem" }}>
                <strong>Conversión de rol:</strong> Al asignar el rol Administrador se eliminarán
                automáticamente los roles de{" "}
                <strong>
                  {[seleccionado.Es_Docente && "Docente", seleccionado.Es_Apoderado && "Apoderado"]
                    .filter(Boolean).join(" y ")}
                </strong>. Esta acción es exclusiva del Super Administrador.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="btn-primario"
            disabled={loadingEnvio}
            style={{ marginTop: "20px", width: "100%" }}
          >
            {loadingEnvio ? "Asignando..." : `Asignar rol ${rolNuevo}`}
          </button>
        </form>
      )}
      </div>

    </div>
  );
}

export default GestionRoles;
