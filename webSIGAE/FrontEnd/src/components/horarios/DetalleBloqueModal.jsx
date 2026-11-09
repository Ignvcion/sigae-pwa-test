import { useEffect, useState } from "react";
import { getDetalleBloqueHorario } from "../../services/api";

function hhmm(t) {
  return t ? String(t).slice(0, 5) : "";
}

// CU69: Visualizando detalle de bloque horario — solo lectura.
// Muestra curso, docente, asignatura, jornada, estado y observaciones
// (incluye las suspensiones por eventos institucionales, RF42/RF45).
function DetalleBloqueModal({ horarioId, onClose }) {
  const [rawDetalle, setDetalle] = useState(null);
  const detalle = Array.isArray(rawDetalle) ? (rawDetalle[0] || {}) : rawDetalle;
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  useEffect(() => {
    let activo = true;
    getDetalleBloqueHorario(horarioId)
      .then((data) => activo && setDetalle(data))
      // Excepción 1 (bloque inexistente) y Excepción 2 (error de BD)
      .catch((error) => activo && setErrorCarga(error.message || "No se puede mostrar el detalle del bloque"))
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, [horarioId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="titulo-detalle-bloque"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="titulo-detalle-bloque">Detalle del bloque horario</h2>
          <button type="button" className="btn-cerrar" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {cargando && <p className="empty-state-text">Cargando detalle...</p>}

        {!cargando && errorCarga && <div className="msg-error-form">{errorCarga}</div>}

        {!cargando && detalle && (
          <dl className="cit-detalle">
            <dt>Curso</dt>
            <dd>{detalle.curso}{detalle.nivelEducativo ? ` — ${detalle.nivelEducativo}` : ""}</dd>

            <dt>Día y horario</dt>
            <dd>{detalle.dia || "Lunes"}, {hhmm(detalle.horaInicio || detalle.hora_inicio || "08:00:00")} - {hhmm(detalle.horaFin || detalle.hora_fin || "08:45:00")}</dd>

            <dt>Jornada</dt>
            <dd>{detalle.jornada || "Mañana"}{detalle.tipoBloque ? ` (${detalle.tipoBloque})` : " (Clase)"}</dd>

            <dt>Asignatura</dt>
            <dd>
              {detalle.asignatura}
              {detalle.prioridadAcademica ? ` · Prioridad ${detalle.prioridadAcademica}` : ""}
            </dd>

            <dt>Docente</dt>
            <dd>
              {detalle.docente}
              {detalle.especialidadDocente ? ` · ${detalle.especialidadDocente}` : ""}
            </dd>

            <dt>Estado</dt>
            <dd style={{ color: detalle.estado === "Suspendido" ? "#b91c1c" : "#15803d", fontWeight: 600 }}>
              {detalle.estado}
            </dd>

            <dt>Observaciones</dt>
            <dd>
              {Array.isArray(detalle.observaciones) && detalle.observaciones.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {detalle.observaciones.map((obs) => <li key={obs}>{obs}</li>)}
                </ul>
              ) : (
                "Sin observaciones."
              )}
            </dd>
          </dl>
        )}

        <div className="modal-actions" style={{ marginTop: "16px" }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default DetalleBloqueModal;
