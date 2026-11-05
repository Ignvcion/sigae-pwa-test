import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  cancelarCitacion,
  confirmarCitacion,
  getDetalleCitacion,
  reprogramarCitacion,
} from "../../services/api";
import {
  MAX_MOTIVO,
  TRAMOS_HORARIOS,
  esCancelada,
  esEditable,
  fechaISO,
  formatearFecha,
  hoyISO,
  puedeConfirmar,
  validarFechaTramo,
  validarMotivoCancelacion,
} from "../../utils/citaciones";
import EstadoCitacionBadge from "./EstadoCitacionBadge";

// Detalle de una citación desde la agenda, con las acciones de:
//  CU75 confirmar · CU76 cancelar (motivo obligatorio) · CU77 reprogramar fecha/tramo
// "vista" alterna entre el detalle y los sub-formularios dentro del mismo modal.
function DetalleCitacionModal({ citacionId, rol, onClose, onActualizada }) {
  const [citacion, setCitacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [vista, setVista] = useState("detalle");
  const [procesando, setProcesando] = useState(false);
  const [msgError, setMsgError] = useState("");

  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");

  const [reprog, setReprog] = useState({ fecha: "", tramo: "" });
  const [erroresReprog, setErroresReprog] = useState({});

  // CU76/CU77 pasos 4–10: getDetalleCitacion(Citacion_Id)
  useEffect(() => {
    let activo = true;
    getDetalleCitacion(citacionId)
      .then((data) => {
        if (!activo) return;
        const detalle = data?.citacion || data;
        if (!detalle?.Citacion_Id) throw new Error();
        setCitacion(detalle);
      })
      .catch((error) => {
        // CU76 / CU77 - Excepción 1: la citación no existe o no está disponible
        if (activo) setErrorCarga(error.message || "La citación seleccionada no existe o no está disponible");
      })
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, [citacionId]);

  const volverAlDetalle = () => {
    setVista("detalle");
    setMsgError("");
  };

  // CU75: confirmar citación pendiente
  const handleConfirmar = async () => {
    if (!window.confirm("¿Confirmas tu asistencia a esta citación?")) return;
    setProcesando(true);
    setMsgError("");
    try {
      const data = await confirmarCitacion(citacion.Citacion_Id);
      onActualizada(data?.mensaje || "Citación confirmada correctamente. Se notificó el cambio de estado a la contraparte.");
    } catch (error) {
      // CU75 - Excepción 2: error al actualizar el estado o registrar la confirmación
      setMsgError(error.message || "No fue posible confirmar la citación. Intente nuevamente.");
    } finally {
      setProcesando(false);
    }
  };

  // CU76: modal solicitando motivo obligatorio
  const abrirCancelar = () => {
    setMotivo("");
    setErrorMotivo("");
    setMsgError("");
    setVista("cancelar");
  };

  const handleCancelar = async (e) => {
    e.preventDefault();
    // CU76 - Excepción 2: motivo vacío o inválido → se devuelve al modal
    const error = validarMotivoCancelacion(motivo);
    if (error) {
      setErrorMotivo(error);
      return;
    }
    setProcesando(true);
    setMsgError("");
    try {
      const data = await cancelarCitacion(citacion.Citacion_Id, motivo);
      onActualizada(data?.mensaje || "Citación cancelada correctamente");
    } catch (err) {
      setMsgError(err.message || "No fue posible cancelar la citación");
    } finally {
      setProcesando(false);
    }
  };

  // CU77: modificar fecha y/o tramo horario
  const abrirReprogramar = () => {
    setReprog({ fecha: fechaISO(citacion.Citacion_Fecha), tramo: citacion.Citacion_Tramo_Horario || "" });
    setErroresReprog({});
    setMsgError("");
    setVista("reprogramar");
  };

  const handleReprogramar = async (e) => {
    e.preventDefault();
    setMsgError("");
    // CU77 - Excepción 2: nuevos datos inválidos
    const errores = validarFechaTramo(reprog);
    if (Object.keys(errores).length > 0) {
      setErroresReprog(errores);
      return;
    }
    const sinCambios =
      reprog.fecha === fechaISO(citacion.Citacion_Fecha) && reprog.tramo === citacion.Citacion_Tramo_Horario;
    if (sinCambios) {
      setMsgError("Debes modificar la fecha y/o el tramo horario para reprogramar");
      return;
    }
    setProcesando(true);
    try {
      const data = await reprogramarCitacion(citacion.Citacion_Id, reprog);
      onActualizada(
        data?.mensaje || "Citación reprogramada. Queda pendiente hasta la confirmación de la contraparte."
      );
    } catch (err) {
      // CU77 - Excepción 2: conflicto de disponibilidad horaria (u otro error) → solicitar nuevos datos
      setMsgError(err.message || "Los nuevos datos generan conflicto de disponibilidad horaria");
    } finally {
      setProcesando(false);
    }
  };


  const titulo = {
    detalle: "Detalle de la citación",
    cancelar: "Cancelar citación",
    reprogramar: "Reprogramar citación",
  }[vista];

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-labelledby="titulo-detalle-citacion">
        <div className="modal-header">
          <h2 id="titulo-detalle-citacion">{titulo}</h2>
          <button type="button" className="btn-cerrar" onClick={onClose} aria-label="Cerrar" disabled={procesando}>
            ✕
          </button>
        </div>

        {cargando && <p className="empty-state-text">Cargando detalle...</p>}

        {!cargando && errorCarga && (
          <>
            <div className="msg-error-form">{errorCarga}</div>
            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Volver al módulo</button>
            </div>
          </>
        )}

        {!cargando && citacion && vista === "detalle" && (
          <>
            <dl className="cit-detalle">
              <dt>Estado</dt>
              <dd><EstadoCitacionBadge citacion={citacion} /> <span className="cit-estado-raw">{citacion.Citacion_Estado}</span></dd>
              <dt>Fecha</dt>
              <dd>{formatearFecha(citacion.Citacion_Fecha)}</dd>
              <dt>Tramo horario</dt>
              <dd>{citacion.Citacion_Tramo_Horario}</dd>
              <dt>Modalidad</dt>
              <dd>{citacion.Citacion_Modalidad}</dd>
              <dt>Estudiante</dt>
              <dd>
                {citacion.Estudiante_Nombre_Completo || "—"}
                {citacion.Curso_Nombre ? ` (${citacion.Curso_Nombre})` : ""}
              </dd>
              <dt>{citacion.Citacion_Solicitante_Rol === "Apoderado" ? "Docente" : "Citado por"}</dt>
              <dd>{citacion.Docente_Nombre || <span className="dato-sin-registrar">Sin información</span>}</dd>
              <dt>{citacion.Citacion_Solicitante_Rol === "Apoderado" ? "Solicitada por (apoderado)" : "Apoderado"}</dt>
              <dd>{citacion.Apoderado_Nombre || <span className="dato-sin-registrar">Sin información</span>}</dd>
              <dt>Motivo</dt>
              <dd className="cit-texto">{citacion.Citacion_Motivo}</dd>
              {citacion.Citacion_Fecha_Confirmacion && (
                <>
                  <dt>Confirmada el</dt>
                  <dd>{formatearFecha(citacion.Citacion_Fecha_Confirmacion, { corta: true })}</dd>
                </>
              )}
              {esCancelada(citacion) && (
                <>
                  <dt>Motivo de cancelación</dt>
                  <dd className="cit-texto">{citacion.Citacion_Motivo_Cancelacion || "—"}</dd>
                </>
              )}
            </dl>

            {!esEditable(citacion) && (
              <p className="cit-nota">
                {esCancelada(citacion)
                  ? "La citación está cancelada y no admite modificaciones."
                  : "La fecha de esta citación ya pasó; no está disponible para edición."}
              </p>
            )}

            {msgError && <div className="msg-error-form">{msgError}</div>}

            <div className="cit-acciones-detalle">
              <Link className="cit-link" to={`/citaciones/historial?estudiante=${citacion.Estudiante_Id}`}>
                Ver historial del estudiante
              </Link>
              <div className="acciones-grupo">
                {puedeConfirmar(citacion, rol) && fechaISO(citacion.Citacion_Fecha) >= hoyISO() && (
                  <button type="button" className="btn-reactivar" onClick={handleConfirmar} disabled={procesando}>
                    {procesando ? "Confirmando..." : "Confirmar citación"}
                  </button>
                )}
                {esEditable(citacion) && (
                  <>
                    <button type="button" className="btn-roles" onClick={abrirReprogramar} disabled={procesando}>
                      Reprogramar
                    </button>
                    <button type="button" className="btn-desactivar" onClick={abrirCancelar} disabled={procesando}>
                      Cancelar citación
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {!cargando && citacion && vista === "cancelar" && (
          <form onSubmit={handleCancelar} className="cambiar-pwd-form" noValidate>
            <p className="modal-subtitulo">
              Citación del {formatearFecha(citacion.Citacion_Fecha, { corta: true })}, {citacion.Citacion_Tramo_Horario}.
              El motivo quedará registrado en el historial de la citación.
            </p>
            <div className="campo-pwd">
              <label htmlFor="cit-motivo-cancelacion">Motivo de cancelación (obligatorio)</label>
              <textarea
                id="cit-motivo-cancelacion"
                className="cit-textarea"
                rows={4}
                maxLength={MAX_MOTIVO}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setErrorMotivo("");
                }}
                autoFocus
              />
              <span className="cit-contador">{motivo.trim().length}/{MAX_MOTIVO}</span>
              {errorMotivo && <span className="pwd-error">{errorMotivo}</span>}
            </div>

            {msgError && <div className="msg-error-form">{msgError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={volverAlDetalle} disabled={procesando}>
                Volver
              </button>
              <button type="submit" className="btn-danger" disabled={procesando}>
                {procesando ? "Cancelando..." : "Confirmar cancelación"}
              </button>
            </div>
          </form>
        )}

        {!cargando && citacion && vista === "reprogramar" && (
          <form onSubmit={handleReprogramar} className="cambiar-pwd-form" noValidate>
            <p className="modal-subtitulo">
              Al reprogramar, la citación vuelve a quedar pendiente hasta que la contraparte confirme los nuevos datos.
            </p>
            <div className="cit-form-fila">
              <div className="campo-pwd">
                <label htmlFor="cit-reprog-fecha">Nueva fecha</label>
                <input
                  id="cit-reprog-fecha"
                  type="date"
                  min={hoyISO()}
                  value={reprog.fecha}
                  onChange={(e) => {
                    setReprog((r) => ({ ...r, fecha: e.target.value }));
                    setErroresReprog((er) => ({ ...er, fecha: undefined }));
                    setMsgError("");
                  }}
                />
                {erroresReprog.fecha && <span className="pwd-error">{erroresReprog.fecha}</span>}
              </div>
              <div className="campo-pwd">
                <label htmlFor="cit-reprog-tramo">Nuevo tramo horario</label>
                <select
                  id="cit-reprog-tramo"
                  className="usuarios-select"
                  value={reprog.tramo}
                  onChange={(e) => {
                    setReprog((r) => ({ ...r, tramo: e.target.value }));
                    setErroresReprog((er) => ({ ...er, tramo: undefined }));
                    setMsgError("");
                  }}
                >
                  <option value="">Selecciona un tramo...</option>
                  {TRAMOS_HORARIOS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {erroresReprog.tramo && <span className="pwd-error">{erroresReprog.tramo}</span>}
              </div>
            </div>

            {msgError && <div className="msg-error-form">{msgError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={volverAlDetalle} disabled={procesando}>
                Volver
              </button>
              <button type="submit" className="btn-primario" disabled={procesando}>
                {procesando ? "Validando disponibilidad..." : "Confirmar reprogramación"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default DetalleCitacionModal;
