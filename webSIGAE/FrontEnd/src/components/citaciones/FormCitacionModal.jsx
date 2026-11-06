import { useState } from "react";
import { crearCitacion } from "../../services/api";
import {
  MAX_MOTIVO,
  MODALIDADES,
  TRAMOS_HORARIOS,
  hoyISO,
  validarDatosCitacion,
} from "../../utils/citaciones";
import ContactosApoderados from "./ContactosApoderados";

const FORM_INICIAL = { estudianteId: "", fecha: "", tramo: "", motivo: "", modalidad: "" };

// CU74 / RF48: formulario de nueva citación dirigida al apoderado de un estudiante del docente
function FormCitacionModal({ estudiantes, mensajeSinEstudiantes, onClose, onCreada }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [msgError, setMsgError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Precondición: solo se puede citar a estudiantes que tengan un apoderado asociado
  // (estudiantes === null mientras se cargan)
  const citables = (estudiantes || []).filter((e) => e.Apoderado_Usuario_Id);

  const actualizar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
    setMsgError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsgError("");

    // Excepción 1: datos incompletos o inválidos → se devuelve al formulario
    const erroresForm = validarDatosCitacion(form);
    if (Object.keys(erroresForm).length > 0) {
      setErrores(erroresForm);
      setMsgError("Datos incompletos o inválidos en el formulario");
      return;
    }

    setGuardando(true);
    try {
      const data = await crearCitacion(form);
      onCreada(data?.mensaje || "Citación creada, pendiente de confirmación");
    } catch (error) {
      // Excepción 2: sin disponibilidad horaria (u otro error del servidor) → se devuelve al formulario
      setMsgError(error.message || "No existe disponibilidad para la fecha y tramo seleccionado");
      if (error.data?.errores) setErrores(error.data.errores);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-labelledby="titulo-nueva-citacion">
        <div className="modal-header">
          <h2 id="titulo-nueva-citacion">Nueva citación</h2>
          <button type="button" className="btn-cerrar" onClick={onClose} aria-label="Cerrar" disabled={guardando}>
            ✕
          </button>
        </div>
        <p className="modal-subtitulo">
          Ingresa fecha, tramo horario, motivo y modalidad. El sistema validará tu disponibilidad y la del apoderado.
        </p>

        {estudiantes === null ? (
          <p className="empty-state-text">Cargando estudiantes...</p>
        ) : citables.length === 0 ? (
          <>
            <div className="usuarios-empty">
              {mensajeSinEstudiantes || "No existen apoderados asociados a tus estudiantes para generar una citación."}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="cambiar-pwd-form" noValidate>
            <div className="campo-pwd">
              <label htmlFor="cit-estudiante">Estudiante / apoderado a citar</label>
              <select
                id="cit-estudiante"
                className="usuarios-select"
                value={form.estudianteId}
                onChange={(e) => actualizar("estudianteId", e.target.value)}
              >
                <option value="">Selecciona un estudiante...</option>
                {citables.map((e) => (
                  <option key={e.Estudiante_Id} value={e.Estudiante_Id}>
                    {e.Estudiante_Nombre_Completo}{e.Curso_Nombre ? ` — ${e.Curso_Nombre}` : ""}
                  </option>
                ))}
              </select>
              {errores.estudianteId && <span className="pwd-error">{errores.estudianteId}</span>}
            </div>

            {/* RF57 / CU91: contactos del titular y los suplentes del estudiante seleccionado */}
            {form.estudianteId && <ContactosApoderados estudianteId={form.estudianteId} />}

            <div className="cit-form-fila">
              <div className="campo-pwd">
                <label htmlFor="cit-fecha">Fecha</label>
                <input
                  id="cit-fecha"
                  type="date"
                  min={hoyISO()}
                  value={form.fecha}
                  onChange={(e) => actualizar("fecha", e.target.value)}
                />
                {errores.fecha && <span className="pwd-error">{errores.fecha}</span>}
              </div>

              <div className="campo-pwd">
                <label htmlFor="cit-tramo">Tramo horario</label>
                <select
                  id="cit-tramo"
                  className="usuarios-select"
                  value={form.tramo}
                  onChange={(e) => actualizar("tramo", e.target.value)}
                >
                  <option value="">Selecciona un tramo...</option>
                  {TRAMOS_HORARIOS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errores.tramo && <span className="pwd-error">{errores.tramo}</span>}
              </div>
            </div>

            <div className="campo-pwd">
              <label>Modalidad</label>
              <div className="cit-radios">
                {MODALIDADES.map((m) => (
                  <label key={m} className="cit-radio">
                    <input
                      type="radio"
                      name="modalidad"
                      value={m}
                      checked={form.modalidad === m}
                      onChange={(e) => actualizar("modalidad", e.target.value)}
                    />
                    {m}
                  </label>
                ))}
              </div>
              {errores.modalidad && <span className="pwd-error">{errores.modalidad}</span>}
            </div>

            <div className="campo-pwd">
              <label htmlFor="cit-motivo">Motivo de la citación</label>
              <textarea
                id="cit-motivo"
                className="cit-textarea"
                rows={4}
                maxLength={MAX_MOTIVO}
                placeholder="Describe el motivo de la citación..."
                value={form.motivo}
                onChange={(e) => actualizar("motivo", e.target.value)}
              />
              <span className="cit-contador">{form.motivo.trim().length}/{MAX_MOTIVO}</span>
              {errores.motivo && <span className="pwd-error">{errores.motivo}</span>}
            </div>

            {msgError && <div className="msg-error-form">{msgError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={guardando}>
                {guardando ? "Validando disponibilidad..." : "Crear citación"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default FormCitacionModal;
