import { useEffect, useState } from "react";
import { getDetalleBloqueHorario } from "../../services/api";

function hhmm(t) {
  return t ? String(t).slice(0, 5) : "";
}

// CU69: Visualizando detalle de bloque horario — solo lectura.
// Muestra curso, docente, asignatura, jornada, estado y observaciones
// (incluye las suspensiones por eventos institucionales, RF42/RF45).
function DetalleBloqueModal({ horarioId, onClose }) {
  const [detalle, setDetalle] = useState(null);
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
            <dd>{detalle.dia}, {hhmm(detalle.horaInicio)} - {hhmm(detalle.horaFin)}</dd>

            <dt>Jornada</dt>
            <dd>{detalle.jornada} ({detalle.tipoBloque})</dd>

            <dt>Asignatura</dt>
            <dd>
              {detalle.asignatura}
              {detalle.tramo ? ` · Tramo ${detalle.tramo}` : ""}
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
              {detalle.observaciones?.length > 0 ? (
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
