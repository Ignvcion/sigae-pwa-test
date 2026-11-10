// controllers/periodoController.js
// Cambio de período lectivo (docs/decisiones-rf60-rf61-periodos.txt, puntos 5 y 6).
//   GET  /api/promocion/periodos/estado         avance del cierre (Administrador / Super Admin)
//   POST /api/promocion/periodos/iniciar-cierre  abre el período siguiente (Super Admin)
//   GET  /api/promocion/periodos/respaldo        Excel con lo que se eliminará (Super Admin)
//   POST /api/promocion/periodos/iniciar-nuevo   el siguiente pasa a vigente + limpieza (Super Admin)
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const { obtenerPeriodos, periodoSiguienteDe } = require('../utils/periodos');
const { registrarHistorial } = require('../utils/historial');
const { ESTADOS } = require('../utils/situacionFinal');
const { calcularLimpieza, conteo, datosRespaldo, ejecutarLimpieza } = require('../utils/limpiezaPeriodo');
const { CORREO_RESPALDOS } = require('../config/institucion');
const { cursoConElectivosSQL, completitudElectivos } = require('../utils/electivos');

/**
 * Avance por curso del período vigente (situaciones aplicadas) y completitud del
 * horario de los cursos del período siguiente.
 */
async function calcularEstado(conn) {
  const periodos = await obtenerPeriodos(conn);
  const { vigente, siguiente } = periodos;

  // Estudiantes que siguen en un curso vigente sin su situación aplicada = casos pendientes
  const [cursosVigentes] = await conn.query(
    `SELECT c.Curso_Id, c.Curso_Nombre, n.Nivel_Educativo_Orden,
            pj.Usuario_Nombre_Completo AS Profesor_Jefe_Nombre,
            COUNT(e.Estudiante_Id) AS en_curso,
            SUM(sf.Situacion_Final_Estado = ?) AS registrados,
            SUM(sf.Situacion_Final_Estado = ?) AS borradores,
            SUM(e.Estudiante_Id IS NOT NULL AND sf.Situacion_Final_Estado IS NULL) AS sin_situacion,
            SUM(e.Estudiante_Id IS NOT NULL AND (sf.Situacion_Final_Estado IS NULL OR sf.Situacion_Final_Estado <> ?)) AS pendientes,
            (SELECT COUNT(*) FROM situacion_final sa
              WHERE sa.Curso_Id = c.Curso_Id AND sa.Situacion_Final_Periodo_Lectivo = ? AND sa.Situacion_Final_Estado = ?) AS aplicados
       FROM curso c
       JOIN nivel_educativo n ON n.Nivel_Educativo_Id = c.Nivel_Educativo_Id
       LEFT JOIN usuario pj ON pj.Usuario_Id = c.Curso_Profesor_Jefe_Usuario_Id
       LEFT JOIN estudiante e ON e.Curso_Id = c.Curso_Id AND e.Estudiante_Fecha_Eliminacion IS NULL
       LEFT JOIN situacion_final sf ON sf.Estudiante_Id = e.Estudiante_Id
             AND sf.Situacion_Final_Periodo_Lectivo = ? AND sf.Curso_Id = c.Curso_Id
      WHERE c.Curso_Periodo_Lectivo = ?
      GROUP BY c.Curso_Id, c.Curso_Nombre, n.Nivel_Educativo_Orden, pj.Usuario_Nombre_Completo
      ORDER BY n.Nivel_Educativo_Orden DESC, c.Curso_Seccion`,
    [ESTADOS.REGISTRADO, ESTADOS.BORRADOR, ESTADOS.APLICADO, vigente, ESTADOS.APLICADO, vigente, vigente]
  );
  const cursos = cursosVigentes.map((c) => ({
    Curso_Id: c.Curso_Id,
    Curso_Nombre: c.Curso_Nombre,
    Profesor_Jefe_Nombre: c.Profesor_Jefe_Nombre,
    enCurso: Number(c.en_curso),
    registrados: Number(c.registrados || 0),
    borradores: Number(c.borradores || 0),
    sinSituacion: Number(c.sin_situacion || 0),
    pendientes: Number(c.pendientes || 0),
    aplicados: Number(c.aplicados || 0),
  }));

  // Horario "creado": las horas programadas cubren las del plan (misma regla del listado de horarios)
  let cursosSiguientes = [];
  if (siguiente) {
    const [filas] = await conn.query(
      `SELECT c.Curso_Id, c.Curso_Nombre, pj.Usuario_Nombre_Completo AS Profesor_Jefe_Nombre,
              (SELECT COUNT(*) FROM estudiante e WHERE e.Curso_Id = c.Curso_Id AND e.Estudiante_Fecha_Eliminacion IS NULL) AS estudiantes,
              (SELECT COALESCE(SUM(ia.Horas_Semanales_Requeridas), 0)
                 FROM plan_educativo pe
                 JOIN incluyeasig ia ON ia.Plan_Educativo_Id = pe.Plan_Educativo_Id
                 JOIN tieneasig ta ON ta.Asignatura_Id = ia.Asignatura_Id AND ta.Curso_Id = c.Curso_Id AND ta.Estado_Asignacion = 'Activa'
                WHERE pe.Nivel_Educativo_Id = c.Nivel_Educativo_Id
                  AND pe.Plan_Educativo_Periodo_Lectivo = (SELECT MAX(pe2.Plan_Educativo_Periodo_Lectivo) FROM plan_educativo pe2
                                                             WHERE pe2.Nivel_Educativo_Id = c.Nivel_Educativo_Id)) AS horas_requeridas,
              (SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600), 0)
                 FROM horario_asignatura ha JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
                WHERE ha.Curso_Id = c.Curso_Id AND ha.Horario_Asignatura_Estado = 'Activo') AS horas_programadas,
              ${cursoConElectivosSQL('c')} AS con_electivos
         FROM curso c
         JOIN nivel_educativo n ON n.Nivel_Educativo_Id = c.Nivel_Educativo_Id
         LEFT JOIN usuario pj ON pj.Usuario_Id = c.Curso_Profesor_Jefe_Usuario_Id
        WHERE c.Curso_Periodo_Lectivo = ?
        ORDER BY n.Nivel_Educativo_Orden, c.Curso_Seccion`,
      [siguiente]
    );
    // 3° y 4° medio: el horario incluye los electivos del período (CU106)
    const electivos = filas.some((c) => Number(c.con_electivos) === 1) ? await completitudElectivos(conn, siguiente) : null;
    cursosSiguientes = filas.map((c) => {
      const el = Number(c.con_electivos) === 1 ? electivos : null;
      const requeridas = Number(c.horas_requeridas) + (el?.requeridas || 0);
      const programadas = Number(c.horas_programadas) + (el?.programadas || 0);
      return {
        Curso_Id: c.Curso_Id,
        Curso_Nombre: c.Curso_Nombre,
        Profesor_Jefe_Nombre: c.Profesor_Jefe_Nombre,
        estudiantes: Number(c.estudiantes),
        horasRequeridas: requeridas,
        horasProgramadas: programadas,
        horarioCompleto: requeridas > 0 && programadas >= requeridas,
      };
    });
  }

  const motivos = [];
  if (!periodos.cierreIniciado) motivos.push('El cierre del período no se ha iniciado');
  const pendientes = cursos.reduce((a, c) => a + c.pendientes, 0);
  if (pendientes > 0) {
    const cursosPend = cursos.filter((c) => c.pendientes > 0).map((c) => `${c.Curso_Nombre} (${c.pendientes})`);
    motivos.push(`Hay ${pendientes} estudiante(s) sin su promoción aplicada: ${cursosPend.join(', ')}`);
  }
  if (periodos.cierreIniciado && cursosSiguientes.length === 0) motivos.push(`No hay cursos creados para ${siguiente}`);
  const incompletos = cursosSiguientes.filter((c) => !c.horarioCompleto);
  if (incompletos.length > 0) {
    motivos.push(`Cursos de ${siguiente} sin horario completo: ${incompletos.map((c) => c.Curso_Nombre).join(', ')}`);
  }

  return {
    periodos,
    cursosVigentes: cursos,
    cursosSiguientes,
    puedeIniciarNuevoPeriodo: motivos.length === 0,
    motivos,
  };
}

// GET /api/promocion/periodos/estado
const getEstado = async (req, res) => {
  try {
    const estado = await calcularEstado(pool);
    const limpieza = await calcularLimpieza(pool, estado.periodos.vigente);
    return res.json({ ...estado, limpieza: conteo(limpieza) });
  } catch (error) {
    console.error('getEstadoPeriodo:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar el estado del período' });
  }
};

// POST /api/promocion/periodos/iniciar-cierre   (Super Admin)
const iniciarCierre = async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const periodos = await obtenerPeriodos(conn, { bloquear: true });
    if (!periodos.parametroId) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Primero configura los parámetros institucionales (bloques horarios)' });
    }
    if (periodos.cierreIniciado) {
      await conn.rollback();
      return res.status(409).json({ mensaje: `El cierre ya está iniciado: se está preparando ${periodos.siguiente}` });
    }
    const siguiente = periodoSiguienteDe(periodos.vigente);
    await conn.query(
      `UPDATE parametro_institucional
          SET Parametro_Institucional_Periodo_Vigente = ?, Parametro_Institucional_Periodo_Siguiente = ?
        WHERE Parametro_Institucional_Id = ?`,
      [periodos.vigente, siguiente, periodos.parametroId]
    );
    await registrarHistorial(conn, {
      atributo: 'Parametro_Institucional_Periodo_Siguiente',
      anterior: null,
      nuevo: siguiente,
      descripcion: `Inicio del cierre del período ${periodos.vigente}`,
      usuarioId: req.user.id,
      responsableId: req.user.id,
    });
    await conn.commit();
    return res.json({ mensaje: `Cierre de ${periodos.vigente} iniciado: ya se puede preparar ${siguiente}`, vigente: periodos.vigente, siguiente });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('iniciarCierre:', error);
    return res.status(500).json({ mensaje: 'No fue posible iniciar el cierre' });
  } finally {
    if (conn) conn.release();
  }
};

const valorCelda = (v) => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : v);

// GET /api/promocion/periodos/respaldo   (Super Admin)
// Excel con todo lo que se eliminará o desactivará al iniciar el nuevo período.
// Contiene datos personales: se descarga solo para subirlo al Drive de respaldos
// (respaldosigae@colegiojc.cl).
const descargarRespaldo = async (req, res) => {
  try {
    const { vigente, siguiente } = await obtenerPeriodos(pool);
    const limpieza = await calcularLimpieza(pool, vigente);
    const datos = await datosRespaldo(pool, limpieza);

    const libro = new ExcelJS.Workbook();
    const resumen = libro.addWorksheet('Resumen');
    resumen.addRows([
      ['SIGAE - respaldo previo al cambio de período'],
      ['Generado', new Date().toISOString().replace('T', ' ').slice(0, 19)],
      ['Período vigente', vigente],
      ['Período siguiente', siguiente || '—'],
      [`Contiene datos personales: subir al Google Drive de ${CORREO_RESPALDOS} y no guardar copias en equipos personales.`],
      [],
      ['Qué se elimina o modifica', 'Cantidad'],
      ...Object.entries(conteo(limpieza)),
    ]);
    resumen.getColumn(1).width = 45;
    for (const [nombre, filas] of Object.entries(datos)) {
      const hoja = libro.addWorksheet(nombre.slice(0, 31));
      if (filas.length === 0) {
        hoja.addRow(['(sin filas)']);
        continue;
      }
      const columnas = Object.keys(filas[0]);
      hoja.addRow(columnas).font = { bold: true };
      filas.forEach((f) => hoja.addRow(columnas.map((c) => valorCelda(f[c]))));
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="respaldo_cambio_periodo_${vigente}.xlsx"`);
    await libro.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('descargarRespaldo:', error);
    return res.status(500).json({ mensaje: 'No fue posible generar el respaldo' });
  }
};

// POST /api/promocion/periodos/iniciar-nuevo   (Super Admin)   Body: { confirmarRespaldo: true }
const iniciarNuevoPeriodo = async (req, res) => {
  if (req.body?.confirmarRespaldo !== true) {
    return res.status(400).json({ mensaje: 'Antes de iniciar el nuevo período descarga el respaldo y confirma que lo guardaste' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const periodos = await obtenerPeriodos(conn, { bloquear: true });
    const estado = await calcularEstado(conn);
    if (!estado.puedeIniciarNuevoPeriodo) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Todavía no se puede iniciar el nuevo período', motivos: estado.motivos });
    }

    const nuevoVigente = periodos.siguiente;
    const limpieza = await calcularLimpieza(conn, periodos.vigente);
    await ejecutarLimpieza(conn, limpieza, nuevoVigente);
    await conn.query(
      `UPDATE parametro_institucional
          SET Parametro_Institucional_Periodo_Vigente = ?, Parametro_Institucional_Periodo_Siguiente = NULL
        WHERE Parametro_Institucional_Id = ?`,
      [nuevoVigente, periodos.parametroId]
    );
    const resumen = conteo(limpieza);
    await registrarHistorial(conn, {
      atributo: 'Parametro_Institucional_Periodo_Vigente',
      anterior: periodos.vigente,
      nuevo: nuevoVigente,
      descripcion: `Inicio del período ${nuevoVigente}. Limpieza: ${resumen.cursos} curso(s), `
        + `${resumen.estudiantes} estudiante(s), ${resumen.apoderadosEliminar} apoderado(s) eliminados; `
        + `${resumen.apoderadosDesactivar} apoderado(s) desactivados`,
      usuarioId: req.user.id,
      responsableId: req.user.id,
    });
    await conn.commit();
    return res.json({ mensaje: `Período ${nuevoVigente} iniciado`, vigente: nuevoVigente, limpieza: resumen });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('iniciarNuevoPeriodo:', error);
    return res.status(500).json({ mensaje: 'No fue posible iniciar el nuevo período. No se modificó nada.' });
  } finally {
    if (conn) conn.release();
  }
};

module.exports = { getEstado, iniciarCierre, descargarRespaldo, iniciarNuevoPeriodo, calcularEstado };
