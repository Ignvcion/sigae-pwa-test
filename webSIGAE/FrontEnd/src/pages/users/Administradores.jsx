import { useEffect, useState } from "react";
import { getAdministradores, editarAdministrador } from "../../services/api";
import {
  validarCorreoInstitucional,
  validarTelefonoChileno,
  MENSAJE_TELEFONO,
  DOMINIO_INSTITUCIONAL, TEXTO_DOMINIOS_INSTITUCIONALES,
} from "../../utils/validaciones";

function Administradores() {
  const [administradores, setAdministradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mensajeInfo, setMensajeInfo] = useState("");
  const [errorCarga, setErrorCarga] = useState("");

  // Edición (CU3)
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ correo: "", telefono: "", estado: true });
  const [erroresForm, setErroresForm] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [msgErrorForm, setMsgErrorForm] = useState("");
  const [msgExitoForm, setMsgExitoForm] = useState("");

  useEffect(() => {
    cargarAdministradores();
  }, []);

  const cargarAdministradores = async () => {
    setLoading(true);
    setErrorCarga("");
    setMensajeInfo("");
    try {
      const data = await getAdministradores();
      if (Array.isArray(data)) {
        setAdministradores(data);
      } else {
        // Excepción 1: sin administradores registrados
        setAdministradores(data.administradores || []);
        setMensajeInfo(data.mensaje || "No existen administradores registrados.");
      }
    } catch (error) {
      // Excepción 2: interrupción técnica con la base de datos
      setErrorCarga(error.message || "La información no pudo ser encontrada");
    } finally {
      setLoading(false);
    }
  };

  const abrirEdicion = (admin) => {
    setEditando(admin);
    setForm({
      correo: admin.Administrador_Correo_Institucional || "",
      telefono: admin.Usuario_Telefono || "",
      estado: !!admin.Usuario_Estado_Cuenta,
    });
    setErroresForm({});
    setMsgErrorForm("");
    setMsgExitoForm("");
  };

  const cerrarEdicion = () => setEditando(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const validarFormulario = () => {
    const errores = {};
    if (!validarCorreoInstitucional(form.correo)) {
      errores.correo = `Ingresa un correo electrónico institucional ${TEXTO_DOMINIOS_INSTITUCIONALES}`;
    }
    if (!validarTelefonoChileno(form.telefono)) {
      errores.telefono = MENSAJE_TELEFONO;
    }
    setErroresForm(errores);
    return Object.keys(errores).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsgErrorForm("");
    setMsgExitoForm("");

    if (!validarFormulario()) return;

    setGuardando(true);
    try {
      await editarAdministrador(editando.Usuario_Id, {
        Administrador_Correo_Institucional: form.correo,
        Usuario_Telefono: form.telefono,
        Usuario_Estado_Cuenta: form.estado ? 1 : 0,
      });
      setMsgExitoForm("Cambios guardados correctamente");
      await cargarAdministradores();
    } catch (error) {
      setMsgErrorForm(error.message || "Error al guardar cambios");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="usuarios-container">
        <p>Cargando administradores...</p>
      </div>
    );
  }

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Gestión de Administradores</h1>
        <p>Visualiza y edita las cuentas con rol de Administrador</p>
      </div>

      {errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!errorCarga && mensajeInfo && (
        <div className="usuarios-empty">{mensajeInfo}</div>
      )}

      {!errorCarga && !mensajeInfo && (
        <table className="tabla-usuarios">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {administradores.map((a, idx) => (
              <tr key={a.Usuario_Id}>
                <td>{idx + 1}</td>
                <td>{a.Usuario_Nombre_Completo}</td>
                <td>{a.Administrador_Correo_Institucional || "—"}</td>
                <td>{a.Usuario_Telefono || "—"}</td>
                <td>
                  {a.Usuario_Estado_Cuenta ? (
                    <span className="badge-activo">Activo</span>
                  ) : (
                    <span className="badge-inactivo">Inactivo</span>
                  )}
                </td>
                <td>
                  {a.Administrador_Tipo !== "Super Admin" && (
                    <button className="btn-roles" onClick={() => abrirEdicion(a)}>
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal de edición — CU3 */}
      {editando && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="form-card" style={{ width: "460px", maxWidth: "95vw" }}>
            <h2 style={{ marginBottom: "4px" }}>Editar administrador</h2>
            <p style={{ color: "#64748b", marginBottom: "20px" }}>
              <strong>{editando.Usuario_Nombre_Completo}</strong>
            </p>

            <form onSubmit={handleSubmit} className="cambiar-pwd-form">
              <div className="campo-pwd">
                <label>Correo Institucional</label>
                <input
                  name="correo"
                  value={form.correo}
                  onChange={handleChange}
                  placeholder={`nombre${DOMINIO_INSTITUCIONAL}`}
                  className={erroresForm.correo ? "input-invalid" : ""}
                />
                {erroresForm.correo && (
                  <span className="input-error-msg">{erroresForm.correo}</span>
                )}
              </div>

              <div className="campo-pwd">
                <label>Teléfono</label>
                <input
                  name="telefono"
                  value={form.telefono}
                  onChange={handleChange}
                  placeholder="912345678"
                  className={erroresForm.telefono ? "input-invalid" : ""}
                />
                {erroresForm.telefono && (
                  <span className="input-error-msg">{erroresForm.telefono}</span>
                )}
              </div>

              <div className="campo-pwd">
                <label>Estado de Cuenta</label>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span>
                    Estado de cuenta:{" "}
                    {form.estado ? (
                      <span className="badge-activo">Activa</span>
                    ) : (
                      <span className="badge-inactivo">Inactiva</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={form.estado ? "btn-desactivar" : "btn-reactivar"}
                    onClick={() => setForm((f) => ({ ...f, estado: !f.estado }))}
                  >
                    {form.estado ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>

              {msgExitoForm && <div className="msg-exito">{msgExitoForm}</div>}
              {msgErrorForm && <div className="msg-error-form">{msgErrorForm}</div>}

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" className="btn-primario" disabled={guardando}>
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  className="btn-desactivar"
                  onClick={cerrarEdicion}
                  disabled={guardando}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Administradores;
