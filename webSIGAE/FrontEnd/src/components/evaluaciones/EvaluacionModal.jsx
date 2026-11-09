import { useEffect, useState } from "react";
import {
  crearEvaluacion,
  actualizarEvaluacion,
  eliminarEvaluacion,
  getMisAsignacionesEvaluacion,
} from "../../services/api";
import { formatearFecha, hoyISO } from "../../utils/citaciones";

export const TIPOS_EVALUACION = ["Prueba", "Control", "Trabajo", "Disertación", "Examen", "Otra"];
const MAX_CONTENIDOS = 1000;

const claveAsignacion = (cursoId, asignaturaId) => `${cursoId}|${asignaturaId}`;

/**
 * CU92 (registrar) y CU93 (modificar o eliminar) para el docente; vista de solo lectura
 * para el resto o para evaluaciones de otro docente.
 *
 * evaluacion: null para registrar; fechaInicial: día elegido en el calendario.
 */
function EvaluacionModal({ evaluacion, fechaInicial, editable, onClose, onGuardada }) {
  const esNueva = !evaluacion;
  const [asignaciones, setAsignaciones] = useState(editable ? null : []);
  const [msgAsignaciones, setMsgAsignaciones] = useState("");
  const [form, setForm] = useState({
    asignacion: evaluacion ? claveAsignacion(evaluacion.Curso_Id, evaluacion.Asignatura_Id) : "",
    fecha: evaluacion?.Evaluacion_Fecha || fechaInicial || "",
    tipo: evaluacion?.Evaluacion_Tipo || "",
    contenidos: evaluacion?.Evaluacion_Contenidos || "",
  });
  const [errores, setErrores] = useState({});
  const [msgError, setMsgError] = useState("");
  const [advertencia, setAdvertencia] = useState(""); // CU92 Excepción 3
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!editable) return undefined;
    let activo = true;
    getMisAsignacionesEvaluacion()
      .then((data) => {
        if (!activo) return;
        const lista = Array.isArray(data) ? data : data?.asignaciones || [];
        setAsignaciones(lista);
        setMsgAsignaciones(Array.isArray(data) ? "" : data?.mensaje || "");
      })
      .catch((error) => {
        if (!activo) return;
        setAsignaciones([]);
        setMsgAsignaciones(error.message || "No fue posible cargar tus asignaciones");
      });
    return () => { activo = false; };
  }, [editable]);

  const actualizar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
    setMsgError("");
    setAdvertencia("");
  };

  const guardar = async (confirmar = false) => {
    // CU92 Excepción 2: datos incompletos
    const faltantes = {};
    if (!form.asignacion) faltantes.asignacion = "Selecciona el curso y la asignatura";
    if (!form.fecha) faltantes.fecha = "La fecha es obligatoria";
    if (!form.tipo) faltantes.tipo = "Selecciona el tipo de evaluación";
    if (!form.contenidos.trim()) faltantes.contenidos = "Los contenidos son obligatorios";
    if (Object.keys(faltantes).length > 0) {
      setErrores(faltantes);
      return;
    }
    const [cursoId, asignaturaId] = form.asignacion.split("|");
    const datos = { cursoId, asignaturaId, fecha: form.fecha, tipo: form.tipo, contenidos: form.contenidos };

    setGuardando(true);
    setMsgError("");
    try {
      const data = esNueva
        ? await crearEvaluacion(datos, confirmar)
        : await actualizarEvaluacion(evaluacion.Evaluacion_Id, datos, confirmar);
      onGuardada(data?.mensaje || "Evaluación guardada");
    } catch (error) {
      if (error.data?.requiereConfirmacion) {
        setAdvertencia(error.message);
      } else {
        setMsgError(error.message || "No fue posible guardar la evaluación");
        if (error.data?.errores) {
          const e = error.data.errores;
          setErrores({ asignacion: e.asignacion, fecha: e.fecha, tipo: e.tipo, contenidos: e.contenidos });
        }
      }
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm("¿Eliminar esta evaluación del calendario?")) return;
    setGuardando(true);
    try {
      const data = await eliminarEvaluacion(evaluacion.Evaluacion_Id);
      onGuardada(data?.mensaje || "Evaluación eliminada");
    } catch (error) {
      setMsgError(error.message || "No fue posible eliminar la evaluación");
    } finally {
      setGuardando(false);
    }
  };

  const titulo = !editable ? "Detalle de la evaluación" : esNueva ? "Registrar evaluación" : "Modificar evaluación";

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-labelledby="titulo-evaluacion">
        <div className="modal-header">
          <h2 id="titulo-evaluacion">{titulo}</h2>
          <button type="button" className="btn-cerrar" onClick={onClose} aria-label="Cerrar" disabled={guardando}>✕</button>
        </div>

        {!editable ? (
          <>
            <dl className="cit-detalle">
              <dt>Fecha</dt>
              <dd>{formatearFecha(evaluacion.Evaluacion_Fecha)}</dd>
              <dt>Curso</dt>
              <dd>{evaluacion.Curso_Nombre}</dd>
              <dt>Asignatura</dt>
              <dd>{evaluacion.Asignatura_Nombre}</dd>
              <dt>Tipo</dt>
              <dd>{evaluacion.Evaluacion_Tipo}</dd>
              <dt>Docente</dt>
              <dd>{evaluacion.Docente_Nombre}</dd>
              <dt>Contenidos</dt>
              <dd className="cit-texto">{evaluacion.Evaluacion_Contenidos}</dd>
            </dl>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : asignaciones === null ? (
          <p className="empty-state-text">Cargando tus cursos y asignaturas...</p>
        ) : asignaciones.length === 0 ? (
          <>
            {/* CU92 Excepción 1: el docente no tiene asignaciones */}
            <div className="usuarios-empty">{msgAsignaciones || "No tienes cursos ni asignaturas asignados."}</div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <form
            className="cambiar-pwd-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              guardar(false);
            }}
          >
            <div className="campo-pwd">
              <label htmlFor="ev-asignacion">Curso y asignatura</label>
              <select
                id="ev-asignacion"
                className="usuarios-select"
                value={form.asignacion}
                onChange={(e) => actualizar("asignacion", e.target.value)}
              >
                <option value="">Selecciona...</option>
                {asignaciones.map((a) => (
                  <option key={claveAsignacion(a.Curso_Id, a.Asignatura_Id)} value={claveAsignacion(a.Curso_Id, a.Asignatura_Id)}>
                    {a.Curso_Nombre} — {a.Asignatura_Nombre}
                  </option>
                ))}
              </select>
              {errores.asignacion && <span className="pwd-error">{errores.asignacion}</span>}
            </div>

            <div className="cit-form-fila">
              <div className="campo-pwd">
                <label htmlFor="ev-fecha">Fecha</label>
                <input id="ev-fecha" type="date" min={hoyISO()} value={form.fecha} onChange={(e) => actualizar("fecha", e.target.value)} />
                {errores.fecha && <span className="pwd-error">{errores.fecha}</span>}
              </div>
              <div className="campo-pwd">
                <label htmlFor="ev-tipo">Tipo de evaluación</label>
                <select id="ev-tipo" className="usuarios-select" value={form.tipo} onChange={(e) => actualizar("tipo", e.target.value)}>
                  <option value="">Selecciona...</option>
                  {TIPOS_EVALUACION.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errores.tipo && <span className="pwd-error">{errores.tipo}</span>}
              </div>
            </div>

            <div className="campo-pwd">
              <label htmlFor="ev-contenidos">Contenidos</label>
              <textarea
                id="ev-contenidos"
                className="cit-textarea"
                rows={4}
                maxLength={MAX_CONTENIDOS}
                placeholder="Unidades o temas que abarca la evaluación..."
                value={form.contenidos}
                onChange={(e) => actualizar("contenidos", e.target.value)}
              />
              <span className="cit-contador">{form.contenidos.trim().length}/{MAX_CONTENIDOS}</span>
              {errores.contenidos && <span className="pwd-error">{errores.contenidos}</span>}
            </div>

            {msgError && <div className="msg-error-form">{msgError}</div>}

            {/* CU92 Excepción 3: la fecha coincide con un evento que suspende clases */}
            {advertencia && (
              <div className="atencion-confirmacion" role="alertdialog">
                <p><strong>{advertencia}</strong></p>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setAdvertencia("")} disabled={guardando}>
                    Cambiar la fecha
                  </button>
                  <button type="button" className="btn-danger" onClick={() => guardar(true)} disabled={guardando}>
                    {guardando ? "Guardando..." : "Registrar de todos modos"}
                  </button>
                </div>
              </div>
            )}

            {!advertencia && (
              <div className="modal-actions ev-acciones">
                {!esNueva && (
                  <button type="button" className="btn-desactivar" onClick={eliminar} disabled={guardando}>
                    Eliminar
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
                <button type="submit" className="btn-primario" disabled={guardando}>
                  {guardando ? "Guardando..." : esNueva ? "Registrar evaluación" : "Guardar cambios"}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default EvaluacionModal;
