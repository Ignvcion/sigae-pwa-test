import { useEffect, useState } from "react";
import {
  getEstudiantesSolicitud,
  getDocentesSolicitud,
  getDisponibilidadSolicitud,
  solicitarCitacion,
} from "../../services/api";
import { MAX_MOTIVO, MIN_MOTIVO, MODALIDADES, formatearFecha } from "../../utils/citaciones";

// Respuestas del backend: arreglo directo, o { mensaje, <clave>: [] } para "sin registros"
function extraerLista(data, clave) {
  if (Array.isArray(data)) return { lista: data, mensaje: "" };
  return { lista: data?.[clave] || [], mensaje: data?.mensaje || "" };
}

const FORM_INICIAL = { estudianteId: "", docenteId: "", fecha: "", tramo: "", motivo: "", modalidad: "" };

/**
 * RF56 / CU89: el apoderado (titular o suplente) solicita una citación con un docente de su
 * estudiante, eligiendo solo tramos libres del horario de atención del docente. La solicitud
 * queda pendiente hasta que el docente la confirme (CU75).
 */
function SolicitarCitacionModal({ onClose, onSolicitada }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [msgError, setMsgError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [estudiantes, setEstudiantes] = useState(null); // null = cargando
  const [msgEstudiantes, setMsgEstudiantes] = useState("");
  const [docentes, setDocentes] = useState([]);
  const [msgDocentes, setMsgDocentes] = useState("");
  const [cargandoDocentes, setCargandoDocentes] = useState(false);
  const [dias, setDias] = useState([]);
  const [msgDisponibilidad, setMsgDisponibilidad] = useState("");
  const [cargandoDisponibilidad, setCargandoDisponibilidad] = useState(false);

  const limpiarError = (campo) => {
    setErrores((e) => ({ ...e, [campo]: undefined }));
    setMsgError("");
  };

  // Paso 2: docentes que imparten clases al estudiante
  const seleccionarEstudiante = async (estudianteId) => {
    setForm((f) => ({ ...f, estudianteId, docenteId: "", fecha: "", tramo: "" }));
    limpiarError("estudianteId");
    setDocentes([]);
    setMsgDocentes("");
    setDias([]);
    setMsgDisponibilidad("");
    if (!estudianteId) return;
    setCargandoDocentes(true);
    try {
      const { lista, mensaje } = extraerLista(await getDocentesSolicitud(estudianteId), "docentes");
      setDocentes(lista);
      setMsgDocentes(mensaje);
    } catch (error) {
      setMsgDocentes(error.message || "No fue posible cargar los docentes del estudiante");
    } finally {
      setCargandoDocentes(false);
    }
  };

  // Paso 2: estudiantes asociados (si tiene uno solo, queda seleccionado)
  useEffect(() => {
    let activo = true;
    getEstudiantesSolicitud()
      .then((data) => {
        if (!activo) return;
        const { lista, mensaje } = extraerLista(data, "estudiantes");
        setEstudiantes(lista);
        setMsgEstudiantes(mensaje);
        if (lista.length === 1) seleccionarEstudiante(String(lista[0].Estudiante_Id));
      })
      .catch((error) => {
        if (!activo) return;
        setEstudiantes([]);
        setMsgEstudiantes(error.message || "No fue posible cargar tus estudiantes");
      });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consultarDisponibilidad = async (estudianteId, docenteId) => {
    setDias([]);
    setMsgDisponibilidad("");
    if (!docenteId) return;
    setCargandoDisponibilidad(true);
    try {
      const data = await getDisponibilidadSolicitud(estudianteId, docenteId);
      setDias(data?.dias || []);
      // Excepciones 1 y 2: sin horario de atención o sin bloques disponibles
      setMsgDisponibilidad(data?.dias?.length ? "" : data?.mensaje || "El docente no tiene bloques disponibles");
    } catch (error) {
      setMsgDisponibilidad(error.message || "No fue posible consultar la disponibilidad del docente");
    } finally {
      setCargandoDisponibilidad(false);
    }
  };

  // Pasos 3–4: bloques disponibles del horario de atención del docente
  const seleccionarDocente = (docenteId) => {
    setForm((f) => ({ ...f, docenteId, fecha: "", tramo: "" }));
    limpiarError("docenteId");
    consultarDisponibilidad(form.estudianteId, docenteId);
  };

  const seleccionarTramo = (fecha, tramo) => {
    setForm((f) => ({ ...f, fecha, tramo }));
    limpiarError("tramo");
  };

  const actualizar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    limpiarError(campo);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Excepción 3: datos incompletos o inválidos
    const faltantes = {};
    if (!form.estudianteId) faltantes.estudianteId = "Selecciona el estudiante";
    if (!form.docenteId) faltantes.docenteId = "Selecciona el docente";
    if (!form.fecha || !form.tramo) faltantes.tramo = "Selecciona un día y un tramo disponible";
    const motivo = form.motivo.trim();
    if (!motivo) faltantes.motivo = "El motivo de la citación es obligatorio";
    else if (motivo.length < MIN_MOTIVO) faltantes.motivo = `El motivo debe tener al menos ${MIN_MOTIVO} caracteres`;
    if (!form.modalidad) faltantes.modalidad = "La modalidad es obligatoria";
    if (Object.keys(faltantes).length > 0) {
      setErrores(faltantes);
      setMsgError("Datos incompletos o inválidos en el formulario");
      return;
    }

    setGuardando(true);
    try {
      const data = await solicitarCitacion(form);
      onSolicitada(data?.mensaje || "Solicitud enviada. Queda pendiente hasta que el docente la confirme.");
    } catch (error) {
      setMsgError(error.message || "No fue posible registrar la solicitud");
      if (error.data?.errores) setErrores(error.data.errores);
      // Si el tramo dejó de estar disponible, se refresca la disponibilidad
      if (error.message?.includes("disponible") || error.data?.clase) {
        setForm((f) => ({ ...f, fecha: "", tramo: "" }));
        consultarDisponibilidad(form.estudianteId, form.docenteId);
      }
    } finally {
      setGuardando(false);
    }
  };

  const docenteSel = docentes.find((d) => String(d.Usuario_Id) === String(form.docenteId));

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-card-ancho" role="dialog" aria-labelledby="titulo-solicitar-citacion">
        <div className="modal-header">
          <h2 id="titulo-solicitar-citacion">Solicitar citación</h2>
          <button type="button" className="btn-cerrar" onClick={onClose} aria-label="Cerrar" disabled={guardando}>✕</button>
        </div>
        <p className="modal-subtitulo">
          Elige un docente de tu estudiante y un tramo libre dentro de su horario de atención.
          La solicitud queda pendiente hasta que el docente la confirme.
        </p>

        {estudiantes === null ? (
          <p className="empty-state-text">Cargando estudiantes...</p>
        ) : estudiantes.length === 0 ? (
          <>
            <div className="usuarios-empty">{msgEstudiantes || "No tienes estudiantes asociados."}</div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="cambiar-pwd-form" noValidate>
            <div className="cit-form-fila">
              <div className="campo-pwd">
                <label htmlFor="sol-estudiante">Estudiante</label>
                <select
                  id="sol-estudiante"
                  className="usuarios-select"
                  value={form.estudianteId}
                  onChange={(e) => seleccionarEstudiante(e.target.value)}
                >
                  <option value="">Selecciona un estudiante...</option>
                  {estudiantes.map((e) => (
                    <option key={e.Estudiante_Id} value={e.Estudiante_Id}>
                      {e.Estudiante_Nombre_Completo}
                      {e.Curso_Nombre ? ` — ${e.Curso_Nombre}` : ""}
                      {e.Rol_Apoderado === "Suplente" ? " (suplente)" : ""}
                    </option>
                  ))}
                </select>
                {errores.estudianteId && <span className="pwd-error">{errores.estudianteId}</span>}
              </div>

              <div className="campo-pwd">
                <label htmlFor="sol-docente">Docente</label>
                <select
                  id="sol-docente"
                  className="usuarios-select"
                  value={form.docenteId}
                  disabled={!form.estudianteId || cargandoDocentes || docentes.length === 0}
                  onChange={(e) => seleccionarDocente(e.target.value)}
                >
                  <option value="">
                    {cargandoDocentes ? "Cargando docentes..." : "Selecciona un docente..."}
                  </option>
                  {docentes.map((d) => (
                    <option key={d.Usuario_Id} value={d.Usuario_Id}>
                      {d.Usuario_Nombre_Completo}
                      {d.Asignaturas ? ` — ${d.Asignaturas}` : ""}
                      {d.Tiene_Horario_Atencion ? "" : " (sin horario de atención)"}
                    </option>
                  ))}
                </select>
                {msgDocentes && <span className="pwd-error">{msgDocentes}</span>}
                {errores.docenteId && <span className="pwd-error">{errores.docenteId}</span>}
              </div>
            </div>

            {form.docenteId && (
              <div className="campo-pwd">
                <label>Tramos disponibles{docenteSel ? ` de ${docenteSel.Usuario_Nombre_Completo}` : ""}</label>
                {cargandoDisponibilidad ? (
                  <p className="empty-state-text">Consultando disponibilidad...</p>
                ) : (!dias || dias.length === 0) ? (
                  <div className="cit-nota">{msgDisponibilidad}</div>
                ) : (
                  <div className="sol-disponibilidad">
                    {(dias || []).map((d) => (
                      <div key={d.fecha} className="sol-dia">
                        <div className="sol-dia-fecha">{formatearFecha(d.fecha, { corta: true })} · {d.dia}</div>
                        <div className="sol-tramos">
                          {(d.tramos || []).map((t) => {
                            const elegido = form.fecha === d.fecha && form.tramo === t;
                            return (
                              <button
                                key={t}
                                type="button"
                                className={`sol-tramo ${elegido ? "sol-tramo-activo" : ""}`}
                                aria-pressed={elegido}
                                onClick={() => seleccionarTramo(d.fecha, t)}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {errores.tramo && <span className="pwd-error">{errores.tramo}</span>}
              </div>
            )}

            <div className="campo-pwd">
              <label>Modalidad</label>
              <div className="cit-radios">
                {MODALIDADES.map((m) => (
                  <label key={m} className="cit-radio">
                    <input
                      type="radio"
                      name="sol-modalidad"
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
              <label htmlFor="sol-motivo">Motivo de la citación</label>
              <textarea
                id="sol-motivo"
                className="cit-textarea"
                rows={3}
                maxLength={MAX_MOTIVO}
                placeholder="Describe el motivo de la reunión..."
                value={form.motivo}
                onChange={(e) => actualizar("motivo", e.target.value)}
              />
              <span className="cit-contador">{form.motivo.trim().length}/{MAX_MOTIVO}</span>
              {errores.motivo && <span className="pwd-error">{errores.motivo}</span>}
            </div>

            {msgError && <div className="msg-error-form">{msgError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
              <button type="submit" className="btn-primario" disabled={guardando}>
                {guardando ? "Enviando..." : "Enviar solicitud"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default SolicitarCitacionModal;
