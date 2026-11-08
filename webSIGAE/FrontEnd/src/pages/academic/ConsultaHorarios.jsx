import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  filtrarHorarios,
  getBloquesLibres,
  getListaDocentes,
  getCursosHorario,
  getAsignaturasHorario,
  getBloquesInstitucionales,
  getNivelesEducativos,
} from "../../services/api";
import DetalleBloqueModal from "../../components/horarios/DetalleBloqueModal";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const FILTROS_VACIOS = {
  docente_id: "",
  curso_id: "",
  nivel_educativo_id: "",
  asignatura_id: "",
  jornada: "",
  dia_semana: "",
  estado: "Activo",
};

const LIBRES_VACIOS = { curso_id: "", docente_id: "", dia_semana: "", jornada: "", fecha: "" };

function hhmm(t) {
  return t ? String(t).slice(0, 5) : "";
}

// "2026-10-05" → "05-10-2026"
function fechaLegible(f) {
  return f ? f.split("-").reverse().join("-") : "";
}

// Criterios en grilla compacta: varias columnas en escritorio, una en móvil
const ESTILO_FORM = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
  gap: "10px",
  alignItems: "center",
  marginBottom: "16px",
};

const lista = (resultado) =>
  resultado.status === "fulfilled" && Array.isArray(resultado.value) ? resultado.value : [];

// CU67 (bloques libres), CU68 (filtrado de horarios) y CU69 (detalle de bloque).
// Las consultas no modifican la planificación institucional.
function ConsultaHorarios() {
  const { usuario, rolActivo } = useAuth();
  const rolEfectivo = rolActivo || usuario?.roles?.[0];
  const esAdmin = rolEfectivo === "Administrador" || usuario?.administradorTipo === "Super Admin";

  const [pestana, setPestana] = useState("filtrar");

  // Criterios disponibles
  const [opciones, setOpciones] = useState({ docentes: [], cursos: [], niveles: [], asignaturas: [], jornadas: [] });
  const [cargandoOpciones, setCargandoOpciones] = useState(true);

  // CU68
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [horarios, setHorarios] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [mensajeFiltro, setMensajeFiltro] = useState("");
  const [errorFiltro, setErrorFiltro] = useState("");

  // CU67
  const [criteriosLibres, setCriteriosLibres] = useState(LIBRES_VACIOS);
  const [bloquesLibres, setBloquesLibres] = useState([]);
  const [consultandoLibres, setConsultandoLibres] = useState(false);
  const [consultadoLibres, setConsultadoLibres] = useState(false);
  const [mensajeLibres, setMensajeLibres] = useState("");
  const [errorLibres, setErrorLibres] = useState("");

  // CU69
  const [detalleId, setDetalleId] = useState(null);

  useEffect(() => {
    let activo = true;
    Promise.allSettled([
      getListaDocentes(),
      getCursosHorario(),
      getNivelesEducativos(),
      getAsignaturasHorario(),
      getBloquesInstitucionales(),
    ]).then(([docentes, cursos, niveles, asignaturas, bloques]) => {
      if (!activo) return;
      const jornadas = [...new Set(lista(bloques).map((b) => b.Bloque_Horario_Jornada).filter(Boolean))];
      setOpciones({
        docentes: lista(docentes),
        cursos: lista(cursos),
        niveles: lista(niveles),
        asignaturas: lista(asignaturas),
        jornadas,
      });
      setCargandoOpciones(false);
    });
    return () => { activo = false; };
  }, []);

  // CU68 Excepción 1: no existen filtros disponibles por falta de datos asociados
  const sinFiltrosDisponibles =
    !cargandoOpciones &&
    opciones.docentes.length === 0 &&
    opciones.cursos.length === 0 &&
    opciones.asignaturas.length === 0;

  const cambiarFiltro = (campo) => (e) => setFiltros((prev) => ({ ...prev, [campo]: e.target.value }));
  const cambiarCriterioLibre = (campo) => (e) => setCriteriosLibres((prev) => ({ ...prev, [campo]: e.target.value }));

  const buscarHorarios = async (e) => {
    e?.preventDefault();
    setBuscando(true);
    setBuscado(true);
    setErrorFiltro("");
    setMensajeFiltro("");
    try {
      const data = await filtrarHorarios(filtros);
      if (Array.isArray(data)) {
        setHorarios(data);
      } else {
        // Excepción 2: sin resultados coincidentes
        setHorarios([]);
        setMensajeFiltro(data?.mensaje || "No se encontraron horarios coincidentes con los filtros seleccionados");
      }
    } catch (error) {
      setHorarios([]);
      setErrorFiltro(error.message || "Error al filtrar horarios, intente nuevamente");
    } finally {
      setBuscando(false);
    }
  };

  const limpiarFiltros = () => {
    setFiltros(FILTROS_VACIOS);
    setHorarios([]);
    setBuscado(false);
    setMensajeFiltro("");
    setErrorFiltro("");
  };

  const consultarLibres = async (e) => {
    e?.preventDefault();
    setConsultandoLibres(true);
    setConsultadoLibres(true);
    setErrorLibres("");
    setMensajeLibres("");
    try {
      const data = await getBloquesLibres(criteriosLibres);
      if (Array.isArray(data)) {
        setBloquesLibres(data);
      } else {
        // CU67 Excepción 1: no existen bloques libres
        setBloquesLibres([]);
        setMensajeLibres(data?.mensaje || "No existen bloques libres disponibles para los criterios indicados");
      }
    } catch (error) {
      // CU67 Excepciones 2 y 3: error al consultar la base de datos
      setBloquesLibres([]);
      setErrorLibres(error.message || "Error al consultar disponibilidad de bloques libres");
    } finally {
      setConsultandoLibres(false);
    }
  };

  // Bloques libres agrupados por día para leerlos como una agenda semanal
  const libresPorDia = useMemo(() => {
    const grupos = new Map();
    bloquesLibres.forEach((b) => {
      if (!grupos.has(b.dia)) grupos.set(b.dia, []);
      grupos.get(b.dia).push(b);
    });
    return DIAS.filter((d) => grupos.has(d)).map((d) => ({ dia: d, fecha: grupos.get(d)[0].fecha, bloques: grupos.get(d) }));
  }, [bloquesLibres]);

  const estiloPestana = (activa) => ({
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    border: "1px solid #c7d2fe",
    background: activa ? "#4f46e5" : "#fff",
    color: activa ? "#fff" : "#4f46e5",
    fontWeight: 600,
    cursor: "pointer",
  });

  const selector = (etiqueta, valor, onChange, opcionesSelect, textoVacio) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151" }}>{etiqueta}:</label>
      <select className="usuarios-select" style={{ width: "100%" }} aria-label={etiqueta} value={valor} onChange={onChange}>
        <option value="">{textoVacio}</option>
        {opcionesSelect}
      </select>
    </div>
  );

  const opcionesDocentes = opciones.docentes.map((d) => (
    <option key={d.Usuario_Id} value={d.Usuario_Id}>{d.Usuario_Nombre_Completo}</option>
  ));
  const opcionesCursos = opciones.cursos.map((c) => (
    <option key={c.Curso_Id} value={c.Curso_Id}>{c.Curso_Nombre}</option>
  ));
  const opcionesJornadas = opciones.jornadas.map((j) => <option key={j} value={j}>{j}</option>);
  const opcionesDias = DIAS.map((d) => <option key={d} value={d}>{d}</option>);

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Consulta de Horarios</h1>
        <p>Filtra los horarios institucionales, consulta bloques libres y revisa el detalle de cada bloque</p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button type="button" style={estiloPestana(pestana === "filtrar")} onClick={() => setPestana("filtrar")}>
          Filtrar horarios
        </button>
        {esAdmin && (
          <button type="button" style={estiloPestana(pestana === "libres")} onClick={() => setPestana("libres")}>
            Bloques libres
          </button>
        )}
      </div>

      {cargandoOpciones && <p>Cargando criterios de búsqueda...</p>}

      {/* ── CU68: Filtrando horarios ── */}
      {!cargandoOpciones && pestana === "filtrar" && (
        <>
          {sinFiltrosDisponibles ? (
            <div className="usuarios-empty">
              No existen filtros disponibles por falta de datos asociados en el sistema.
            </div>
          ) : (
            <form style={ESTILO_FORM} onSubmit={buscarHorarios}>
              {selector("Docente", filtros.docente_id, cambiarFiltro("docente_id"), opcionesDocentes, "Todos los docentes")}
              {selector("Curso específico", filtros.curso_id, cambiarFiltro("curso_id"), opcionesCursos, "Todos los cursos (ej: 1° Básico A)")}
              {selector(
                "Nivel educativo general",
                filtros.nivel_educativo_id,
                cambiarFiltro("nivel_educativo_id"),
                opciones.niveles.map((n) => (
                  <option key={n.Nivel_Educativo_Id || n.Nivel_Id} value={n.Nivel_Educativo_Id || n.Nivel_Id}>{n.Nivel_Educativo_Nombre || n.Nivel_Nombre}</option>
                )),
                "Todos los niveles"
              )}
              {selector(
                "Asignatura",
                filtros.asignatura_id,
                cambiarFiltro("asignatura_id"),
                opciones.asignaturas.map((a) => (
                  <option key={a.Asignatura_Id} value={a.Asignatura_Id}>{a.Asignatura_Nombre}</option>
                )),
                "Todas las asignaturas"
              )}
              {selector("Jornada", filtros.jornada, cambiarFiltro("jornada"), opcionesJornadas, "Todas las jornadas")}
              {selector("Día", filtros.dia_semana, cambiarFiltro("dia_semana"), opcionesDias, "Todos los días")}
              <select
                className="usuarios-select"
                style={{ width: "100%" }}
                aria-label="Estado"
                value={filtros.estado}
                onChange={cambiarFiltro("estado")}
              >
                <option value="Activo">Activos</option>
                <option value="Suspendido">Suspendidos</option>
                <option value="Todos">Todos los estados</option>
              </select>
              <button type="submit" className="btn-primary" disabled={buscando}>
                {buscando ? "Buscando..." : "Buscar"}
              </button>
              <button type="button" className="btn-secondary" onClick={limpiarFiltros} disabled={buscando}>
                Limpiar
              </button>
            </form>
          )}

          {errorFiltro && <div className="usuarios-empty" style={{ color: "#dc2626" }}>{errorFiltro}</div>}
          {!errorFiltro && mensajeFiltro && <div className="usuarios-empty">{mensajeFiltro}</div>}
          {!buscado && !sinFiltrosDisponibles && (
            <div className="usuarios-empty">Selecciona uno o más filtros y presiona "Buscar".</div>
          )}

          {horarios.length > 0 && (
            <>
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>{horarios.length} bloque(s) encontrado(s)</p>
              <div className="tabla-responsive-container">
                <table className="tabla-usuarios">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Horario</th>
                      <th>Jornada</th>
                      <th>Curso</th>
                      <th>Asignatura</th>
                      <th>Docente</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {horarios.map((h) => (
                      <tr key={h.Horario_Asignatura_Id}>
                        <td>{h.dia}</td>
                        <td>{hhmm(h.horaInicio)} - {hhmm(h.horaFin)}</td>
                        <td>{h.jornada}</td>
                        <td>{h.curso}</td>
                        <td>{h.asignatura}</td>
                        <td>{h.docente}</td>
                        <td>
      {h.estado === "Inactivo" || h.estado === "Suspendido" ? (
        <span className="badge-inactivo">{h.estado}</span>
      ) : (
        <span className="badge-activo">Activo</span>
      )}
    </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setDetalleId(h.Horario_Asignatura_Id)}
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ── CU67: Visualizando disponibilidad de bloques libres ── */}
      {!cargandoOpciones && pestana === "libres" && esAdmin && (
        <>
          <form style={ESTILO_FORM} onSubmit={consultarLibres}>
            {selector("Curso", criteriosLibres.curso_id, cambiarCriterioLibre("curso_id"), opcionesCursos, "Toda la institución")}
            {selector("Docente", criteriosLibres.docente_id, cambiarCriterioLibre("docente_id"), opcionesDocentes, "Cualquier docente")}
            {/* Con una fecha puntual, el día de la semana queda definido por ella */}
            {criteriosLibres.fecha
              ? <select className="usuarios-select" style={{ width: "100%" }} aria-label="Día" disabled><option>Día según la fecha</option></select>
              : selector("Día", criteriosLibres.dia_semana, cambiarCriterioLibre("dia_semana"), opcionesDias, "Todos los días")}
            {selector("Jornada", criteriosLibres.jornada, cambiarCriterioLibre("jornada"), opcionesJornadas, "Todas las jornadas")}
            <input
              type="date"
              className="usuarios-select"
              style={{ width: "100%", boxSizing: "border-box" }}
              aria-label="Fecha"
              title="Fecha a evaluar (opcional)"
              value={criteriosLibres.fecha}
              onChange={cambiarCriterioLibre("fecha")}
            />
            <button type="submit" className="btn-primary" disabled={consultandoLibres}>
              {consultandoLibres ? "Consultando..." : "Consultar disponibilidad"}
            </button>
          </form>

          <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: 0 }}>
            Un bloque está libre cuando no tiene asignaciones activas del curso o docente seleccionados
            (o de ningún curso, si no se selecciona ninguno) ni actividades institucionales en la fecha
            evaluada. Sin fecha, se evalúa la próxima ocurrencia de cada día.
          </p>

          {errorLibres && <div className="usuarios-empty" style={{ color: "#dc2626" }}>{errorLibres}</div>}
          {!errorLibres && mensajeLibres && <div className="usuarios-empty">{mensajeLibres}</div>}
          {!consultadoLibres && (
            <div className="usuarios-empty">Define los criterios y presiona "Consultar disponibilidad".</div>
          )}

          {libresPorDia.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="tabla-usuarios">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Bloques libres</th>
                  </tr>
                </thead>
                <tbody>
                  {libresPorDia.map(({ dia, fecha, bloques }) => (
                    <tr key={dia}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {dia}
                        {fecha && (
                          <div style={{ fontWeight: 400, fontSize: "0.8rem", color: "#64748b" }}>{fechaLegible(fecha)}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                          {bloques.map((b) => (
                            <span
                              key={`${dia}-${b.bloqueId}`}
                              style={{
                                padding: "0.2rem 0.6rem",
                                borderRadius: "999px",
                                background: "#ecfdf5",
                                border: "1px solid #a7f3d0",
                                color: "#065f46",
                                fontSize: "0.82rem",
                              }}
                              title={`${b.jornada} · ${b.tipo}`}
                            >
                              {hhmm(b.horaInicio)} - {hhmm(b.horaFin)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {detalleId && <DetalleBloqueModal horarioId={detalleId} onClose={() => setDetalleId(null)} />}
    </div>
  );
}

export default ConsultaHorarios;
