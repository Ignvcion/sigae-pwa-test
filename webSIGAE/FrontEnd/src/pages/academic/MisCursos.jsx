import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAsignacionesDocente, getEstudiantesCursoDocente } from "../../services/api";
import { hhmm } from "../../utils/horarios";

const DIA_ABR = { Lunes: "Lun", Martes: "Mar", "Miércoles": "Mié", Jueves: "Jue", Viernes: "Vie" };

const bloquesActivos = (clase) => (clase?.bloques || []).filter((b) => b.estado === "Activo").length;
const formatearBloques = (n) => `${n} ${n === 1 ? "bloque" : "bloques"}/sem`;

// Clases que imparte el docente agrupadas por curso, para la columna izquierda
function agruparPorCurso(asignaciones) {
  const cursos = new Map();
  for (const a of asignaciones) {
    if (!cursos.has(a.cursoId)) {
      cursos.set(a.cursoId, { cursoId: a.cursoId, curso: a.curso, nivel: a.nivelEducativo, clases: [] });
    }
    cursos.get(a.cursoId).clases.push(a);
  }
  return [...cursos.values()];
}

function TarjetaClase({ clase, seleccionada, onClick }) {
  const suspendida = clase.estadoVigencia !== "Activo";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        padding: "0.75rem 0.9rem", borderRadius: 10,
        border: `1px solid ${seleccionada ? "#1e3a5f" : "#e5e7eb"}`,
        borderLeft: `4px solid ${seleccionada ? "#1e3a5f" : "#93c5fd"}`,
        background: seleccionada ? "#eff6ff" : "#fff",
        boxShadow: seleccionada ? "0 2px 8px rgba(30,58,95,0.12)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ color: "#1e3a5f" }}>{clase.asignatura}</strong>
        {suspendida ? (
          <span className="badge-inactivo">Suspendida</span>
        ) : (
          <span style={{ fontSize: "0.78rem", color: "#6b7280", whiteSpace: "nowrap" }}>
            {formatearBloques(bloquesActivos(clase))}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
        {(clase?.bloques || []).map((b, i) => (
          <span
            key={i}
            style={{
              fontSize: "0.72rem", padding: "2px 7px", borderRadius: 999,
              background: b.estado === "Activo" ? "#f1f5f9" : "#f3f4f6",
              color: b.estado === "Activo" ? "#334155" : "#9ca3af",
              textDecoration: b.estado === "Activo" ? "none" : "line-through",
            }}
          >
            {DIA_ABR[b.dia] || b.dia} {hhmm(b.horaInicio)}–{hhmm(b.horaFin)}
          </span>
        ))}
      </div>
    </button>
  );
}

function MisCursos() {
  const { usuario } = useAuth();
  const [searchParams] = useSearchParams();

  const [cursos, setCursos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensajeInfo, setMensajeInfo] = useState("");

  const [seleccion, setSeleccion] = useState(null); // { cursoId, asignaturaId }
  const [alumnos, setAlumnos] = useState(null);
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);
  const [errorAlumnos, setErrorAlumnos] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const cache = useRef({});
  const cursoActivo = useRef(null);

  const seleccionarClase = async (clase) => {
    setSeleccion({ cursoId: clase.cursoId, asignaturaId: clase.asignaturaId, asignatura: clase.asignatura });
    setBusqueda("");
    setErrorAlumnos("");
    if (cursoActivo.current === clase.cursoId && alumnos) return;
    cursoActivo.current = clase.cursoId;

    if (cache.current[clase.cursoId]) {
      setAlumnos(cache.current[clase.cursoId]);
      return;
    }

    setAlumnos(null);
    setCargandoAlumnos(true);
    try {
      const data = await getEstudiantesCursoDocente(clase.cursoId);
      cache.current[clase.cursoId] = data;
      if (cursoActivo.current === clase.cursoId) setAlumnos(data);
    } catch (err) {
      if (cursoActivo.current === clase.cursoId) {
        setErrorAlumnos(err.message || "No fue posible cargar los estudiantes");
      }
    } finally {
      if (cursoActivo.current === clase.cursoId) setCargandoAlumnos(false);
    }
  };

  useEffect(() => {
    const cargar = async () => {
      try {
        const data = await getAsignacionesDocente(usuario?.id);
        const lista = Array.isArray(data) ? data : data?.asignaciones || [];
        if (lista.length === 0) {
          setMensajeInfo(data?.mensaje || "No tienes clases asignadas");
          return;
        }
        const agrupados = agruparPorCurso(lista);
        setCursos(agrupados);

        // Preselección desde el dashboard (?curso=ID)
        const cursoParam = Number(searchParams.get("curso"));
        const inicial = agrupados.find((c) => c.cursoId === cursoParam);
        if (inicial) seleccionarClase(inicial.clases[0]);
      } catch (err) {
        setError(err.message || "No fue posible cargar tus cursos");
      } finally {
        setCargando(false);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtro = busqueda.trim().toLowerCase();
  const estudiantes = (alumnos?.estudiantes || []).filter(
    (e) => !filtro || e.Estudiante_Nombre_Completo.toLowerCase().includes(filtro)
  );
  const totalClases = cursos.reduce((n, c) => n + c.clases.length, 0);

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Mis Cursos</h1>
        <p>Clases que impartes. Selecciona una para ver sus estudiantes.</p>
      </div>

      {cargando && <p>Cargando cursos...</p>}
      {!cargando && error && <div className="usuarios-empty" style={{ color: "#dc2626" }}>{error}</div>}
      {!cargando && mensajeInfo && <div className="usuarios-empty">{mensajeInfo}</div>}

      {!cargando && cursos.length > 0 && (
        <div className="mis-cursos-grid">
          {/* Columna izquierda: clases */}
          <div className="mis-cursos-columna">
            <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.5rem" }}>
              {totalClases} {totalClases === 1 ? "clase" : "clases"} en {cursos.length} {cursos.length === 1 ? "curso" : "cursos"}
            </div>
            {cursos.map((c) => (
              <div key={c.cursoId} style={{ marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, color: "#1e3a5f", margin: "0 0 0.4rem" }}>
                  {c.curso}
                  <span style={{ fontWeight: 400, color: "#6b7280", fontSize: "0.82rem" }}> · {c.nivel}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(c?.clases || []).map((clase) => (
                    <TarjetaClase
                      key={`${clase.cursoId}-${clase.asignaturaId}`}
                      clase={clase}
                      seleccionada={seleccion?.cursoId === clase.cursoId && seleccion?.asignaturaId === clase.asignaturaId}
                      onClick={() => seleccionarClase(clase)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Columna derecha: estudiantes del curso seleccionado */}
          <div className="mis-cursos-columna mis-cursos-panel">
            {!seleccion ? (
              <div style={{ color: "#6b7280", textAlign: "center", padding: "3rem 1rem" }}>
                ← Selecciona una clase para ver la lista de estudiantes.
              </div>
            ) : (
              <>
                <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#1e3a5f" }}>
                    {alumnos?.curso?.nombre || cursos.find((c) => c.cursoId === seleccion.cursoId)?.curso}
                  </h2>
                  <div style={{ color: "#6b7280", fontSize: "0.88rem" }}>
                    {seleccion.asignatura}
                    {alumnos && ` · ${alumnos.estudiantes.length} ${alumnos.estudiantes.length === 1 ? "estudiante" : "estudiantes"}`}
                  </div>
                </div>

                {cargandoAlumnos && <p>Cargando estudiantes...</p>}
                {errorAlumnos && <p style={{ color: "#dc2626" }}>{errorAlumnos}</p>}

                {alumnos && alumnos.estudiantes.length === 0 && (
                  <p style={{ color: "#6b7280" }}>Este curso aún no tiene estudiantes registrados.</p>
                )}

                {alumnos && alumnos.estudiantes.length > 0 && (
                  <>
                    <input
                      type="text"
                      placeholder="Buscar estudiante..."
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid #d1d5db", marginBottom: "0.75rem" }}
                    />
                    {estudiantes.length === 0 ? (
                      <p style={{ color: "#6b7280" }}>Ningún estudiante coincide con "{busqueda}".</p>
                    ) : (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {estudiantes.map((e, i) => (
                          <li
                            key={e.Estudiante_Id}
                            style={{
                              display: "flex", alignItems: "center", gap: "0.75rem",
                              padding: "0.6rem 0.25rem", borderBottom: "1px solid #f1f5f9",
                            }}
                          >
                            <span style={{ width: 24, textAlign: "right", color: "#9ca3af", fontSize: "0.8rem" }}>{i + 1}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{e.Estudiante_Nombre_Completo}</div>
                              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                                Apoderado: {e.Apoderado_Nombre || "Sin apoderado asignado"}
                              </div>
                            </div>
                            <span className={e.Estudiante_Estado_Academico === "Regular" ? "badge-activo" : "badge-inactivo"}>
                              {e.Estudiante_Estado_Academico}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MisCursos;
