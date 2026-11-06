import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getHorarioDocente, getListaDocentes, getMiHorarioAtencion } from "../../services/api";
import ExportMenu from "../../components/ExportMenu";
import HorarioSemanal from "../../components/horarios/HorarioSemanal";
import AvisoTopes from "../../components/horarios/AvisoTopes";
import HorarioAtencionPanel from "../../components/horarios/HorarioAtencionPanel";
import { detectarTopes } from "../../utils/horarios";

function MiHorario() {
  const { usuario, rolActivo } = useAuth();
  const esAdmin =
    (rolActivo || usuario?.roles?.[0]) === "Administrador" ||
    usuario?.administradorTipo === "Super Admin";

  const [docentes, setDocentes] = useState([]);
  const [docenteId, setDocenteId] = useState(esAdmin ? "" : usuario?.id ?? "");
  const [horario, setHorario] = useState([]);
  const [loading, setLoading] = useState(!esAdmin);
  const [mensajeInfo, setMensajeInfo] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [avisoCerrado, setAvisoCerrado] = useState(false);

  // RF55 / CU87–CU88: horario de atención de apoderados (solo el propio docente)
  const [atencion, setAtencion] = useState([]);
  const [cargandoAtencion, setCargandoAtencion] = useState(!esAdmin);
  const [errorAtencion, setErrorAtencion] = useState("");
  const [msgAtencion, setMsgAtencion] = useState("");

  const cargarAtencion = async () => {
    setCargandoAtencion(true);
    setErrorAtencion("");
    try {
      const data = await getMiHorarioAtencion();
      setAtencion(Array.isArray(data) ? data : data?.bloques || []);
    } catch (error) {
      setErrorAtencion(error.message || "No fue posible cargar tu horario de atención");
    } finally {
      setCargandoAtencion(false);
    }
  };

  // CU43: horario semanal a partir de sus cursos asociados
  const cargarHorario = async (id) => {
    if (!id) return;
    setLoading(true);
    setErrorCarga("");
    setMensajeInfo("");
    setAvisoCerrado(false);
    try {
      const data = await getHorarioDocente(id);
      if (Array.isArray(data)) {
        setHorario(data);
      } else {
        // Excepción "Horario sin planificar"
        setHorario(data.horario || []);
        setMensajeInfo(data.mensaje || "No hay horario disponible para mostrar");
      }
    } catch (error) {
      // Excepciones "Docente no existe" y "Error técnico"
      setErrorCarga(error.message || "No fue posible cargar el horario, reintente más tarde");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (esAdmin) {
      getListaDocentes().then(setDocentes).catch(() => {});
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cargarHorario(usuario?.id);
      cargarAtencion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seleccionarDocente = (id) => {
    setDocenteId(id);
    setHorario([]);
    setMensajeInfo("");
    setErrorCarga("");
    if (id) cargarHorario(id);
  };

  const clases = horario.map((h, idx) => ({
    id: h.id ?? idx,
    dia: h.dia,
    horaInicio: h.horaInicio,
    horaFin: h.horaFin,
    titulo: h.asignatura,
    lineas: [h.curso],
    colorKey: h.asignaturaId ?? h.asignatura,
    estado: h.estado,
    pendiente: Boolean(Number(h.pendiente)),
  }));
  const topes = detectarTopes(clases);

  // Los bloques de atención se dibujan en la grilla junto a las clases, con su propio color
  const bloquesAtencion = esAdmin ? [] : atencion.map((b) => ({
    id: `atencion-${b.Horario_Atencion_Id}`,
    dia: b.Horario_Atencion_Dia_Semana,
    horaInicio: b.Horario_Atencion_Hora_Inicio,
    horaFin: b.Horario_Atencion_Hora_Fin,
    titulo: "Atención de apoderados",
    lineas: [],
    colorKey: "Atención de apoderados",
  }));
  const grilla = [...clases, ...bloquesAtencion];

  const alCambiarAtencion = (mensaje) => {
    setMsgAtencion(mensaje);
    cargarAtencion();
  };

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>{esAdmin ? "Horario de Docente" : "Mi Horario"}</h1>
        <p>Horario semanal a partir de los cursos y asignaturas asociados</p>
      </div>

      {esAdmin && (
        <div className="usuarios-filtros" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <select
            className="usuarios-select"
            value={docenteId}
            onChange={(e) => seleccionarDocente(e.target.value)}
          >
            <option value="">Selecciona un docente...</option>
            {docentes.map((d) => (
              <option key={d.Usuario_Id} value={d.Usuario_Id}>{d.Usuario_Nombre_Completo}</option>
            ))}
          </select>

          {/* CU61: exportar el horario del docente seleccionado */}
          {docenteId && (
            <ExportMenu
              label="Exportar horario"
              url={`/api/horarios/exportar/docente/${docenteId}`}
              filenameBase={`horario_docente_${docenteId}`}
            />
          )}
        </div>
      )}

      {loading && <p>Cargando horario...</p>}

      {!loading && esAdmin && !docenteId && (
        <div className="usuarios-empty">Selecciona un docente para ver su horario</div>
      )}

      {!loading && errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!loading && !errorCarga && mensajeInfo && (
        <div className="usuarios-empty">{mensajeInfo}</div>
      )}

      {!loading && !errorCarga && (esAdmin ? docenteId && !mensajeInfo : true) && grilla.length > 0 && (
        <HorarioSemanal clases={grilla} />
      )}

      {!loading && !avisoCerrado && (
        <AvisoTopes topes={topes} onCerrar={() => setAvisoCerrado(true)} />
      )}

      {!esAdmin && (
        <>
          {msgAtencion && (
            <div className="success-message cit-exito">
              <span>{msgAtencion}</span>
              <button type="button" className="btn-cerrar" onClick={() => setMsgAtencion("")} aria-label="Cerrar aviso">✕</button>
            </div>
          )}
          <HorarioAtencionPanel
            bloques={atencion}
            cargando={cargandoAtencion}
            error={errorAtencion}
            onCambio={alCambiarAtencion}
          />
        </>
      )}
    </div>
  );
}

export default MiHorario;
