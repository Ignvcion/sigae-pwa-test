import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getCursos, getEstudiantesAsociados, getEvaluaciones } from "../../services/api";
import { formatearFecha, hoyISO } from "../../utils/citaciones";
import EvaluacionModal from "../../components/evaluaciones/EvaluacionModal";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n) => String(n).padStart(2, "0");

const mesActual = () => hoyISO().slice(0, 7);

function moverMes(mes, delta) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function nombreMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  const texto = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Semanas del mes (lunes a domingo); los días de otros meses quedan en null. */
function semanasDelMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  const primero = new Date(y, m - 1, 1);
  const diasMes = new Date(y, m, 0).getDate();
  const desfase = (primero.getDay() + 6) % 7; // lunes = 0
  const celdas = [...Array(desfase).fill(null)];
  for (let d = 1; d <= diasMes; d++) celdas.push(`${mes}-${pad(d)}`);
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

const extraerLista = (data, clave) => (Array.isArray(data) ? data : data?.[clave] || []);

/**
 * RF58 / RF59 — CU92, CU93, CU94: calendario mensual de evaluaciones.
 * Apoderado: elige al estudiante y ve las de su curso. Docente: ve las de sus cursos y
 * registra, modifica o elimina las suyas. Administrador: ve las de toda la institución.
 */
function CalendarioEvaluaciones() {
  const { usuario, rolActivo } = useAuth();
  const rol = rolActivo || usuario?.roles?.[0];
  const esDocente = rol === "Docente";
  const esApoderado = rol === "Apoderado";
  const rolConsulta = esDocente || esApoderado ? rol : "Administrador";

  const [mes, setMes] = useState(mesActual());
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [msgExito, setMsgExito] = useState("");

  const [estudiantes, setEstudiantes] = useState([]);
  const [estudianteId, setEstudianteId] = useState("");
  const [cursos, setCursos] = useState([]);
  const [cursoId, setCursoId] = useState("");
  const [asignaturaId, setAsignaturaId] = useState("");

  const [modal, setModal] = useState(null); // { evaluacion, fecha }

  // Apoderado: sus estudiantes (titular o suplente). Administrador: cursos para filtrar.
  useEffect(() => {
    if (esApoderado) {
      getEstudiantesAsociados(usuario.id)
        .then((data) => {
          const lista = extraerLista(data, "estudiantes");
          setEstudiantes(lista);
          if (lista.length > 0) setEstudianteId(String(lista[0].Estudiante_Id));
          else {
            setCargando(false);
            setMensaje(data?.mensaje || "No tienes estudiantes asociados");
          }
        })
        .catch((e) => {
          setCargando(false);
          setError(e.message || "No fue posible cargar tus estudiantes");
        });
    } else if (!esDocente) {
      getCursos().then((data) => setCursos(extraerLista(data, "cursos"))).catch(() => {});
    }
  }, [esApoderado, esDocente, usuario?.id]);

  // CU94: evaluaciones del mes según el rol
  useEffect(() => {
    if (esApoderado && !estudianteId) return undefined;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setError("");
    getEvaluaciones({ mes, rol: rolConsulta, estudianteId: esApoderado ? estudianteId : "", cursoId })
      .then((data) => {
        if (!activo) return;
        setEvaluaciones(extraerLista(data, "evaluaciones"));
        setMensaje(Array.isArray(data) ? "" : data?.mensaje || "");
      })
      .catch((e) => {
        if (!activo) return;
        setEvaluaciones([]);
        setError(e.message || "No fue posible cargar el calendario de evaluaciones");
      })
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, [mes, rolConsulta, esApoderado, estudianteId, cursoId, recarga]);

  // Filtro por asignatura con las asignaturas que aparecen en el mes
  const asignaturas = useMemo(() => {
    const mapa = new Map(evaluaciones.map((e) => [String(e.Asignatura_Id), e.Asignatura_Nombre]));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [evaluaciones]);
  const visibles = asignaturaId ? evaluaciones.filter((e) => String(e.Asignatura_Id) === asignaturaId) : evaluaciones;
  const porDia = useMemo(() => {
    const mapa = {};
    for (const e of visibles) (mapa[e.Evaluacion_Fecha] ||= []).push(e);
    return mapa;
  }, [visibles]);

  const hoy = hoyISO();
  const semanas = semanasDelMes(mes);
  const diasConEvaluaciones = Object.keys(porDia).sort();

  const alGuardar = (texto) => {
    setModal(null);
    setMsgExito(texto);
    setRecarga((r) => r + 1);
  };

  const abrir = (evaluacion, fecha) => {
    setMsgExito("");
    setModal({ evaluacion, fecha });
  };

  const tarjeta = (e) => (
    <button
      key={e.Evaluacion_Id}
      type="button"
      className={`ev-chip ${e.Es_Propia ? "ev-chip-propia" : ""}`}
      title={`${e.Evaluacion_Tipo} · ${e.Asignatura_Nombre} · ${e.Curso_Nombre}`}
      onClick={() => abrir(e)}
    >
      <span className="ev-chip-tipo">{e.Evaluacion_Tipo}</span> {e.Asignatura_Nombre}
      {!esApoderado && <span className="ev-chip-curso">{e.Curso_Nombre}</span>}
    </button>
  );

  return (
    <div className="usuarios-container">
      <div className="cit-header">
        <div className="usuarios-header">
          <h1>Calendario de evaluaciones</h1>
          <p>
            {esApoderado
              ? "Evaluaciones programadas para el curso de tu estudiante"
              : esDocente
                ? "Evaluaciones de tus cursos. Puedes registrar, modificar o eliminar las tuyas."
                : "Evaluaciones de toda la institución"}
          </p>
        </div>
        {esDocente && (
          <div className="acciones-grupo">
            <button type="button" className="btn-primario" onClick={() => abrir(null, null)}>
              + Registrar evaluación
            </button>
          </div>
        )}
      </div>

      {msgExito && (
        <div className="success-message cit-exito">
          <span>{msgExito}</span>
          <button type="button" className="btn-cerrar" onClick={() => setMsgExito("")} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      <div className="ev-toolbar">
        <div className="ev-navegacion">
          <button type="button" className="btn-vista" onClick={() => setMes((m) => moverMes(m, -1))} aria-label="Mes anterior">‹</button>
          <h2 className="ev-mes">{nombreMes(mes)}</h2>
          <button type="button" className="btn-vista" onClick={() => setMes((m) => moverMes(m, 1))} aria-label="Mes siguiente">›</button>
          {mes !== mesActual() && (
            <button type="button" className="btn-vista" onClick={() => setMes(mesActual())}>Hoy</button>
          )}
        </div>
        <div className="ev-filtros">
          {esApoderado && estudiantes.length > 1 && (
            <select
              aria-label="Estudiante"
              className="usuarios-select"
              value={estudianteId}
              onChange={(e) => {
                setEstudianteId(e.target.value);
                setAsignaturaId("");
              }}
            >
              {estudiantes.map((e) => (
                <option key={e.Estudiante_Id} value={e.Estudiante_Id}>
                  {e.Estudiante_Nombre_Completo}{e.Curso_Nombre ? ` — ${e.Curso_Nombre}` : ""}
                </option>
              ))}
            </select>
          )}
          {!esDocente && !esApoderado && (
            <select aria-label="Curso" className="usuarios-select" value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
              <option value="">Todos los cursos</option>
              {cursos.map((c) => <option key={c.Curso_Id} value={c.Curso_Id}>{c.Curso_Nombre}</option>)}
            </select>
          )}
          <select aria-label="Asignatura" className="usuarios-select" value={asignaturaId} onChange={(e) => setAsignaturaId(e.target.value)}>
            <option value="">Todas las asignaturas</option>
            {asignaturas.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
      </div>

      {error ? (
        <div className="usuarios-empty">
          <div className="msg-error-form" style={{ marginBottom: "12px" }}>{error}</div>
          <button type="button" className="btn-roles" onClick={() => setRecarga((r) => r + 1)}>Reintentar</button>
        </div>
      ) : (
        <>
          {/* CU94 Excepción 1: sin evaluaciones en el mes */}
          {!cargando && visibles.length === 0 && (
            <p className="cit-nota">{asignaturaId ? "No hay evaluaciones de esa asignatura en este mes." : mensaje || "No hay evaluaciones registradas en este mes."}</p>
          )}

          <div className={`ev-calendario ${cargando ? "ev-cargando" : ""}`} aria-busy={cargando}>
            {DIAS.map((d) => <div key={d} className="ev-cabecera">{d}</div>)}
            {semanas.flat().map((fecha, i) => (
              <div
                key={fecha || `vacio-${i}`}
                className={`ev-dia ${!fecha ? "ev-dia-vacio" : ""} ${fecha === hoy ? "ev-hoy" : ""} ${fecha && fecha < hoy ? "ev-pasado" : ""}`}
              >
                {fecha && (
                  <>
                    <div className="ev-dia-num">
                      {Number(fecha.slice(8))}
                      {esDocente && fecha >= hoy && i % 7 < 5 && (
                        <button
                          type="button"
                          className="ev-agregar"
                          onClick={() => abrir(null, fecha)}
                          aria-label={`Registrar evaluación el ${formatearFecha(fecha, { corta: true })}`}
                        >
                          +
                        </button>
                      )}
                    </div>
                    {(porDia[fecha] || []).map(tarjeta)}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* En pantallas angostas, la misma información como lista por día */}
          <div className="ev-lista">
            {diasConEvaluaciones.map((fecha) => (
              <div key={fecha} className="ev-lista-dia">
                <div className="cit-dia-fecha">{formatearFecha(fecha)}</div>
                <div className="ev-lista-items">{porDia[fecha].map(tarjeta)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <EvaluacionModal
          evaluacion={modal.evaluacion}
          fechaInicial={modal.fecha}
          editable={esDocente && (!modal.evaluacion || modal.evaluacion.Es_Propia)}
          onClose={() => setModal(null)}
          onGuardada={alGuardar}
        />
      )}
    </div>
  );
}

export default CalendarioEvaluaciones;
