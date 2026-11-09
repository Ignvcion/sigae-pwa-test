import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getEstudiantes,
  buscarEstudiantes,
  getCursos,
  editarEstudiante,
  getApoderados,
} from "../../services/api";
import ApoderadosEstudianteModal from "../../components/ApoderadosEstudianteModal";
import {
  validarDireccion,
  formatearDireccion,
  COLUMNAS_DIRECCION_ESTUDIANTE,
} from "../../utils/validaciones";
import { textoPeriodo } from "../../components/horarios/EtiquetaPeriodo";

// Campos de la dirección separada del estudiante (Incremento 3)
const CAMPOS_DIRECCION_FICHA = [
  { clave: "calle",  label: "Calle",                  maxLength: 100 },
  { clave: "numero", label: "Número",                 maxLength: 7 },
  { clave: "depto",  label: "Depto./Casa (opcional)", maxLength: 20 },
  { clave: "comuna", label: "Comuna",                 maxLength: 60 },
];

// CU35, CU37 y CU38: estados de registro académico. Egresado, En práctica y Retirado
// resultan de aplicar la situación final (RF61); CU38 permite pasar de En práctica a Egresado.
const ESTADOS_ACADEMICOS = ["Regular", "Irregular", "En práctica", "Egresado", "Retirado"];
// CU105: rutas de formación (la Técnica es solo una marca)
const RUTAS_FORMACION = ["Científica", "Humanística", "Técnica"];

function Estudiantes() {
  const { usuario } = useAuth();
  const esAdmin =
    usuario?.roles?.includes("Administrador") || usuario?.administradorTipo === "Super Admin";

  const [estudiantes, setEstudiantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [cursosDisponibles, setCursosDisponibles] = useState([]);
  const [estadosDisponibles, setEstadosDisponibles] = useState([]);
  const [orden, setOrden] = useState({ campo: "Estudiante_Nombre_Completo", ascendente: true });
  const [mensajeInfo, setMensajeInfo] = useState("");
  const [errorCarga, setErrorCarga] = useState("");

  // CU38: edición de curso asociado y estado académico — exclusivo de Administrador/Super Admin
  const [cursosOpciones, setCursosOpciones] = useState([]);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({
    Curso_Id: "", Estudiante_Estado_Academico: "", Estudiante_Ruta_Formacion: "", calle: "", numero: "", depto: "", comuna: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [msgErrorForm, setMsgErrorForm] = useState("");
  const [msgExitoForm, setMsgExitoForm] = useState("");

  // CU39: editar asociaciones (apoderado) sin modificar los datos personales
  const [apoderadosOpciones, setApoderadosOpciones] = useState([]);
  // RF57 / CU90: titular y hasta 4 suplentes (incluye el flujo de CU39)
  const [editandoAsociacion, setEditandoAsociacion] = useState(null);
  const [msgExitoAsociacion, setMsgExitoAsociacion] = useState("");

  useEffect(() => {
    cargarEstudiantes({}, true);
    if (esAdmin) {
      getCursos().then(setCursosOpciones).catch(() => {});
      getApoderados().then((data) => setApoderadosOpciones(Array.isArray(data) ? data : [])).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CU34 y CU35: listado con filtros opcionales de curso y estado académico, resueltos en el backend
  const cargarEstudiantes = async (filtros, esInicial = false) => {
    setLoading(true);
    setErrorCarga("");
    setMensajeInfo("");
    try {
      const data = await getEstudiantes(filtros);
      if (Array.isArray(data)) {
        setEstudiantes(data);
        // Las opciones de los selects se fijan solo en la carga inicial (sin filtros),
        // para que no se reduzcan a medida que se aplican filtros posteriores.
        if (esInicial) {
          setCursosDisponibles([...new Set(data.map((e) => e.Curso_Nombre).filter(Boolean))].sort());
          // El filtro ofrece siempre todos los estados (CU35, CU37) y además cualquier otro presente
          const presentes = data.map((e) => e.Estudiante_Estado_Academico).filter(Boolean);
          setEstadosDisponibles([...new Set([...ESTADOS_ACADEMICOS, ...presentes])]);
        }
      } else {
        // Excepciones: sin estudiantes registrados / sin coincidencias / docente sin cursos asignados
        setEstudiantes(data.estudiantes || []);
        setMensajeInfo(data.mensaje || "No hay estudiantes registrados.");
      }
    } catch (error) {
      // Error técnico en la consulta
      setErrorCarga(error.message || "No fue posible recuperar los registros");
    } finally {
      setLoading(false);
    }
  };

  const alternarOrden = (campo) => {
    setOrden((prev) => ({
      campo,
      ascendente: prev.campo === campo ? !prev.ascendente : true,
    }));
  };

  const aplicarFiltros = () => cargarEstudiantes({ curso: filtroCurso, estado: filtroEstado });

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroCurso("");
    setFiltroEstado("");
    cargarEstudiantes({});
  };

  // CU36: búsqueda por nombre completo o RUT, resuelta en el backend (independiente del filtro de CU35)
  const buscarPorCriterio = async () => {
    setLoading(true);
    setErrorCarga("");
    setMensajeInfo("");
    try {
      const data = await buscarEstudiantes(busqueda);
      if (Array.isArray(data)) {
        setEstudiantes(data);
      } else {
        // Excepciones: sin coincidencias / docente sin cursos asignados
        setEstudiantes(data.estudiantes || []);
        setMensajeInfo(data.mensaje || "No se encontraron estudiantes con el criterio ingresado");
      }
    } catch (error) {
      // Excepciones: criterio vacío o solo espacios / error técnico
      setErrorCarga(error.message || "No fue posible completar la consulta, reintente más tarde");
    } finally {
      setLoading(false);
    }
  };

  // El filtro por curso/estado y la búsqueda por criterio ya los resuelve el backend (CU35/CU36)
  const estudiantesFiltrados = [...estudiantes].sort((a, b) => {
    const factor = orden.ascendente ? 1 : -1;
    const valorA = a[orden.campo] ?? "";
    const valorB = b[orden.campo] ?? "";
    return String(valorA).localeCompare(String(valorB)) * factor;
  });

  const flechaOrden = (campo) => (orden.campo === campo ? (orden.ascendente ? " ↑" : " ↓") : "");

  // CU38: editar curso asociado y estado académico
  const abrirEdicion = (estudiante) => {
    setEditando(estudiante);
    setForm({
      Curso_Id: estudiante.Curso_Id ?? "",
      Estudiante_Estado_Academico: estudiante.Estudiante_Estado_Academico ?? "",
      Estudiante_Ruta_Formacion: estudiante.Estudiante_Ruta_Formacion ?? "",
      calle:  estudiante.Estudiante_Calle  ?? "",
      numero: estudiante.Estudiante_Numero ?? "",
      depto:  estudiante.Estudiante_Depto  ?? "",
      comuna: estudiante.Estudiante_Comuna ?? "",
    });
    setMsgErrorForm("");
    setMsgExitoForm("");
  };

  const cerrarEdicion = () => setEditando(null);

  const handleSubmitEdicion = async (e) => {
    e.preventDefault();
    setMsgErrorForm("");
    setMsgExitoForm("");

    // Dirección: se valida y envía si se ingresó (fichas antiguas pueden no tenerla)
    const incluyeDireccion = CAMPOS_DIRECCION_FICHA.some(({ clave }) => String(form[clave]).trim() !== "");
    if (incluyeDireccion) {
      const erroresDireccion = Object.values(validarDireccion(form));
      if (erroresDireccion.length > 0) {
        setMsgErrorForm(erroresDireccion[0]);
        return;
      }
    }

    setGuardando(true);
    try {
      const data = await editarEstudiante(editando.Estudiante_Id, {
        Curso_Id: Number(form.Curso_Id),
        Estudiante_Estado_Academico: form.Estudiante_Estado_Academico,
        Estudiante_Ruta_Formacion: form.Estudiante_Ruta_Formacion || null,
        ...(incluyeDireccion && Object.fromEntries(
          CAMPOS_DIRECCION_FICHA.map(({ clave }) => [COLUMNAS_DIRECCION_ESTUDIANTE[clave], form[clave]])
        )),
      });
      // CU38 - Excepción "Sin modificaciones": el backend responde sin objeto "estudiante"
      setMsgExitoForm(data.mensaje || "Ficha actualizada correctamente");
      await cargarEstudiantes({ curso: filtroCurso, estado: filtroEstado });
    } catch (error) {
      // CU38 - Excepción "Curso no existe o inactivo"
      setMsgErrorForm(error.message || "No fue posible actualizar la ficha");
    } finally {
      setGuardando(false);
    }
  };

  // CU39 / CU90: editar los apoderados asociados sin modificar los datos personales del estudiante
  const abrirEdicionAsociacion = (estudiante) => {
    setMsgExitoAsociacion("");
    setEditandoAsociacion(estudiante);
  };

  const alGuardarAsociacion = async (mensaje) => {
    setEditandoAsociacion(null);
    setMsgExitoAsociacion(mensaje);
    await cargarEstudiantes({ curso: filtroCurso, estado: filtroEstado });
  };

  if (loading) {
    return (
      <div className="usuarios-container">
        <p>Cargando estudiantes...</p>
      </div>
    );
  }

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Estudiantes</h1>
        <p>Listado de estudiantes registrados en el sistema</p>
      </div>

      {/* CU36: búsqueda por nombre completo o RUT */}
      <form
        className="usuarios-filtros"
        onSubmit={(e) => { e.preventDefault(); buscarPorCriterio(); }}
      >
        <input
          type="text"
          className="usuarios-search"
          placeholder="Buscar por nombre o RUT..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button type="submit" className="btn-roles">Buscar</button>
      </form>

      {/* CU35: filtro por curso y estado académico */}
      <div className="usuarios-filtros">
        <select
          className="usuarios-select"
          value={filtroCurso}
          onChange={(e) => setFiltroCurso(e.target.value)}
        >
          <option value="">Todos los cursos</option>
          {cursosDisponibles.map((curso) => (
            <option key={curso} value={curso}>{curso}</option>
          ))}
        </select>
        <select
          className="usuarios-select"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {estadosDisponibles.map((estado) => (
            <option key={estado} value={estado}>{estado}</option>
          ))}
        </select>
        <button type="button" className="btn-roles" onClick={aplicarFiltros}>
          Filtrar
        </button>
        <button type="button" className="btn-roles" onClick={limpiarFiltros}>
          Limpiar
        </button>
      </div>

      {msgExitoAsociacion && (
        <div className="success-message cit-exito">
          <span>{msgExitoAsociacion}</span>
          <button type="button" className="btn-cerrar" onClick={() => setMsgExitoAsociacion("")} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!errorCarga && mensajeInfo && (
        <div className="usuarios-empty">{mensajeInfo}</div>
      )}

      {!errorCarga && !mensajeInfo && (
        <>
          {estudiantesFiltrados.length === 0 ? (
            <div className="usuarios-empty">No se encontraron estudiantes</div>
          ) : (
            <table className="tabla-usuarios">
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ cursor: "pointer" }} onClick={() => alternarOrden("Estudiante_Nombre_Completo")}>
                    Nombre{flechaOrden("Estudiante_Nombre_Completo")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => alternarOrden("Estudiante_RUT")}>
                    RUT{flechaOrden("Estudiante_RUT")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => alternarOrden("Curso_Nombre")}>
                    Curso{flechaOrden("Curso_Nombre")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => alternarOrden("Estudiante_Estado_Academico")}>
                    Estado{flechaOrden("Estudiante_Estado_Academico")}
                  </th>
                  <th>Dirección</th>
                  {esAdmin && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {estudiantesFiltrados.map((e, idx) => (
                  <tr key={e.Estudiante_Id}>
                    <td>{idx + 1}</td>
                    <td>{e.Estudiante_Nombre_Completo}</td>
                    <td>{e.Estudiante_RUT}</td>
                    <td>{e.Curso_Nombre}</td>
                    <td>
                      {e.Estudiante_Estado_Academico === "Regular" ? (
                        <span className="badge-activo">Regular</span>
                      ) : (
                        <span className="badge-inactivo">{e.Estudiante_Estado_Academico}</span>
                      )}
                    </td>
                    <td>{formatearDireccion(e, COLUMNAS_DIRECCION_ESTUDIANTE) || "—"}</td>
                    {esAdmin && (
                      <td>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button className="btn-roles" onClick={() => abrirEdicion(e)}>
                            Editar ficha
                          </button>
                          <button className="btn-roles" onClick={() => abrirEdicionAsociacion(e)}>
                            Apoderados
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* CU38: modal de edición de curso asociado y estado académico */}
      {editando && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="form-card" style={{ width: "460px", maxWidth: "95vw" }}>
            <h2 style={{ marginBottom: "4px" }}>Editar ficha del estudiante</h2>
            <p style={{ color: "#64748b", marginBottom: "20px" }}>
              <strong>{editando.Estudiante_Nombre_Completo}</strong>
            </p>

            <form onSubmit={handleSubmitEdicion} className="cambiar-pwd-form">
              <div className="campo-pwd">
                <label>Curso asociado</label>
                <select
                  className="usuarios-select"
                  value={form.Curso_Id}
                  onChange={(e) => setForm((f) => ({ ...f, Curso_Id: e.target.value }))}
                  style={{ width: "100%" }}
                >
                  <option value="">Selecciona un curso...</option>
                  {cursosOpciones.map((c) => (
                    <option key={c.Curso_Id} value={c.Curso_Id}>{c.Curso_Nombre}{textoPeriodo(c.Curso_Periodo_Lectivo, c.Curso_Periodo_Estado)}</option>
                  ))}
                </select>
              </div>

              <div className="campo-pwd">
                <label>Estado académico</label>
                <select
                  className="usuarios-select"
                  value={form.Estudiante_Estado_Academico}
                  onChange={(e) => setForm((f) => ({ ...f, Estudiante_Estado_Academico: e.target.value }))}
                  style={{ width: "100%" }}
                >
                  {ESTADOS_ACADEMICOS.map((estado) => (
                    <option key={estado} value={estado}>{estado}</option>
                  ))}
                </select>
              </div>

              {/* RF23 / CU105: ruta de formación, decidida en 2° medio */}
              <div className="campo-pwd">
                <label>Ruta de formación</label>
                <select
                  className="usuarios-select"
                  value={form.Estudiante_Ruta_Formacion}
                  onChange={(e) => setForm((f) => ({ ...f, Estudiante_Ruta_Formacion: e.target.value }))}
                  style={{ width: "100%" }}
                >
                  <option value="">Sin ruta</option>
                  {RUTAS_FORMACION.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="etiquetas-ayuda">Solo para 2°, 3° y 4° medio. La Técnica no afecta horarios ni electivos.</span>
              </div>

              {/* Incremento 3: dirección separada del estudiante */}
              {CAMPOS_DIRECCION_FICHA.map(({ clave, label, maxLength }) => (
                <div className="campo-pwd" key={clave}>
                  <label>{label}</label>
                  <input
                    maxLength={maxLength}
                    value={form[clave]}
                    onChange={(e) => setForm((f) => ({ ...f, [clave]: e.target.value }))}
                  />
                </div>
              ))}

              {msgExitoForm && <div className="msg-exito">{msgExitoForm}</div>}
              {msgErrorForm && <div className="msg-error-form">{msgErrorForm}</div>}

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="submit" className="btn-primario" disabled={guardando}>
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  className="btn-desactivar"
                  onClick={cerrarEdicion}
                  disabled={guardando}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CU39 / CU90: apoderado titular y suplentes, sin modificar datos personales */}
      {editandoAsociacion && (
        <ApoderadosEstudianteModal
          estudiante={editandoAsociacion}
          apoderados={apoderadosOpciones}
          onClose={() => setEditandoAsociacion(null)}
          onGuardado={alGuardarAsociacion}
        />
      )}
    </div>
  );
}

export default Estudiantes;
