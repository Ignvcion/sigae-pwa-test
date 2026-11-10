import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getHorarioDocente, getListaDocentes, getMiHorarioAtencion, getDisponibilidadDocente, getPIEDocente } from "../../services/api";
import { textoReparto } from "../../utils/cargaLectiva";
import ExportMenu from "../../components/ExportMenu";
import HorarioSemanal from "../../components/horarios/HorarioSemanal";
import AvisoTopes from "../../components/horarios/AvisoTopes";
import HorarioAtencionSemanal from "../../components/HorarioAtencionSemanal";
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

  const cargarAtencion = async () => {
    try {
      const data = await getMiHorarioAtencion();
      setAtencion(Array.isArray(data) ? data : data?.bloques || []);
    } catch {
      setAtencion([]); // el editor de abajo informa el error
    }
  };

  // CU107: indicador "debe horas" del docente (disponibilidad laboral frente a su carga semanal)
  const [resumenDisp, setResumenDisp] = useState(null);
  // Horas P.I.E. y regla 65/35 del docente
  const [pie, setPie] = useState(null);

  // CU43: horario semanal a partir de sus cursos asociados
  const cargarHorario = async (id) => {
    if (!id) return;
    setResumenDisp(null);
    setPie(null);
    getDisponibilidadDocente(id).then((d) => setResumenDisp(d?.resumen || null)).catch(() => {});
    getPIEDocente(id).then(setPie).catch(() => {});
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
    titulo: Number(h.electivo) === 1 ? `Electivo · ${h.asignatura}` : h.asignatura,
    lineas: [h.curso],
    colorKey: h.asignaturaId ?? h.asignatura,
    estado: h.estado,
    pendiente: Boolean(Number(h.pendiente)),
    electivo: Number(h.electivo) === 1,
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
  // Horas P.I.E.: bloques reservados en su horario (no admiten clases)
  const bloquesPIE = (pie?.bloques || []).map((b) => ({
    id: `pie-${b.dia}-${b.bloqueId}`,
    dia: b.dia,
    horaInicio: b.horaInicio,
    horaFin: b.horaFin,
    titulo: "Horas P.I.E.",
    lineas: ["Programa de Integración Escolar"],
    colorKey: "Horas P.I.E.",
  }));
  const grilla = [...clases, ...bloquesAtencion, ...bloquesPIE];


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

      {docenteId && resumenDisp?.horasAdeudadas > 0 && (
        <div className="aviso-debe-horas" role="status">
          ⚠ {esAdmin ? "El docente debe" : "Debes"} {resumenDisp.horasAdeudadas} h: {esAdmin ? "está disponible" : "estás disponible"}{" "}
          {resumenDisp.horasDisponibles} h a la semana y su carga horaria semanal es de {resumenDisp.cargaSemanal} h
          (período {resumenDisp.periodo}).
        </div>
      )}

      {docenteId && pie?.reparto && (
        <div className={`resumen-65-35${pie.clasesAsignadas > pie.reparto.maxLectivas ? " resumen-65-35--excede" : ""}`} role="status">
          <strong>Regla 65/35:</strong> {textoReparto(pie.reparto)}.{" "}
          Clases asignadas en {pie.periodo}: <strong>{pie.clasesAsignadas} de {pie.reparto.maxLectivas}</strong>.
          {pie.horasPIE > 0 && ` Horas P.I.E. ubicadas en el horario: ${pie.bloques.length} de ${pie.horasPIE}.`}
        </div>
      )}

      {!loading && !errorCarga && (esAdmin ? docenteId && (!mensajeInfo || bloquesPIE.length > 0) : true) && grilla.length > 0 && (
        <HorarioSemanal clases={grilla} />
      )}

      {!loading && !avisoCerrado && (
        <AvisoTopes topes={topes} onCerrar={() => setAvisoCerrado(true)} />
      )}

      {/* RF55 / CU87, CU88: el docente configura su horario de atención (también en su perfil) */}
      {!esAdmin && (
        <div className="perfil-card" style={{ marginTop: 24 }}>
          <h2>Horario de atención de apoderados</h2>
          <p className="etiquetas-ayuda" style={{ marginBottom: 12 }}>
            Tramos en que atiendes apoderados. Ellos solicitan citaciones de 30 minutos dentro de estos tramos.
          </p>
          <HorarioAtencionSemanal onGuardado={(bloques) => setAtencion(bloques)} />
        </div>
      )}
    </div>
  );
}

export default MiHorario;
