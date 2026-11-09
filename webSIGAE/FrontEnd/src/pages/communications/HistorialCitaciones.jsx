import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getEstudiantes,
  getEstudiantesAsociados,
  getHistorialCitaciones,
} from "../../services/api";
import {
  CATEGORIAS_AGENDA,
  categoriaCitacion,
  esCancelada,
  formatearFecha,
  formatearFechaHora,
  ordenarCronologicamente,
} from "../../utils/citaciones";
import { normalizarTexto } from "../../utils/validaciones";
import EstadoCitacionBadge from "../../components/citaciones/EstadoCitacionBadge";

// Une cada citación con sus registros de la tabla historial.
// Acepta { citaciones: [{..., historial: []}] } o { citaciones: [], historial: [] } (plano, con Citacion_Id).
function normalizarHistorial(data) {
  const citaciones = Array.isArray(data) ? data : data?.citaciones || [];
  const historialPlano = Array.isArray(data?.historial) ? data.historial : [];
  return citaciones.map((c) => ({
    ...c,
    historial: Array.isArray(c.historial)
      ? c.historial
      : historialPlano.filter((h) => String(h.Citacion_Id) === String(c.Citacion_Id)),
  }));
}

async function consultarHistorial(estudianteId) {
  try {
    const data = await getHistorialCitaciones(estudianteId);
    return { lista: normalizarHistorial(data), mensaje: data?.mensaje || "", error: "" };
  } catch (error) {
    return { lista: [], mensaje: "", error: error.message || "No fue posible recuperar el historial de citaciones" };
  }
}

// CU79 / RF53: historial completo y detalle de citaciones de un estudiante (solo lectura)
function HistorialCitaciones() {
  const { usuario, rolActivo } = useAuth();
  const rol = rolActivo || usuario?.roles?.[0];
  const esApoderado = rol === "Apoderado";
  const [searchParams, setSearchParams] = useSearchParams();

  const [estudiantes, setEstudiantes] = useState([]);
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(true);
  const [msgEstudiantes, setMsgEstudiantes] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const estudianteId = searchParams.get("estudiante") || "";

  const [citaciones, setCitaciones] = useState([]);
  const [cargando, setCargando] = useState(Boolean(estudianteId));
  const [errorCarga, setErrorCarga] = useState("");
  const [mensajeVacio, setMensajeVacio] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [ascendente, setAscendente] = useState(false);
  const [seleccionada, setSeleccionada] = useState(null);

  // CU79 paso 3: estudiantes que el actor puede consultar según su rol
  useEffect(() => {
    let activo = true;
    const peticion = esApoderado ? getEstudiantesAsociados(usuario?.id) : getEstudiantes();
    peticion
      .then((data) => {
        if (!activo) return;
        const lista = Array.isArray(data) ? data : data?.estudiantes || [];
        setEstudiantes(lista);
        if (lista.length === 0) setMsgEstudiantes(data?.mensaje || "No existen estudiantes disponibles para consultar.");
      })
      .catch((error) => activo && setMsgEstudiantes(error.message || "No fue posible cargar los estudiantes"))
      .finally(() => activo && setCargandoEstudiantes(false));
    return () => { activo = false; };
  }, [esApoderado, usuario?.id]);

  // CU79 pasos 4–12: getHistorialCitaciones(Estudiante_Id)
  const aplicarResultado = ({ lista, mensaje, error }) => {
    setCitaciones(lista);
    // Excepción 1: estudiante no válido o sin registros asociados
    setMensajeVacio(!error && lista.length === 0
      ? mensaje || "No existen citaciones registradas para el estudiante seleccionado"
      : "");
    // Excepción 2: error al recuperar el historial o datos inconsistentes
    setErrorCarga(error);
    setCargando(false);
  };

  useEffect(() => {
    if (!estudianteId) return;
    let activo = true;
    consultarHistorial(estudianteId).then((resultado) => activo && aplicarResultado(resultado));
    return () => { activo = false; };
  }, [estudianteId]);

  const prepararCarga = () => {
    setCargando(true);
    setErrorCarga("");
    setMensajeVacio("");
    setSeleccionada(null);
  };

  const reintentar = () => {
    prepararCarga();
    consultarHistorial(estudianteId).then(aplicarResultado);
  };

  const seleccionarEstudiante = (id) => {
    setFiltroEstado("todas");
    if (id) prepararCarga();
    if (id) setSearchParams({ estudiante: id });
    else setSearchParams({});
  };

  const criterio = normalizarTexto(busqueda);
  const estudiantesFiltrados = criterio
    ? estudiantes.filter(
        (e) =>
          normalizarTexto(e.Estudiante_Nombre_Completo || "").includes(criterio) ||
          normalizarTexto(e.Estudiante_RUT || "").includes(criterio)
      )
    : estudiantes;

  const estudianteActual = estudiantes.find((e) => String(e.Estudiante_Id) === String(estudianteId));

  const visibles = ordenarCronologicamente(
    filtroEstado === "todas" ? citaciones : citaciones.filter((c) => categoriaCitacion(c) === filtroEstado),
    ascendente
  );

  const resumen = CATEGORIAS_AGENDA.filter((c) => c.clave !== "todas").map(({ clave, etiqueta }) => ({
    clave,
    etiqueta,
    total: citaciones.filter((c) => categoriaCitacion(c) === clave).length,
  }));

  return (
    <div className="usuarios-container">
      <div className="cit-header">
        <div className="usuarios-header">
          <h1>Historial de citaciones</h1>
          <p>Consulta las citaciones de un estudiante, sus estados, observaciones y el detalle de cada reunión</p>
        </div>
        {(rol === "Docente" || rol === "Apoderado" || rol === "Administrador" || usuario?.administradorTipo === "Super Admin") && (
          <Link to="/citaciones" className="btn-secondary cit-link-btn">← Volver a la agenda</Link>
        )}
      </div>

      {/* Paso 3: selecciona o identifica al estudiante a consultar */}
      <div className="usuarios-filtros">
        <input
          type="text"
          className="usuarios-search"
          placeholder="Filtrar estudiantes por nombre o RUT..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          disabled={cargandoEstudiantes || estudiantes.length === 0}
        />
        <select
          className="usuarios-select cit-select-estudiante"
          value={estudianteId}
          onChange={(e) => seleccionarEstudiante(e.target.value)}
          disabled={cargandoEstudiantes || estudiantes.length === 0}
          aria-label="Estudiante a consultar"
        >
          <option value="">
            {cargandoEstudiantes ? "Cargando estudiantes..." : `Selecciona un estudiante (${estudiantesFiltrados.length})`}
          </option>
          {/* Mantiene visible al estudiante seleccionado aunque el filtro de texto lo excluya */}
          {estudianteActual && !estudiantesFiltrados.includes(estudianteActual) && (
            <option value={estudianteActual.Estudiante_Id}>{estudianteActual.Estudiante_Nombre_Completo}</option>
          )}
          {estudiantesFiltrados.map((e) => (
            <option key={e.Estudiante_Id} value={e.Estudiante_Id}>
              {e.Estudiante_Nombre_Completo} — {e.Estudiante_RUT}{e.Curso_Nombre ? ` (${e.Curso_Nombre})` : ""}
            </option>
          ))}
        </select>
      </div>

      {!cargandoEstudiantes && msgEstudiantes && estudiantes.length === 0 && (
        <div className="usuarios-empty">{msgEstudiantes}</div>
      )}

      {!estudianteId && estudiantes.length > 0 && (
        <div className="usuarios-empty">Selecciona un estudiante para ver su historial de citaciones.</div>
      )}

      {estudianteId && (
        <>
          {cargando ? (
            <p className="empty-state-text">Cargando historial...</p>
          ) : errorCarga ? (
            <div className="usuarios-empty">
              <div className="msg-error-form" style={{ marginBottom: "12px" }}>{errorCarga}</div>
              <button type="button" className="btn-roles" onClick={reintentar}>
                Reintentar
              </button>
            </div>
          ) : mensajeVacio ? (
            <div className="usuarios-empty">{mensajeVacio}</div>
          ) : (
            <>
              <div className="cit-resumen">
                <div className="cit-stat">
                  <span className="cit-stat-valor">{citaciones.length}</span>
                  <span className="cit-stat-label">Total</span>
                </div>
                {resumen.map((r) => (
                  <div key={r.clave} className={`cit-stat cit-stat-${r.clave}`}>
                    <span className="cit-stat-valor">{r.total}</span>
                    <span className="cit-stat-label">{r.etiqueta}</span>
                  </div>
                ))}
              </div>

              <div className="cit-toolbar">
                <select
                  className="usuarios-select cit-select-auto"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  aria-label="Filtrar por estado"
                >
                  {CATEGORIAS_AGENDA.map(({ clave, etiqueta }) => (
                    <option key={clave} value={clave}>{clave === "todas" ? "Todos los estados" : etiqueta}</option>
                  ))}
                </select>
                <button type="button" className="btn-vista" onClick={() => setAscendente((a) => !a)}>
                  {ascendente ? "Más antiguas primero ↑" : "Más recientes primero ↓"}
                </button>
              </div>

              {visibles.length === 0 ? (
                <div className="usuarios-empty">No hay citaciones con el estado seleccionado.</div>
              ) : (
                <div className="cit-tabla-wrap">
                  <table className="tabla-usuarios">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tramo</th>
                        <th>Citado por</th>
                        <th>Motivo</th>
                        <th>Modalidad</th>
                        <th>Estado</th>
                        <th>Observaciones</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((c) => (
                        <tr key={c.Citacion_Id}>
                          <td className="cit-celda-nowrap">{formatearFecha(c.Citacion_Fecha, { corta: true })}</td>
                          <td className="cit-celda-nowrap">{c.Citacion_Tramo_Horario}</td>
                          <td>
                            {c.Docente_Nombre || <span className="dato-sin-registrar">—</span>}
                            {c.Citacion_Solicitante_Rol === "Apoderado" && <div className="cit-sub">Solicitada por el apoderado</div>}
                          </td>
                          <td className="cit-celda-texto">{c.Citacion_Motivo}</td>
                          <td>{c.Citacion_Modalidad}</td>
                          <td><EstadoCitacionBadge citacion={c} /></td>
                          <td className="cit-celda-texto">
                            {c.Citacion_Observaciones_Posteriores || <span className="dato-sin-registrar">Sin observaciones</span>}
                          </td>
                          <td className="cit-celda-nowrap">
                            <button type="button" className="btn-roles" onClick={() => setSeleccionada(c)}>
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Pasos 13–14: detalle de la reunión (solo lectura) */}
      {seleccionada && (
        <div className="modal-overlay" onClick={() => setSeleccionada(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-labelledby="titulo-detalle-reunion"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="titulo-detalle-reunion">Detalle de la reunión</h2>
              <button type="button" className="btn-cerrar" onClick={() => setSeleccionada(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <dl className="cit-detalle">
              <dt>Estado</dt>
              <dd><EstadoCitacionBadge citacion={seleccionada} /> <span className="cit-estado-raw">{seleccionada.Citacion_Estado}</span></dd>
              <dt>Fecha</dt>
              <dd>{formatearFecha(seleccionada.Citacion_Fecha)}</dd>
              <dt>Tramo horario</dt>
              <dd>{seleccionada.Citacion_Tramo_Horario}</dd>
              <dt>Modalidad</dt>
              <dd>{seleccionada.Citacion_Modalidad}</dd>
              <dt>Estudiante</dt>
              <dd>{seleccionada.Estudiante_Nombre_Completo || estudianteActual?.Estudiante_Nombre_Completo || "—"}</dd>
              <dt>{seleccionada.Citacion_Solicitante_Rol === "Apoderado" ? "Docente (solicitada por el apoderado)" : "Citado por"}</dt>
              <dd>{seleccionada.Docente_Nombre || "—"}</dd>
              <dt>Apoderado</dt>
              <dd>{seleccionada.Apoderado_Nombre || "—"}</dd>
              <dt>Motivo</dt>
              <dd className="cit-texto">{seleccionada.Citacion_Motivo}</dd>
              {seleccionada.Citacion_Fecha_Confirmacion && (
                <>
                  <dt>Confirmada el</dt>
                  <dd>{formatearFecha(seleccionada.Citacion_Fecha_Confirmacion, { corta: true })}</dd>
                </>
              )}
              {esCancelada(seleccionada) && (
                <>
                  <dt>Motivo de cancelación</dt>
                  <dd className="cit-texto">{seleccionada.Citacion_Motivo_Cancelacion || "—"}</dd>
                </>
              )}
              <dt>Observaciones posteriores</dt>
              <dd className="cit-texto">
                {seleccionada.Citacion_Observaciones_Posteriores || <span className="dato-sin-registrar">Sin observaciones</span>}
              </dd>
            </dl>

            <h3 className="cit-subtitulo">Historial de cambios</h3>
            {(!seleccionada.historial || seleccionada.historial.length === 0) ? (
              <p className="empty-state-text">La citación no registra cambios de estado.</p>
            ) : (
              <ol className="cit-timeline">
                {[...(seleccionada.historial || [])]
                  .sort((a, b) =>
                    `${a.Historial_Fecha_Registro || ""} ${a.Historial_Hora_Registro || ""}`.localeCompare(
                      `${b.Historial_Fecha_Registro || ""} ${b.Historial_Hora_Registro || ""}`
                    )
                  )
                  .map((h, idx) => (
                    <li key={h.Historial_Id ?? idx}>
                      <div className="cit-timeline-fecha">
                        {formatearFechaHora(h.Historial_Fecha_Registro, h.Historial_Hora_Registro)}
                      </div>
                      <div className="cit-timeline-desc">{h.Historial_Descripcion_Cambio}</div>
                      {(h.Historial_Valor_Anterior || h.Historial_Valor_Nuevo) && (
                        <div className="cit-sub">
                          {h.Historial_Atributo_Modificado ? `${h.Historial_Atributo_Modificado}: ` : ""}
                          <s>{h.Historial_Valor_Anterior}</s> → <strong>{h.Historial_Valor_Nuevo}</strong>
                        </div>
                      )}
                      {h.Usuario_Responsable_Nombre && (
                        <div className="cit-sub">Por: {h.Usuario_Responsable_Nombre}</div>
                      )}
                    </li>
                  ))}
              </ol>
            )}

            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button type="button" className="btn-secondary" onClick={() => setSeleccionada(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HistorialCitaciones;
