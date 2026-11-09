import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import PanelJefaturaCurso from "../../components/cursos/PanelJefaturaCurso";
import { getEstadoPeriodo } from "../../services/promocion";
import BarraFiltrosCursos, { tramoDelCurso, TRAMOS_CURSO } from "../../components/cursos/BarraFiltrosCursos";

function ModalAsignarAsignaturas({ curso, token, onClose, onExito }) {
  const [disponibles, setDisponibles] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState({});
  const [estadoSeleccion, setEstadoSeleccion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(`/api/cursos/${curso.Curso_Id}/asignaturas/disponibles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al cargar asignaturas disponibles");
        } else {
          setDisponibles(data);
        }
      } catch {
        setError("Error al conectar con el servidor");
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [curso.Curso_Id, token]);

  const toggleSeleccion = (asigId) => {
    setSeleccionadas((prev) => {
      const next = { ...prev };
      if (next[asigId]) delete next[asigId];
      else next[asigId] = true;
      return next;
    });
  };

  const handleEstado = (asigId, valor) => {
    setEstadoSeleccion((prev) => ({ ...prev, [asigId]: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const ids = Object.keys(seleccionadas).map(Number);
    if (ids.length === 0) {
      setError("Debe seleccionar al menos una asignatura");
      return;
    }

    const asignaturas = ids.map((id) => ({
      asignatura_id: id,
      estado: estadoSeleccion[id] || "Activa",
    }));

    setEnviando(true);
    try {
      const res = await fetch(`/api/cursos/${curso.Curso_Id}/asignaturas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ asignaturas }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
      } else {
        onExito(data.mensaje);
        onClose();
      }
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Asignar asignaturas a {curso.Curso_Nombre}</h2>
          <button className="btn-cerrar" onClick={onClose}>✕</button>
        </div>

        {cargando ? (
          <p>Cargando asignaturas disponibles...</p>
        ) : error && disponibles.length === 0 ? (
          <p className="msg-error">{error}</p>
        ) : disponibles.length === 0 ? (
          <p className="empty-state-text">No hay asignaturas disponibles para asociar a este curso. Todas las del plan educativo ya están asignadas.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <p className="msg-error">{error}</p>}
            <p className="modal-subtitulo">Seleccione las asignaturas del plan educativo a asociar:</p>
            <div className="asignaturas-lista">
              {disponibles.map((a) => (
                <div key={a.Asignatura_Id} className={`asignatura-item ${seleccionadas[a.Asignatura_Id] ? "seleccionada" : ""}`}>
                  <label className="asignatura-check">
                    <input
                      type="checkbox"
                      checked={!!seleccionadas[a.Asignatura_Id]}
                      onChange={() => toggleSeleccion(a.Asignatura_Id)}
                    />
                    <span className="asig-nombre">{a.Asignatura_Nombre}</span>
                    <span className="asig-tipo">{a.Tipo}</span>
                    <span className="asig-horas">{a.Horas_Semanales_Requeridas}h/sem</span>
                  </label>
                  {seleccionadas[a.Asignatura_Id] && (
                    <div className="asig-estado-select">
                      <label>Estado:</label>
                      <select
                        value={estadoSeleccion[a.Asignatura_Id] || "Activa"}
                        onChange={(e) => handleEstado(a.Asignatura_Id, e.target.value)}
                      >
                        <option value="Activa">Activa</option>
                        <option value="Inactiva">Inactiva</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secundario" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={enviando}>
                {enviando ? "Registrando..." : "Confirmar asignación"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PanelAsignaturasCurso({ curso, token, esAdmin, onVolver, onCambioJefatura }) {
  const [asignadas, setAsignadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/cursos/${curso.Curso_Id}/asignaturas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error al cargar");
      else setAsignadas(data);
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [curso.Curso_Id]);

  const handleExito = (msg) => {
    setExito(msg);
    cargar();
    setTimeout(() => setExito(""), 4000);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn-volver" onClick={onVolver}>← Volver a cursos</button>
          <h2 style={{ marginTop: "0.5rem" }}>
            {curso.Curso_Nombre} <span className="curso-seccion-badge">{curso.Curso_Periodo_Lectivo}</span>
          </h2>
        </div>
        {esAdmin && (
          <button className="btn-primary" onClick={() => { setError(""); setMostrarModal(true); }}>
            + Asignar asignatura
          </button>
        )}
      </div>

      {/* RF60: profesor jefe y estudiantes del curso (CU95, CU96, CU97) */}
      <PanelJefaturaCurso curso={curso} esAdmin={esAdmin} onCambio={onCambioJefatura} />

      <h3>Asignaturas del curso</h3>
      {exito && <p className="msg-exito">{exito}</p>}
      {error && <p className="msg-error">{error}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : asignadas.length === 0 ? (
        <div className="empty-state">
          <p>Este curso no tiene asignaturas asociadas aún.</p>
        </div>
      ) : (
        <table className="tabla-asignaturas">
          <thead>
            <tr>
              <th>Asignatura</th>
              <th>Tramo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {asignadas.map((a) => (
              <tr key={a.tieneasig_Id}>
                <td>{a.Asignatura_Nombre}</td>
                <td>{a.Asignatura_Tramo}</td>
                <td>
                  <span className={`badge-estado ${a.Estado_Asignacion === "Activa" ? "badge-vigente" : "badge-inactiva"}`}>
                    {a.Estado_Asignacion}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mostrarModal && (
        <ModalAsignarAsignaturas
          curso={curso}
          token={token}
          onClose={() => setMostrarModal(false)}
          onExito={handleExito}
        />
      )}
    </div>
  );
}

function Cursos() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.roles?.some(r => r === 'Administrador' || r === 'Super Admin');

  const [cursos, setCursos] = useState([]);
  const [niveles, setNiveles] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nivelId, setNivelId] = useState("");
  const [seccion, setSeccion] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [cargando, setCargando] = useState(true);
  const [cursoSeleccionado, setCursoSeleccionado] = useState(null);
  const [vistaLista, setVistaLista] = useState(false);
  const [periodos, setPeriodos] = useState(null); // { vigente, siguiente }
  const [periodo, setPeriodo] = useState("");
  // Listado: filtro por tramo y período que se ve (vigente / siguiente durante el cierre)
  const [tramoFiltro, setTramoFiltro] = useState("");
  const [periodoVista, setPeriodoVista] = useState("");
  const [giro, setGiro] = useState(0);
  const [desdeIzquierda, setDesdeIzquierda] = useState(false);

  const token = localStorage.getItem("token");

  const cargarDatos = async () => {
    try {
      const [resCursos, resNiveles] = await Promise.all([
        fetch("/api/cursos", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/cursos/niveles", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const lista = await resCursos.json();
      setCursos(lista);
      setNiveles(await resNiveles.json());
      // Si hay un curso abierto, se refresca (p. ej. tras cambiar el profesor jefe)
      setCursoSeleccionado((actual) => (actual ? lista.find((c) => c.Curso_Id === actual.Curso_Id) || null : actual));
    } catch {
      setError("Error al cargar los datos");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Durante el cierre se pueden crear cursos del período siguiente
  useEffect(() => {
    if (!esAdmin) return;
    getEstadoPeriodo().then((d) => d && setPeriodos(d.periodos)).catch(() => {});
  }, [esAdmin]);

  const resetForm = () => {
    setNivelId("");
    setSeccion("");
    setPeriodo("");
    setError("");
  };

  const toggleForm = () => {
    setMostrarForm((v) => !v);
    setExito("");
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setExito("");

    if (!nivelId) {
      setError("Debe seleccionar el nivel educativo");
      return;
    }

    const res = await fetch("/api/cursos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nivel_educativo_id: nivelId, seccion, ...(periodo && { periodo }) }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setExito(data.mensaje);
    setMostrarForm(false);
    resetForm();
    cargarDatos();
  };

  // Períodos del listado (durante el cierre conviven el vigente y el siguiente)
  const ETIQUETA_PERIODO = { Vigente: "Vigente", Futuro: "Siguiente", Anterior: "Anterior" };
  const periodosLista = [...new Map(cursos.map((c) => [String(c.Curso_Periodo_Lectivo), {
    valor: String(c.Curso_Periodo_Lectivo),
    etiqueta: ETIQUETA_PERIODO[c.Curso_Periodo_Estado] || "Período",
  }])).values()].sort((a, b) => a.valor.localeCompare(b.valor));
  const periodoPorDefecto = (periodosLista.find((p) => p.etiqueta === "Vigente") || periodosLista[0])?.valor || "";
  const periodoActivo = periodosLista.some((p) => p.valor === periodoVista) ? periodoVista : periodoPorDefecto;

  const cambiarPeriodo = () => {
    const otro = periodosLista.find((p) => p.valor !== periodoActivo);
    if (!otro) return;
    setDesdeIzquierda(otro.valor < periodoActivo);
    setPeriodoVista(otro.valor);
    setGiro((g) => g + 1);
  };

  const cursosDelPeriodo = cursos.filter((c) => String(c.Curso_Periodo_Lectivo) === periodoActivo);
  const conteosTramo = Object.fromEntries([
    ["", cursosDelPeriodo.length],
    ...TRAMOS_CURSO.map((t) => [t, cursosDelPeriodo.filter((c) => tramoDelCurso(c) === t).length]),
  ]);
  const cursosVisibles = cursosDelPeriodo.filter((c) => tramoFiltro === "" || tramoDelCurso(c) === tramoFiltro);

  // Tarjetas agrupadas por nivel (el período ya está elegido)
  const cursosAgrupados = cursosVisibles.reduce((acc, curso) => {
    const nivel = curso.Nivel_Educativo_Nombre;
    if (!acc[nivel]) acc[nivel] = [];
    acc[nivel].push(curso);
    return acc;
  }, {});

  if (cargando) return <div className="page-container"><p>Cargando cursos...</p></div>;

  if (cursoSeleccionado) {
    return (
      <div className="page-container">
        <PanelAsignaturasCurso
          curso={cursoSeleccionado}
          token={token}
          esAdmin={esAdmin}
          onVolver={() => setCursoSeleccionado(null)}
          onCambioJefatura={cargarDatos}
        />
      </div>
    );
  }

  const hayCursos = cursos.length > 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Cursos</h1>
          <p>Gestión de cursos por nivel educativo</p>
        </div>
        <div className="page-header-actions">
          {hayCursos && (
            <div className="vista-toggle">
              <button
                className={`btn-vista ${!vistaLista ? "activo" : ""}`}
                onClick={() => setVistaLista(false)}
                title="Vista en tarjetas"
              >
                ⊞ Tarjetas
              </button>
              <button
                className={`btn-vista ${vistaLista ? "activo" : ""}`}
                onClick={() => setVistaLista(true)}
                title="Vista en lista"
              >
                ☰ Lista
              </button>
            </div>
          )}
          {esAdmin && (
            <button className="btn-primary" onClick={toggleForm}>
              {mostrarForm ? "Cancelar" : "+ Registrar Curso"}
            </button>
          )}
        </div>
      </div>

      {exito && <p className="msg-exito">{exito}</p>}
      {error && <p className="msg-error">{error}</p>}

      {mostrarForm && (
        <div className="form-card">
          <h2>Nuevo Curso</h2>
          <form onSubmit={handleSubmit}>
            <label>Nivel Educativo</label>
            <select value={nivelId} onChange={(e) => setNivelId(e.target.value)} required>
              <option value="">Seleccionar nivel...</option>
              {niveles.map((n) => (
                <option key={n.Nivel_Educativo_Id} value={n.Nivel_Educativo_Id}>
                  {n.Nivel_Educativo_Nombre}
                </option>
              ))}
            </select>

            {periodos?.siguiente && (
              <>
                <label style={{ marginTop: "1rem" }}>Período</label>
                <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                  <option value="">{periodos.vigente} (vigente)</option>
                  <option value={periodos.siguiente}>{periodos.siguiente} (en preparación)</option>
                </select>
              </>
            )}

            <label style={{ marginTop: "1rem" }}>Sección (letra A-Z)</label>
            <input
              type="text"
              maxLength={1}
              placeholder="Ej: A"
              value={seccion}
              onChange={(e) => setSeccion(e.target.value.toUpperCase())}
              required
            />

            <button type="submit" className="btn-primary" style={{ marginTop: "1rem" }}>
              Registrar
            </button>
          </form>
        </div>
      )}

      {hayCursos && (
        <BarraFiltrosCursos
          tramo={tramoFiltro}
          onTramo={setTramoFiltro}
          conteos={conteosTramo}
          periodos={periodosLista}
          periodo={periodoActivo}
          onCambiarPeriodo={cambiarPeriodo}
          giro={giro}
        />
      )}

      {!hayCursos ? (
        <div className="empty-state">
          <p>No hay cursos registrados aún.</p>
        </div>
      ) : (
        <div
          key={periodoActivo}
          className={`cursos-vista-periodo${giro > 0 ? " entrando" : ""}${desdeIzquierda ? " desde-izquierda" : ""}`}
        >
      {cursosVisibles.length === 0 ? (
        <div className="empty-state">
          <p>No hay cursos {tramoFiltro ? `del tramo ${tramoFiltro} ` : ""}en el período {periodoActivo}.</p>
        </div>
      ) : vistaLista ? (
        /* ── Vista Lista ── */
        <div className="cursos-lista-container">
          <table className="tabla-cursos">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Nivel Educativo</th>
                <th>Tramo</th>
                <th>Sección</th>
                <th>Período</th>
                <th>Profesor jefe</th>
                <th>Asignaturas activas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cursosVisibles.map((c) => (
                <tr
                  key={c.Curso_Id}
                  className="tabla-curso-fila"
                  onClick={() => setCursoSeleccionado(c)}
                >
                  <td className="tabla-curso-nombre">{c.Curso_Nombre}</td>
                  <td>{c.Nivel_Educativo_Nombre}</td>
                  <td>{tramoDelCurso(c) || "—"}</td>
                  <td>{c.Curso_Seccion}</td>
                  <td>{c.Curso_Periodo_Lectivo}</td>
                  <td>{c.Profesor_Jefe_Nombre || "—"}</td>
                  <td>
                    <span className="badge-asig-count">{c.Total_Asignaturas_Activas ?? 0}</span>
                  </td>
                  <td><span className="curso-link">Ver curso →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Vista Tarjetas ── */
        Object.entries(cursosAgrupados).map(([nivel, lista]) => (
          <div key={nivel} className="cursos-grupo">
            <h3>{nivel}</h3>
            <div className="cursos-grid">
              {lista.map((c) => (
                <div
                  key={c.Curso_Id}
                  className="curso-card curso-card-clickable"
                  onClick={() => setCursoSeleccionado(c)}
                  title="Ver el curso"
                >
                  <div className="curso-card-header">
                    <span className="curso-nombre">{c.Curso_Nombre}</span>
                    <span className="curso-seccion-badge">Sec. {c.Curso_Seccion}</span>
                  </div>
                  <div className="curso-card-body">
                    <div className="curso-info-item">
                      <span className="curso-info-label">Nivel educativo</span>
                      <span className="curso-info-valor">{c.Nivel_Educativo_Nombre}</span>
                    </div>
                    <div className="curso-info-item">
                      <span className="curso-info-label">Profesor jefe</span>
                      <span className="curso-info-valor">{c.Profesor_Jefe_Nombre || "—"}</span>
                    </div>
                    <div className="curso-info-item">
                      <span className="curso-info-label">Asignaturas activas</span>
                      <span className="curso-info-valor curso-asig-count">{c.Total_Asignaturas_Activas ?? 0}</span>
                    </div>
                  </div>
                  <div className="curso-card-footer">
                    <span className="curso-link">Ver curso →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
        </div>
      )}
    </div>
  );
}

export default Cursos;
