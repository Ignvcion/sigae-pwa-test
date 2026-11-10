import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getEstudiantesAsociados, getHorarioEstudiante } from "../../services/api";
import HorarioSemanal from "../../components/horarios/HorarioSemanal";

// Horario semanal del curso de cada estudiante asociado al apoderado
function HorarioEstudiante() {
  const { usuario } = useAuth();

  const [estudiantes, setEstudiantes] = useState([]);
  const [estudianteId, setEstudianteId] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensajeInfo, setMensajeInfo] = useState("");

  const cargarHorario = async (id) => {
    setEstudianteId(id);
    setDatos(null);
    setError("");
    setCargando(true);
    try {
      setDatos(await getHorarioEstudiante(id));
    } catch (err) {
      setError(err.message || "No fue posible cargar el horario, reintente más tarde");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const cargarEstudiantes = async () => {
      try {
        const data = await getEstudiantesAsociados(usuario?.id);
        const lista = Array.isArray(data) ? data : data?.estudiantes || [];
        setEstudiantes(lista);
        if (lista.length === 0) {
          setMensajeInfo(data?.mensaje || "No existen estudiantes asociados a la cuenta");
        } else {
          cargarHorario(lista[0].Estudiante_Id);
        }
      } catch (err) {
        setError(err.message || "No fue posible cargar los estudiantes asociados");
      } finally {
        setCargandoLista(false);
      }
    };
    cargarEstudiantes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clases = (datos?.horario || []).map((h, idx) => ({
    id: h.id ?? h.Horario_Asignatura_Id ?? idx,
    dia: h.dia || h.Horario_Dia_Semana,
    horaInicio: h.horaInicio || h.hora_inicio || h.Horario_Hora_Inicio || "08:00:00",
    horaFin: h.horaFin || h.hora_fin || h.Horario_Hora_Fin || "08:45:00",
    titulo: h.asignatura || h.Asignatura_Nombre,
    lineas: [h.docente || h.Docente_Nombre || "Docente por asignar"],
    colorKey: h.asignaturaId ?? h.Asignatura_Id ?? h.asignatura,
    estado: h.estado || h.Horario_Estado || "Activo",
    pendiente: Boolean(Number(h.pendiente)),
  }));

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Horario del Alumno</h1>
        <p>Horario semanal de clases del curso de tus estudiantes asociados</p>
      </div>

      {cargandoLista && <p>Cargando estudiantes...</p>}

      {!cargandoLista && mensajeInfo && <div className="usuarios-empty">{mensajeInfo}</div>}

      {estudiantes.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {estudiantes.map((e) => {
            const activo = e.Estudiante_Id === estudianteId;
            return (
              <button
                key={e.Estudiante_Id}
                type="button"
                onClick={() => !activo && cargarHorario(e.Estudiante_Id)}
                style={{
                  padding: "0.5rem 0.9rem", borderRadius: 20, cursor: "pointer",
                  border: `1px solid ${activo ? "#1e3a5f" : "#d1d5db"}`,
                  background: activo ? "#1e3a5f" : "#fff",
                  color: activo ? "#fff" : "#374151",
                  fontWeight: activo ? 700 : 500,
                }}
              >
                {e.Estudiante_Nombre_Completo}
                <span style={{ opacity: 0.75, fontWeight: 400 }}> · {e.Curso_Nombre}</span>
              </button>
            );
          })}
        </div>
      )}

      {datos?.estudiante && (
        <p style={{ margin: "0 0 1rem", color: "#374151" }}>
          <strong>{datos.estudiante.nombre}</strong> — {datos.estudiante.curso}
        </p>
      )}

      {cargando && <p>Cargando horario...</p>}

      {!cargando && error && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>{error}</div>
      )}

      {!cargando && !error && datos && clases.length === 0 && (
        <div className="usuarios-empty">{datos.mensaje || "No hay horario disponible para mostrar"}</div>
      )}

      {!cargando && !error && clases.length > 0 && <HorarioSemanal clases={clases} />}
    </div>
  );
}

export default HorarioEstudiante;
