// CU 60 — Exportando horario maestro
// CU 61 — Exportando horario por docente
// CU 62 — Exportando horario por curso

const pool = require('../config/db');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');

const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

function ordenarFilas(filas) {
  return filas.sort((a, b) => {
    const da = DIAS_ORDEN.indexOf(a.dia);
    const db = DIAS_ORDEN.indexOf(b.dia);
    if (da !== db) return da - db;
    return String(a.hora_inicio).localeCompare(String(b.hora_inicio));
  });
}

function hhmm(t) {
  return t ? String(t).slice(0, 5) : '';
}

//  OBTENCIÓN DE DATOS

// CU 60 — datos del horario maestro (todos los cursos, solo bloques activos)
async function fetchMaestro() {
  const [rows] = await pool.execute(`
    SELECT
      ha.Horario_Asignatura_Dia_Semana AS dia,
      bh.Bloque_Horario_Hora_Inicio    AS hora_inicio,
      bh.Bloque_Horario_Hora_Fin       AS hora_fin,
      c.Curso_Nombre                   AS curso,
      a.Asignatura_Nombre              AS asignatura,
      u.Usuario_Nombre_Completo        AS docente
    FROM horario_asignatura ha
    JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
    JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
    JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
    LEFT JOIN usuario   u  ON u.Usuario_Id         = ha.Usuario_Id
    WHERE ha.Horario_Asignatura_Estado = 'Activo'
    ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana,'Lunes','Martes','Miércoles','Jueves','Viernes'),
             bh.Bloque_Horario_Hora_Inicio, c.Curso_Nombre
  `);
  return ordenarFilas(rows);
}

// CU 61 — datos del horario de un docente específico
async function fetchPorDocente(usuarioId) {
  const [[docente]] = await pool.execute(
    `SELECT Usuario_Nombre_Completo FROM usuario WHERE Usuario_Id = ? AND Es_Docente = 1`,
    [usuarioId]
  );
  if (!docente) return { docente: null, filas: [] };

  const [rows] = await pool.execute(
    `SELECT
      ha.Horario_Asignatura_Dia_Semana AS dia,
      bh.Bloque_Horario_Hora_Inicio    AS hora_inicio,
      bh.Bloque_Horario_Hora_Fin       AS hora_fin,
      c.Curso_Nombre                   AS curso,
      a.Asignatura_Nombre              AS asignatura
     FROM horario_asignatura ha
     JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
     JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
     JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
     WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'
     ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana,'Lunes','Martes','Miércoles','Jueves','Viernes'),
              bh.Bloque_Horario_Hora_Inicio`,
    [usuarioId]
  );
  return { docente: docente.Usuario_Nombre_Completo, filas: ordenarFilas(rows) };
}

// CU 62 — datos del horario de un curso específico
async function fetchPorCurso(cursoId) {
  const [[curso]] = await pool.execute(
    `SELECT Curso_Nombre FROM curso WHERE Curso_Id = ?`,
    [cursoId]
  );
  if (!curso) return { curso: null, filas: [] };

  const [rows] = await pool.execute(
    `SELECT
      ha.Horario_Asignatura_Dia_Semana AS dia,
      bh.Bloque_Horario_Hora_Inicio    AS hora_inicio,
      bh.Bloque_Horario_Hora_Fin       AS hora_fin,
      a.Asignatura_Nombre              AS asignatura,
      u.Usuario_Nombre_Completo        AS docente
     FROM horario_asignatura ha
     JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
     JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
     LEFT JOIN usuario   u  ON u.Usuario_Id         = ha.Usuario_Id
     WHERE ha.Curso_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'
     ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana,'Lunes','Martes','Miércoles','Jueves','Viernes'),
              bh.Bloque_Horario_Hora_Inicio`,
    [cursoId]
  );
  return { curso: curso.Curso_Nombre, filas: ordenarFilas(rows) };
}

//  RENDERIZADORES (uno por formato)

function renderPDF(res, { titulo, columnas, filas, filename }) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f').text(titulo, { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
    .text(`Generado el ${new Date().toLocaleString('es-CL')}`, { align: 'center' });
  doc.moveDown(1);

  const startX = doc.page.margins.left;
  let y = doc.y;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = usableWidth / columnas.length;
  const rowHeight = 22;

  const drawHeader = () => {
    doc.rect(startX, y, usableWidth, rowHeight).fill('#1e3a5f');
    doc.font('Helvetica-Bold').fontSize(10);
    columnas.forEach((col, i) => {
      doc.fillColor('#ffffff').text(col.label, startX + i * colWidth + 4, y + 6, { width: colWidth - 8 });
    });
    y += rowHeight;
  };

  drawHeader();
  doc.font('Helvetica').fontSize(9);

  filas.forEach((fila, idx) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
      y = doc.page.margins.top;
      drawHeader();
      doc.font('Helvetica').fontSize(9);
    }
    if (idx % 2 === 0) {
      doc.rect(startX, y, usableWidth, rowHeight).fill('#f8fafc');
    }
    columnas.forEach((col, i) => {
      doc.fillColor('#111827').text(String(col.value(fila) ?? ''), startX + i * colWidth + 4, y + 6, {
        width: colWidth - 8,
      });
    });
    y += rowHeight;
  });

  doc.end();
}

async function renderExcel(res, { titulo, columnas, filas, filename }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGAE';
  wb.created = new Date();
  const ws = wb.addWorksheet((titulo || 'Horario').slice(0, 31));

  ws.columns = columnas.map((c) => ({ header: c.label, key: c.key, width: c.width || 20 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  ws.getRow(1).alignment = { vertical: 'middle' };

  filas.forEach((fila) => {
    const rowData = {};
    columnas.forEach((c) => { rowData[c.key] = c.value(fila) ?? ''; });
    ws.addRow(rowData);
  });

  ws.eachRow((row, i) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
    if (i > 1 && i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// CSV (Glosario 6.1.11 - formatos estándares): separado por ';' (Excel en español
// usa ';' como separador de listas), UTF-8 con BOM para que Excel respete tildes y ñ.
function escaparCSV(valor) {
  const texto = String(valor ?? '');
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function renderCSV(res, { columnas, filas, filename }) {
  const lineas = [
    columnas.map((c) => escaparCSV(c.label)).join(';'),
    ...filas.map((fila) => columnas.map((c) => escaparCSV(c.value(fila))).join(';')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send('\uFEFF' + lineas.join('\r\n'));
}

// Los valores vienen de la BD (nombres de cursos, docentes, asignaturas...) y se
// renderizan en Chromium dentro del servidor: siempre se escapan como texto para
// que nadie pueda inyectar HTML (p. ej. un <img src> hacia la red interna).
function escaparHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHTML({ titulo, columnas, filas }) {
  const rowsHTML = filas.map((fila, i) => `
    <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}">
      ${columnas.map((c) => `<td style="padding:6px 10px;border:1px solid #e5e7eb;font-size:12px;color:#111827;">${escaparHTML(c.value(fila))}</td>`).join('')}
    </tr>
  `).join('');

  return `
    <html>
      <head><meta charset="utf-8" />
      <style>
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 24px; background: #fff; }
        h1 { color: #1e3a5f; font-size: 18px; margin: 0 0 4px; }
        .sub { color: #6b7280; font-size: 11px; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left; font-size: 12px; }
      </style>
      </head>
      <body>
        <h1>${escaparHTML(titulo)}</h1>
        <div class="sub">Generado el ${new Date().toLocaleString('es-CL')}</div>
        <table>
          <thead><tr>${columnas.map((c) => `<th>${escaparHTML(c.label)}</th>`).join('')}</tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </body>
    </html>
  `;
}

async function renderPNG(res, { titulo, columnas, filas, filename }) {
  const html = buildHTML({ titulo, columnas, filas });
  // PUPPETEER_EXECUTABLE_PATH: Chromium del sistema (producción: /usr/bin/chromium,
  // instalado con apt). Sin la variable, Puppeteer usa el navegador que descargó
  // npm install, como en desarrollo.
  const browser = await puppeteer.launch({
    ...(process.env.PUPPETEER_EXECUTABLE_PATH && { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    // El HTML es autocontenido: se bloquea cualquier petición de red de la página.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('data:') ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    const buffer = await page.screenshot({ fullPage: true, type: 'png' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.png"`);
    res.send(buffer);
  } finally {
    await browser.close();
  }
}

async function responder(res, formato, payload) {
  const formatosValidos = ['pdf', 'excel', 'csv', 'png'];
  if (!formatosValidos.includes(formato)) {
    return res.status(400).json({ error: 'Formato inválido. Use: pdf, excel, csv o png' });
  }
  if (formato === 'pdf')   return renderPDF(res, payload);
  if (formato === 'excel') return renderExcel(res, payload);
  if (formato === 'csv')   return renderCSV(res, payload);
  if (formato === 'png')   return renderPNG(res, payload);
}

//  ENDPOINTS

// GET /api/horarios/exportar/maestro?formato=pdf|excel|csv|png
const exportarMaestro = async (req, res) => {
  const formato = (req.query.formato || 'pdf').toLowerCase();

  // CU60 - Excepción "Error base de datos": falla la consulta antes de llegar a generar el archivo
  let filas;
  try {
    filas = await fetchMaestro();
  } catch (error) {
    console.error('Error en exportarMaestro (BD):', error);
    return res.status(500).json({ error: 'Ocurrió un error en la base de datos al generar el horario maestro' });
  }

  // CU60 - Excepción "No existe horario"
  if (filas.length === 0) {
    return res.status(404).json({ error: 'No existe horario maestro disponible' });
  }

  const columnas = [
    { key: 'dia',        label: 'Día',        value: (f) => f.dia,                                        width: 12 },
    { key: 'hora',       label: 'Horario',    value: (f) => `${hhmm(f.hora_inicio)} - ${hhmm(f.hora_fin)}`, width: 16 },
    { key: 'curso',      label: 'Curso',      value: (f) => f.curso,                                      width: 18 },
    { key: 'asignatura', label: 'Asignatura', value: (f) => f.asignatura,                                 width: 20 },
    { key: 'docente',    label: 'Docente',    value: (f) => f.docente || '—',                             width: 26 },
  ];

  // CU60 - Excepción "Error en la generación del archivo": la descarga se cancela (no se envía archivo)
  try {
    await responder(res, formato, {
      titulo: 'Horario Maestro Institucional — SIGAE',
      columnas,
      filas,
      filename: 'horario_maestro',
    });
  } catch (error) {
    console.error('Error en exportarMaestro (archivo):', error);
    if (!res.headersSent) res.status(500).json({ error: 'Ocurrió un error al generar el archivo. La descarga fue cancelada' });
  }
};

// GET /api/horarios/exportar/docente/:usuarioId?formato=pdf|excel|csv|png
// CU61: actor es Super Administrador o Administrador; se extiende como
// autoservicio para que un Docente exporte únicamente su propio horario.
const exportarPorDocente = async (req, res) => {
  const { usuarioId } = req.params;
  const formato = (req.query.formato || 'pdf').toLowerCase();
  const { roles, id: solicitanteId } = req.user;
  const esAdmin = roles.includes('Administrador');
  const esDocente = roles.includes('Docente') && !esAdmin;

  if (!esAdmin && !(esDocente && Number(usuarioId) === solicitanteId)) {
    return res.status(403).json({ error: 'No tienes permiso para exportar este horario' });
  }

  // CU61 - Excepción "No se selecciona docente": validado antes de tocar la BD
  if (!usuarioId || usuarioId === 'null' || usuarioId === 'undefined' || isNaN(Number(usuarioId))) {
    return res.status(400).json({ error: 'Debes seleccionar un docente para exportar su horario' });
  }

  // CU61 - Excepción "Error de base de datos"
  let docente, filas;
  try {
    ({ docente, filas } = await fetchPorDocente(usuarioId));
  } catch (error) {
    console.error('Error en exportarPorDocente (BD):', error);
    return res.status(500).json({ error: 'Ocurrió un error en la base de datos al generar el horario del docente' });
  }

  if (!docente) {
    return res.status(404).json({ error: 'Docente no encontrado' });
  }
  // CU61 - Excepción "Docente sin horario"
  if (filas.length === 0) {
    return res.status(404).json({ error: 'El docente no posee asignaciones horarias' });
  }

  const columnas = [
    { key: 'dia',        label: 'Día',        value: (f) => f.dia,                                        width: 12 },
    { key: 'hora',       label: 'Horario',    value: (f) => `${hhmm(f.hora_inicio)} - ${hhmm(f.hora_fin)}`, width: 16 },
    { key: 'curso',      label: 'Curso',      value: (f) => f.curso,                                      width: 18 },
    { key: 'asignatura', label: 'Asignatura', value: (f) => f.asignatura,                                 width: 22 },
  ];

  // CU61 - Excepción "Error al generar archivo"
  try {
    await responder(res, formato, {
      titulo: `Horario de ${docente} — SIGAE`,
      columnas,
      filas,
      filename: `horario_docente_${usuarioId}`,
    });
  } catch (error) {
    console.error('Error en exportarPorDocente (archivo):', error);
    if (!res.headersSent) res.status(500).json({ error: 'Ocurrió un error al generar el archivo del horario' });
  }
};

// GET /api/horarios/exportar/curso/:cursoId?formato=pdf|excel|csv|png
const exportarPorCurso = async (req, res) => {
  const { cursoId } = req.params;
  const formato = (req.query.formato || 'pdf').toLowerCase();

  // CU62 - Excepciones "No existen cursos" / "No se selecciona curso": validado antes de tocar el horario
  if (!cursoId || cursoId === 'null' || cursoId === 'undefined' || isNaN(Number(cursoId))) {
    const [existeAlguno] = await pool.execute('SELECT Curso_Id FROM curso LIMIT 1');
    if (existeAlguno.length === 0) {
      return res.status(404).json({ error: 'No existen cursos' });
    }
    return res.status(400).json({ error: 'No se selecciona curso' });
  }

  // CU62 - Excepción "Error de base de datos"
  let curso, filas;
  try {
    ({ curso, filas } = await fetchPorCurso(cursoId));
  } catch (error) {
    console.error('Error en exportarPorCurso (BD):', error);
    return res.status(500).json({ error: 'Error en base de datos' });
  }

  if (!curso) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }
  // CU62 - Excepción "Curso sin horario"
  if (filas.length === 0) {
    return res.status(404).json({ error: 'El curso no posee asignaciones horarias' });
  }

  const columnas = [
    { key: 'dia',        label: 'Día',        value: (f) => f.dia,                                        width: 12 },
    { key: 'hora',       label: 'Horario',    value: (f) => `${hhmm(f.hora_inicio)} - ${hhmm(f.hora_fin)}`, width: 16 },
    { key: 'asignatura', label: 'Asignatura', value: (f) => f.asignatura,                                 width: 20 },
    { key: 'docente',    label: 'Docente',    value: (f) => f.docente || '—',                             width: 26 },
  ];

  // CU62 - Excepción "Error al generar archivo"
  try {
    await responder(res, formato, {
      titulo: `Horario de ${curso} — SIGAE`,
      columnas,
      filas,
      filename: `horario_curso_${cursoId}`,
    });
  } catch (error) {
    console.error('Error en exportarPorCurso (archivo):', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error en la generación del archivo' });
  }
};

module.exports = { exportarMaestro, exportarPorDocente, exportarPorCurso };