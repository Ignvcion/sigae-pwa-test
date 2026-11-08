import { useState } from "react";

function triggerDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generarReporteExcel(reporteId, titulo, periodo) {
  const content = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/></head>
<body>
<table border="1">
  <tr><th colspan="5" style="background:#1e3a5f;color:#ffffff;font-size:16px;height:35px;">COLEGIO JACQUES COUSTEAU - ${titulo.toUpperCase()}</th></tr>
  <tr><th colspan="5" style="background:#f8fafc;font-size:12px;color:#64748b;">Periodo Académico: ${periodo} · Fecha: ${new Date().toLocaleDateString('es-CL')}</th></tr>
  <tr style="background:#f1f5f9;font-weight:bold;">
    <th>#</th>
    <th>Estudiante / Detalle</th>
    <th>Curso</th>
    <th>Indicador / Registro</th>
    <th>Estado</th>
  </tr>
  <tr><td>1</td><td>Lucas Mateo Fernandez Vera</td><td>1° Básico A</td><td>Asistencia 98% (Excelente)</td><td>Regular</td></tr>
  <tr><td>2</td><td>Sofia Valentina Gonzalez Morales</td><td>2° Básico A</td><td>Asistencia 96% (Excelente)</td><td>Regular</td></tr>
  <tr><td>3</td><td>Martín Ignacio Silva Torres</td><td>1° Básico A</td><td>Asistencia 92% (Normal)</td><td>Regular</td></tr>
  <tr><td>4</td><td>Esperanza Penelope Gonzales Farias</td><td>1° Básico A</td><td>Asistencia 95% (Normal)</td><td>Regular</td></tr>
  <tr><td>5</td><td>Carlos Gonzales Farias</td><td>2° Básico A</td><td>Asistencia 97% (Excelente)</td><td>Regular</td></tr>
</table>
</body>
</html>`;
  const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8" });
  triggerDownloadBlob(blob, `${reporteId}_${periodo}.xls`);
}

function generarReportePdf(reporteId, titulo, periodo) {
  const lines = [
    `Reporte Oficial: ${titulo}`,
    `Periodo Academico: ${periodo}`,
    `Fecha de emision: ${new Date().toLocaleDateString('es-CL')}`,
    "------------------------------------------------------------------------------------",
    "1. Lucas Mateo Fernandez Vera     (1 Basico A)   - Registro Conforme (98%)",
    "2. Sofia Valentina Gonzalez Morales (2 Basico A) - Registro Conforme (96%)",
    "3. Martin Ignacio Silva Torres     (1 Basico A)   - Registro Conforme (92%)",
    "4. Esperanza Penelope Gonzales     (1 Basico A)   - Registro Conforme (95%)",
    "5. Carlos Gonzales Farias          (2 Basico A)   - Registro Conforme (97%)",
    "------------------------------------------------------------------------------------",
    "Total evaluados: 5 estudiantes. Metricas generales dentro del rango institucional.",
  ];

  const content = [
    'BT',
    '/F1 15 Tf',
    '50 780 Td',
    '(' + titulo.replace(/[()\\\\]/g, '') + ') Tj',
    '/F1 10 Tf',
    '0 -22 Td',
    '(Colegio Jacques Cousteau - Sistema de Gestion Academica Escolar) Tj',
    '0 -16 Td',
    '(Periodo ' + periodo + ' - Emision oficial: ' + new Date().toLocaleDateString('es-CL') + ') Tj',
    '0 -20 Td',
    '(------------------------------------------------------------------------------------) Tj',
  ];
  lines.slice(3).forEach((line) => {
    content.push('0 -18 Td');
    content.push('(' + line.replace(/[()\\\\]/g, '') + ') Tj');
  });
  content.push('0 -30 Td');
  content.push('(Documento institucional verificado por SIGAE - Valido para fines oficiales) Tj');
  content.push('ET');
  const stream = content.join('\n');

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj');
  objects.push('4 0 obj\n<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

  let pdf = '%PDF-1.4\n';
  const xref = [0];
  objects.forEach((obj) => {
    xref.push(pdf.length);
    pdf += obj + '\n';
  });
  const xrefStart = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  xref.slice(1).forEach((pos) => {
    pdf += String(pos).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n';
  const bytes = new TextEncoder().encode(pdf);
  const blob = new Blob([bytes], { type: "application/pdf" });
  triggerDownloadBlob(blob, `${reporteId}_${periodo}.pdf`);
}

function Reportes() {
  const [periodo, setPeriodo] = useState("2026");
  const [curso, setCurso] = useState("todos");
  const [descargando, setDescargando] = useState("");
  const [mensaje, setMensaje] = useState("");

  const handleDescargar = (reporteId, nombreReporte, formato) => {
    const key = `${reporteId}-${formato}`;
    setDescargando(key);
    setMensaje("");
    setTimeout(() => {
      try {
        if (formato === "pdf") {
          generarReportePdf(reporteId, nombreReporte, periodo);
        } else {
          generarReporteExcel(reporteId, nombreReporte, periodo);
        }
        setMensaje(`✅ ${nombreReporte} descargado exitosamente en formato ${formato.toUpperCase()}.`);
      } catch {
        setMensaje(`Error al generar ${nombreReporte}.`);
      } finally {
        setDescargando("");
        setTimeout(() => setMensaje(""), 4000);
      }
    }, 300);
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
                  onClick={() => handleDescargar(r.id, r.titulo, "pdf")}
                  disabled={descargandoPdf}
                  style={{
                    flex: "1 1 120px",
                    fontSize: "0.82rem",
                    padding: "8px 12px",
                    minHeight: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    cursor: descargandoPdf ? "wait" : "pointer",
                  }}
                >
                  {descargandoPdf ? "Generando..." : "📄 Descargar PDF"}
                </button>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => handleDescargar(r.id, r.titulo, "excel")}
                  disabled={descargandoExcel}
                  style={{
                    flex: "1 1 120px",
                    fontSize: "0.82rem",
                    padding: "8px 12px",
                    minHeight: "40px",
                    border: "1px solid #d1d5db",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    cursor: descargandoExcel ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {descargandoExcel ? "Generando..." : "📊 Descargar Excel"}
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
