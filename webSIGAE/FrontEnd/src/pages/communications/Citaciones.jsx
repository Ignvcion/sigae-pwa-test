import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCitaciones, getCitacionesPendientes, getEstudiantes } from "../../services/api";
import {
  CATEGORIAS_AGENDA,
  categoriaCitacion,
  fechaISO,
  formatearFecha,
  hoyISO,
  ordenarCronologicamente,
} from "../../utils/citaciones";
import EstadoCitacionBadge from "../../components/citaciones/EstadoCitacionBadge";
import FormCitacionModal from "../../components/citaciones/FormCitacionModal";
import DetalleCitacionModal from "../../components/citaciones/DetalleCitacionModal";
import SolicitarCitacionModal from "../../components/citaciones/SolicitarCitacionModal";

// Respuestas del backend: arreglo directo, o { mensaje, citaciones: [] } para las excepciones "sin registros"
function extraerLista(data, clave = "citaciones") {
  if (Array.isArray(data)) return { lista: data, mensaje: "" };
  return { lista: data?.[clave] || [], mensaje: data?.mensaje || "" };
}

// CU78 - Excepción 2: descarta registros incompletos para no romper la agenda
const esConsistente = (c) =>
  c && c.Citacion_Id && /^\d{4}-\d{2}-\d{2}$/.test(fechaISO(c.Citacion_Fecha)) && c.Citacion_Estado;

async function consultar(peticion, mensajeError) {
  try {
    return { ...extraerLista(await peticion), error: "" };
  } catch (error) {
    return { lista: [], mensaje: "", error: error.message || mensajeError };
  }
}

function consultarCitaciones(rol) {
  return Promise.all([
    consultar(getCitaciones(rol), "No fue posible recuperar la agenda de citaciones. Intente nuevamente."),
    consultar(getCitacionesPendientes(rol), "No fue posible recuperar las solicitudes pendientes."),
  ]).then(([agenda, pendientes]) => ({ agenda, pendientes }));
}

// Módulo de citaciones para Docente, Apoderado y Administrador/Super Admin:
//  CU74 crear (Docente/Admin) · CU89 solicitar (Apoderado) · CU75 confirmar · CU76 cancelar · CU77 reprogramar · CU78 agenda
// El administrador ve y gestiona las citaciones de toda la institución.
function Citaciones() {
  const { usuario, rolActivo } = useAuth();
  const rol = rolActivo || usuario?.roles?.[0];
  const esDocente = rol === "Docente";
  const esApoderado = rol === "Apoderado";
  const esAdmin = rol === "Administrador" || usuario?.administradorTipo === "Super Admin";
  const rolAgenda = esDocente || esApoderado ? rol : "Administrador";

  const [citaciones, setCitaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [mensajeVacio, setMensajeVacio] = useState("");
  const [inconsistentes, setInconsistentes] = useState(0);

  const [pendientes, setPendientes] = useState([]);
  const [msgPendientes, setMsgPendientes] = useState("");

  const [categoria, setCategoria] = useState("todas");
  const [ascendente, setAscendente] = useState(true);
  const [msgExito, setMsgExito] = useState("");

  const [formAbierto, setFormAbierto] = useState(false);
  const [solicitudAbierta, setSolicitudAbierta] = useState(false);
  const [estudiantes, setEstudiantes] = useState([]);
  const [msgSinEstudiantes, setMsgSinEstudiantes] = useState("");
  const [detalleId, setDetalleId] = useState(null);

  // CU78 pasos 1–4 (agenda) y CU75 getCitacionesPendientes(): se consultan juntas y el estado
  // se actualiza solo al recibir la respuesta
  const aplicarResultado = ({ agenda, pendientes: pend }) => {
    if (agenda.error) {
      // CU78 - Excepción 2: error al recuperar la información
      setErrorCarga(agenda.error);
    } else {
      const validas = agenda.lista.filter(esConsistente);
      setErrorCarga("");
      setInconsistentes(agenda.lista.length - validas.length);
      setCitaciones(validas);
      // CU78 - Excepción 1: no existen citaciones asociadas al usuario
      setMensajeVacio(validas.length === 0 ? agenda.mensaje || "No existen citaciones asociadas a tu cuenta." : "");
    }
    const pendientesValidas = ordenarCronologicamente(pend.lista.filter(esConsistente));
    setPendientes(pendientesValidas);
    // CU75 - Excepción 1: no existen citaciones pendientes
    setMsgPendientes(
      pend.error ||
        (pendientesValidas.length === 0
          ? pend.mensaje || "No existen citaciones pendientes de tu confirmación."
          : "")
    );
    setCargando(false);
  };

  useEffect(() => {
    let activo = true;
    consultarCitaciones(rolAgenda).then((resultado) => activo && aplicarResultado(resultado));
    return () => { activo = false; };
  }, [rolAgenda]);

  // Recarga tras una acción (crear, confirmar, cancelar, reprogramar) o al reintentar
  const recargar = () => {
    setCargando(true);
    consultarCitaciones(rolAgenda).then(aplicarResultado);
  };

  // CU74 pasos 3–4: desplegar el formulario con los estudiantes citables
  // (Docente: los de sus cursos; Administrador: todos los de la institución)
  const abrirFormulario = async () => {
    setMsgExito("");
    setFormAbierto(true);
    setEstudiantes(null);
    try {
      const data = await getEstudiantes();
      const { lista, mensaje } = extraerLista(data, "estudiantes");
      setEstudiantes(lista);
      setMsgSinEstudiantes(mensaje);
    } catch (error) {
      setEstudiantes([]);
      setMsgSinEstudiantes(error.message || "No fue posible cargar tus estudiantes");
    }
  };

  const alCompletarAccion = (mensaje) => {
    setFormAbierto(false);
    setSolicitudAbierta(false);
    setDetalleId(null);
    setMsgExito(mensaje);
    recargar();
  };

  const conteo = CATEGORIAS_AGENDA.reduce((acc, { clave }) => {
    acc[clave] = clave === "todas"
      ? citaciones.length
      : citaciones.filter((c) => categoriaCitacion(c) === clave).length;
    return acc;
  }, {});

  const visibles = ordenarCronologicamente(
    categoria === "todas" ? citaciones : citaciones.filter((c) => categoriaCitacion(c) === categoria),
    ascendente
  );

  // Agrupa por día para mostrar la agenda cronológica
  const porDia = visibles.reduce((grupos, c) => {
    const dia = fechaISO(c.Citacion_Fecha);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.items.push(c);
    else grupos.push({ dia, items: [c] });
    return grupos;
  }, []);

  const hoy = hoyISO();
  // Quién participa en cada citación, según desde qué rol se mira la agenda
  // CU89: en las solicitadas por el apoderado, Docente_Nombre es el docente solicitado
  const participantes = (c) => {
    const solicitada = c.Citacion_Solicitante_Rol === "Apoderado";
    const citador = c.Docente_Nombre ? `${solicitada ? "Solicitada a" : "Citado por"}: ${c.Docente_Nombre}` : "";
    const apoderado = c.Apoderado_Nombre
      ? `${solicitada ? "Solicitada por" : "Apoderado"}: ${c.Apoderado_Nombre}`
      : "";
    if (esDocente) return apoderado;
    if (esApoderado) return citador;
    return [citador, apoderado].filter(Boolean).join(" · ");
  };

  return (
    <div className="usuarios-container">
      <div className="cit-header">
        <div className="usuarios-header">
          <h1>Citaciones</h1>
          <p>
            {esDocente
              ? "Agenda de citaciones con apoderados de tus estudiantes"
              : esApoderado
                ? "Agenda de citaciones con los docentes de tus estudiantes"
                : "Agenda de citaciones de toda la institución"}
          </p>
        </div>
        <div className="acciones-grupo">
          <Link to="/citaciones/historial" className="btn-secondary cit-link-btn">
            Historial de citaciones
          </Link>
          {(esDocente || esAdmin) && (
            <button type="button" className="btn-primario" onClick={abrirFormulario}>
              + Nueva citación
            </button>
          )}
          {esApoderado && (
            <button
              type="button"
              className="btn-primario"
              onClick={() => {
                setMsgExito("");
                setSolicitudAbierta(true);
              }}
            >
              + Solicitar citación
            </button>
          )}
        </div>
      </div>

      {msgExito && (
        <div className="success-message cit-exito">
          <span>{msgExito}</span>
          <button type="button" className="btn-cerrar" onClick={() => setMsgExito("")} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {/* CU75: solicitudes pendientes de confirmación */}
      <section className="cit-panel">
        <h2 className="cit-panel-titulo">
          Solicitudes pendientes de tu confirmación
          {pendientes.length > 0 && <span className="cit-contador-badge">{pendientes.length}</span>}
        </h2>
        {pendientes.length === 0 ? (
          <p className="empty-state-text cit-panel-vacio">{msgPendientes}</p>
        ) : (
          <ul className="cit-lista-pendientes">
            {pendientes.map((c) => (
              <li key={c.Citacion_Id} className="cit-pendiente-item">
                <div>
                  <strong>{formatearFecha(c.Citacion_Fecha, { corta: true })}</strong> · {c.Citacion_Tramo_Horario}
                  <div className="cit-sub">
                    {c.Estudiante_Nombre_Completo}
                    {participantes(c) ? ` · ${participantes(c)}` : ""}
                    {` · ${c.Citacion_Modalidad}`}
                  </div>
                </div>
                <button type="button" className="btn-reactivar" onClick={() => setDetalleId(c.Citacion_Id)}>
                  Revisar y confirmar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* CU78: agenda cronológica clasificada por estado */}
      <section>
        <div className="cit-toolbar">
          <div className="vista-toggle cit-tabs" role="tablist">
            {CATEGORIAS_AGENDA.map(({ clave, etiqueta }) => (
              <button
                key={clave}
                type="button"
                role="tab"
                aria-selected={categoria === clave}
                className={`btn-vista ${categoria === clave ? "activo" : ""}`}
                onClick={() => setCategoria(clave)}
              >
                {etiqueta} <span className="cit-tab-conteo">{conteo[clave]}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn-vista" onClick={() => setAscendente((a) => !a)}>
            {ascendente ? "Más antiguas primero ↑" : "Más recientes primero ↓"}
          </button>
        </div>

        {inconsistentes > 0 && (
          <div className="error-message">
            {inconsistentes === 1
              ? "1 citación presenta datos inconsistentes y no se muestra en la agenda."
              : `${inconsistentes} citaciones presentan datos inconsistentes y no se muestran en la agenda.`}
          </div>
        )}

        {cargando ? (
          <p className="empty-state-text">Cargando agenda...</p>
        ) : errorCarga ? (
          <div className="usuarios-empty">
            <div className="msg-error-form" style={{ marginBottom: "12px" }}>{errorCarga}</div>
            <button type="button" className="btn-roles" onClick={recargar}>Reintentar</button>
          </div>
        ) : mensajeVacio ? (
          <div className="usuarios-empty">{mensajeVacio}</div>
        ) : porDia.length === 0 ? (
          <div className="usuarios-empty">No hay citaciones en esta categoría.</div>
        ) : (
          <div className="cit-agenda">
            {porDia.map(({ dia, items }) => (
              <div key={dia} className={`cit-dia ${dia < hoy ? "cit-dia-pasado" : ""}`}>
                <div className="cit-dia-fecha">
                  {formatearFecha(dia)}
                  {dia === hoy && <span className="cit-hoy">Hoy</span>}
                </div>
                <div className="cit-dia-items">
                  {items.map((c) => (
                    <button
                      key={c.Citacion_Id}
                      type="button"
                      className={`cit-card cit-card-${categoriaCitacion(c)}`}
                      onClick={() => {
                        setMsgExito("");
                        setDetalleId(c.Citacion_Id);
                      }}
                    >
                      <div className="cit-card-tramo">{c.Citacion_Tramo_Horario}</div>
                      <div className="cit-card-cuerpo">
                        <div className="cit-card-titulo">
                          {c.Estudiante_Nombre_Completo || "Estudiante sin nombre"}
                          {c.Curso_Nombre && <span className="cit-sub"> · {c.Curso_Nombre}</span>}
                        </div>
                        <div className="cit-sub">
                          {participantes(c) && `${participantes(c)} · `}
                          {c.Citacion_Modalidad}
                        </div>
                        <div className="cit-card-motivo">{c.Citacion_Motivo}</div>
                      </div>
                      <EstadoCitacionBadge citacion={c} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {formAbierto && (
        <FormCitacionModal
          estudiantes={estudiantes}
          mensajeSinEstudiantes={msgSinEstudiantes}
          onClose={() => setFormAbierto(false)}
          onCreada={alCompletarAccion}
        />
      )}

      {solicitudAbierta && (
        <SolicitarCitacionModal
          onClose={() => setSolicitudAbierta(false)}
          onSolicitada={alCompletarAccion}
        />
      )}

      {detalleId && (
        <DetalleCitacionModal
          citacionId={detalleId}
          rol={rol}
          onClose={() => setDetalleId(null)}
          onActualizada={alCompletarAccion}
        />
      )}
    </div>
  );
}

export default Citaciones;
