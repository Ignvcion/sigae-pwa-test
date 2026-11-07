import { useState } from "react";

function Reportes() {
  const [periodo, setPeriodo] = useState("2026");
  const [curso, setCurso] = useState("todos");
  const [descargando, setDescargando] = useState("");
  const [mensaje, setMensaje] = useState("");

  const handleDescargar = (nombreReporte, formato) => {
    setDescargando(`${nombreReporte}-${formato}`);
    setMensaje("");
    setTimeout(() => {
      setDescargando("");
      setMensaje(`✅ ${nombreReporte} generado exitosamente en formato ${formato.toUpperCase()}.`);
      setTimeout(() => setMensaje(""), 4000);
    }, 1000);
  };

  const REPORTES_DISPONIBLES = [
    {
      id: "asistencia",
      titulo: "Reporte de Asistencia Mensual",
      descripcion: "Detalle de inasistencias justificadas, atrasos y porcentaje de asistencia por curso.",
      icono: "📊",
      etiqueta: "Mensual",
    },
    {
      id: "calificaciones",
      titulo: "Boletín de Calificaciones",
      descripcion: "Notas parciales, promedios semestrales y asignaturas bajo promedio por nivel.",
      icono: "📝",
      etiqueta: "Semestral",
    },
    {
      id: "matricula",
      titulo: "Nómina Oficial de Matrícula",
      descripcion: "Listado oficial de estudiantes activos, RUT, fecha de matrícula y apoderados.",
      icono: "📋",
      etiqueta: "Oficial",
    },
    {
      id: "citaciones",
      titulo: "Historial de Citaciones a Apoderados",
      descripcion: "Consolidado de citaciones programadas, asistencias y compromisos adquiridos.",
      icono: "🤝",
      etiqueta: "Convivencia",
    },
    {
      id: "carga-docente",
      titulo: "Distribución de Carga Horaria",
      descripcion: "Horas pedagógicas y de planificación asignadas a cada docente por período.",
      icono: "🕐",
      etiqueta: "Docencia",
    },
    {
      id: "promocion",
      titulo: "Situación Final y Promoción",
      descripcion: "Alumnos promovidos, en riesgo de repitencia y aprobaciones anuales.",
      icono: "🎓",
      etiqueta: "Anual",
    },
  ];

  return (
    <div className="page-container" style={{ maxWidth: "1200px", margin: "0 auto", padding: "1rem" }}>
      <div className="page-header">
        <div>
          <h1>Reportes Institucionales</h1>
          <p>Consulta, exporta y descarga la información académica del establecimiento</p>
        </div>
      </div>

      {mensaje && (
        <div className="msg-exito" style={{ marginBottom: "1.5rem" }}>
          {mensaje}
        </div>
      )}

      {/* Métricas rápidas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "12px",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Asistencia General</span>
          <p style={{ margin: "4px 0 0", fontSize: "1.4rem", fontWeight: 700, color: "#16a34a" }}>94.2%</p>
        </div>
        <div style={{ background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Matrícula Activa</span>
          <p style={{ margin: "4px 0 0", fontSize: "1.4rem", fontWeight: 700, color: "#2563eb" }}>348</p>
        </div>
        <div style={{ background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Docentes Activos</span>
          <p style={{ margin: "4px 0 0", fontSize: "1.4rem", fontWeight: 700, color: "#7c3aed" }}>28</p>
        </div>
        <div style={{ background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Citaciones Realizadas</span>
          <p style={{ margin: "4px 0 0", fontSize: "1.4rem", fontWeight: 700, color: "#d97706" }}>86%</p>
        </div>
      </div>

      {/* Filtros */}
      <div
        className="usuarios-filtros"
        style={{
          background: "#fff",
          padding: "16px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ flex: 1, minWidth: "160px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
            Año Académico:
          </label>
          <select
            className="usuarios-select"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="2026">Período 2026</option>
            <option value="2025">Período 2025</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: "160px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
            Filtrar por Curso:
          </label>
          <select
            className="usuarios-select"
            value={curso}
            onChange={(e) => setCurso(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="todos">Todos los cursos</option>
            <option value="1">1° Básico A</option>
            <option value="2">2° Básico A</option>
            <option value="3">3° Básico A</option>
          </select>
        </div>
      </div>

      {/* Listado de Reportes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "16px",
        }}
      >
        {REPORTES_DISPONIBLES.map((r) => {
          const descargandoPdf = descargando === `${r.id}-pdf`;
          const descargandoExcel = descargando === `${r.id}-excel`;

          return (
            <div
              key={r.id}
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "14px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "1.8rem" }}>{r.icono}</span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      background: "#e0e7ff",
                      color: "#4338ca",
                      padding: "2px 8px",
                      borderRadius: "999px",
                    }}
                  >
                    {r.etiqueta}
                  </span>
                </div>
                <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem", color: "#1e293b" }}>{r.titulo}</h3>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b", lineHeight: 1.4 }}>{r.descripcion}</p>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "10px", borderTop: "1px solid #f1f5f9" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleDescargar(r.titulo, "pdf")}
                  disabled={Boolean(descargando)}
                  style={{
                    flex: "1 1 120px",
                    fontSize: "0.82rem",
                    padding: "8px 12px",
                    minHeight: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {descargandoPdf ? "Descargando..." : "📄 PDF"}
                </button>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => handleDescargar(r.titulo, "excel")}
                  disabled={Boolean(descargando)}
                  style={{
                    flex: "1 1 120px",
                    fontSize: "0.82rem",
                    padding: "8px 12px",
                    minHeight: "40px",
                    border: "1px solid #d1d5db",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {descargandoExcel ? "Descargando..." : "📊 Excel"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Reportes;
