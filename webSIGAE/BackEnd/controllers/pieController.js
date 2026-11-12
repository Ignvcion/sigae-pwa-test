// controllers/pieController.js
// Horas P.I.E. del docente y su reparto 65/35 (utils/cargaLectiva.js).
//   GET /api/usuarios/:id/pie?periodo=   administración o el propio docente
//   PUT /api/usuarios/:id/pie            administración  { horasPIE, periodo?, bloques: [{ dia, bloqueId }] }
// Sin periodo se usa el vigente; durante el cierre también se puede preparar el siguiente.
const pool = require('../config/db');
const { puedeGestionAcademica } = require('../utils/permisos');
const { obtenerPeriodos } = require('../utils/periodos');
const { calcularCargaLectiva, clasesLectivas } = require('../utils/cargaLectiva');
const { aMinutos, hhmm, seSuperponen } = require('../utils/disponibilidadDocente');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const esAdmin = (user) => (user?.roles || []).includes('Administrador');

/** Período pedido (vigente o siguiente) o error. */
async function resolverPeriodo(db, pedido) {
  const { vigente, siguiente } = await obtenerPeriodos(db);
  if (!pedido) return { periodo: vigente, vigente };
  const p = String(pedido);
  if (p !== String(vigente) && p !== String(siguiente || '')) {
    return { error: `El período debe ser el vigente (${vigente})${siguiente ? ` o el siguiente (${siguiente})` : ''}` };
  }
  return { periodo: p, vigente };
}

/**
 * Primer tramo de atención de apoderados (RF55) del docente que se superpone con alguno de los
 * bloques P.I.E. indicados, o null. La atención es semanal y sin período: solo se compara
 * cuando los bloques P.I.E. son del período vigente.
 */
async function atencionEnBloquesPIE(db, docenteId, bloques) {
  const ids = [...new Set(bloques.map((b) => Number(b.bloqueId)))];
  const [horas] = await db.query(
    `SELECT Bloque_Horario_Id AS id, Bloque_Horario_Hora_Inicio AS inicio, Bloque_Horario_Hora_Fin AS fin
       FROM bloque_horario WHERE Bloque_Horario_Id IN (?)`,
    [ids]
  );
  const [atencion] = await db.query(
    `SELECT Horario_Atencion_Dia_Semana AS dia, Horario_Atencion_Hora_Inicio AS inicio, Horario_Atencion_Hora_Fin AS fin
       FROM horario_atencion WHERE Docente_Usuario_Id = ?`,
    [docenteId]
  );
  const horaDe = new Map(horas.map((h) => [Number(h.id), { inicio: aMinutos(h.inicio), fin: aMinutos(h.fin) }]));
  for (const b of bloques) {
    const hb = horaDe.get(Number(b.bloqueId));
    const choque = hb && atencion.find((a) => a.dia === b.dia && seSuperponen(hb, { inicio: aMinutos(a.inicio), fin: aMinutos(a.fin) }));
    if (choque) return { dia: b.dia, inicio: hhmm(choque.inicio), fin: hhmm(choque.fin) };
  }
  return null;
}

async function buscarDocente(db, id) {
  const [[docente]] = await db.query(
    `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Carga_Horaria_Semanal, Docente_Horas_PIE
       FROM usuario WHERE Usuario_Id = ? AND Es_Docente = 1`,
    [id]
  );
  return docente || null;
}

/** Resumen de horas P.I.E. y 65/35 del docente en el período. */
async function resumenPIE(db, docente, periodo) {
  const [bloques] = await db.query(
    `SELECT bp.Bloque_Pie_Dia_Semana AS dia, bp.Bloque_Horario_Id AS bloqueId,
            bh.Bloque_Horario_Hora_Inicio AS horaInicio, bh.Bloque_Horario_Hora_Fin AS horaFin
       FROM bloque_pie_docente bp JOIN bloque_horario bh ON bh.Bloque_Horario_Id = bp.Bloque_Horario_Id
      WHERE bp.Docente_Usuario_Id = ? AND bp.Bloque_Pie_Periodo_Lectivo = ?
      ORDER BY FIELD(bp.Bloque_Pie_Dia_Semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'), bh.Bloque_Horario_Hora_Inicio`,
    [docente.Usuario_Id, periodo]
  );
  // Bloques ya ocupados por clases del docente (no se pueden marcar como P.I.E.)
  const [ocupados] = await db.query(
    `SELECT ha.Horario_Asignatura_Dia_Semana AS dia, ha.Bloque_Horario_Id AS bloqueId,
            CONCAT(a.Asignatura_Nombre, ' · ', c.Curso_Nombre) AS descripcion
       FROM horario_asignatura ha
       JOIN curso c ON c.Curso_Id = ha.Curso_Id JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
      WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo' AND c.Curso_Periodo_Lectivo = ?
     UNION ALL
     SELECT ce.Clase_Electivo_Dia_Semana, ce.Bloque_Horario_Id, CONCAT('Electivo ', a.Asignatura_Nombre)
       FROM clase_electivo ce JOIN asignatura a ON a.Asignatura_Id = ce.Asignatura_Id
      WHERE ce.Docente_Usuario_Id = ? AND ce.Clase_Electivo_Periodo_Lectivo = ?`,
    [docente.Usuario_Id, periodo, docente.Usuario_Id, periodo]
  );
  const clases = (await clasesLectivas(db, [docente.Usuario_Id], periodo)).get(Number(docente.Usuario_Id)) || 0;
  return {
    docenteId: docente.Usuario_Id,
    docente: docente.Usuario_Nombre_Completo,
    periodo,
    horasPIE: Number(docente.Docente_Horas_PIE) || 0,
    reparto: calcularCargaLectiva(docente.Docente_Carga_Horaria_Semanal, docente.Docente_Horas_PIE),
    clasesAsignadas: clases,
    bloques,
    ocupados,
  };
}

// GET /api/usuarios/:id/pie
const getPIE = async (req, res) => {
  const id = Number(req.params.id);
  // Lectura: administración, etiqueta UTP (horarios por docente) o el propio docente
  if (!puedeGestionAcademica(req.user) && Number(req.user.id) !== id) {
    return res.status(403).json({ mensaje: 'Solo la administración o el propio docente pueden ver sus horas P.I.E.' });
  }
  try {
    const docente = await buscarDocente(pool, id);
    if (!docente) return res.status(404).json({ mensaje: 'Docente no encontrado' });
    const { periodo, error } = await resolverPeriodo(pool, req.query.periodo);
    if (error) return res.status(400).json({ mensaje: error });
    return res.json(await resumenPIE(pool, docente, periodo));
  } catch (error) {
    console.error('getPIE:', error);
    return res.status(500).json({ mensaje: 'No fue posible obtener las horas P.I.E.' });
  }
};

// PUT /api/usuarios/:id/pie   (administración)
const guardarPIE = async (req, res) => {
  const id = Number(req.params.id);
  const { horasPIE, bloques = [], periodo: periodoPedido } = req.body || {};

  const horas = Number(horasPIE);
  if (!Number.isInteger(horas) || horas < 0) {
    return res.status(400).json({ mensaje: 'Las horas P.I.E. deben ser un número entero igual o mayor a 0' });
  }
  if (!Array.isArray(bloques)) {
    return res.status(400).json({ mensaje: 'Los bloques P.I.E. deben ser una lista' });
  }
  const claves = new Set();
  for (const b of bloques) {
    if (!DIAS.includes(b?.dia) || !Number.isInteger(Number(b?.bloqueId)) || Number(b.bloqueId) <= 0) {
      return res.status(400).json({ mensaje: 'Cada bloque P.I.E. necesita un día (lunes a viernes) y un bloque horario' });
    }
    const clave = `${b.dia}|${Number(b.bloqueId)}`;
    if (claves.has(clave)) return res.status(400).json({ mensaje: 'Hay bloques P.I.E. repetidos' });
    claves.add(clave);
  }
  // Las horas ubicadas en el horario no pueden ser más que las horas P.I.E. asignadas
  if (bloques.length > horas) {
    return res.status(400).json({
      mensaje: `Marcaste ${bloques.length} bloques P.I.E. pero el docente tiene ${horas} hora${horas === 1 ? '' : 's'} P.I.E.`,
    });
  }

  let conn;
  try {
    const docente = await buscarDocente(pool, id);
    if (!docente) return res.status(404).json({ mensaje: 'Docente no encontrado' });
    if (docente.Docente_Carga_Horaria_Semanal != null && horas > Number(docente.Docente_Carga_Horaria_Semanal)) {
      return res.status(400).json({
        mensaje: `Las horas P.I.E. (${horas}) no pueden superar la carga horaria semanal (${docente.Docente_Carga_Horaria_Semanal} h)`,
      });
    }
    const { periodo, vigente, error } = await resolverPeriodo(pool, periodoPedido);
    if (error) return res.status(400).json({ mensaje: error });

    if (bloques.length > 0) {
      // Solo bloques de clase vigentes (no recreos)
      const ids = [...new Set(bloques.map((b) => Number(b.bloqueId)))];
      const [validos] = await pool.query(
        `SELECT Bloque_Horario_Id FROM bloque_horario WHERE Bloque_Horario_Id IN (?) AND Bloque_Horario_Tipo = 'Clase'`,
        [ids]
      );
      if (validos.length !== ids.length) {
        return res.status(400).json({ mensaje: 'Los bloques P.I.E. deben ser bloques de clase (no recreos)' });
      }
      // No pueden coincidir con una clase o un electivo del docente
      const resumen = await resumenPIE(pool, docente, periodo);
      const choque = resumen.ocupados.find((o) => claves.has(`${o.dia}|${Number(o.bloqueId)}`));
      if (choque) {
        return res.status(409).json({ mensaje: `El ${choque.dia} el docente ya tiene clase en ese bloque (${choque.descripcion})` });
      }
      // No pueden coincidir con su horario de atención de apoderados (período vigente)
      if (String(periodo) === String(vigente)) {
        const atencion = await atencionEnBloquesPIE(pool, id, bloques);
        if (atencion) {
          return res.status(409).json({
            mensaje: `El ${atencion.dia} el docente tiene atención de apoderados de ${atencion.inicio} a ${atencion.fin} que se superpone con ese bloque P.I.E.: ajusta primero su horario de atención`,
          });
        }
      }
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query('UPDATE usuario SET Docente_Horas_PIE = ? WHERE Usuario_Id = ?', [horas, id]);
    await conn.query(
      'DELETE FROM bloque_pie_docente WHERE Docente_Usuario_Id = ? AND Bloque_Pie_Periodo_Lectivo = ?',
      [id, periodo]
    );
    for (const b of bloques) {
      await conn.query(
        `INSERT INTO bloque_pie_docente (Docente_Usuario_Id, Bloque_Pie_Periodo_Lectivo, Bloque_Pie_Dia_Semana, Bloque_Horario_Id)
         VALUES (?, ?, ?, ?)`,
        [id, periodo, b.dia, Number(b.bloqueId)]
      );
    }
    await conn.commit();

    const resumen = await resumenPIE(pool, { ...docente, Docente_Horas_PIE: horas }, periodo);
    // Las clases ya asignadas no se quitan: si superan el nuevo máximo, se avisa
    const advertencia = resumen.reparto && resumen.clasesAsignadas > resumen.reparto.maxLectivas
      ? `${docente.Usuario_Nombre_Completo} ya tiene ${resumen.clasesAsignadas} clases y su nuevo máximo es `
        + `${resumen.reparto.maxLectivas}: reasigna ${resumen.clasesAsignadas - resumen.reparto.maxLectivas} a otro docente.`
      : null;
    return res.json({ mensaje: 'Horas P.I.E. guardadas', ...resumen, ...(advertencia && { advertencia }) });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('guardarPIE:', error);
    return res.status(500).json({ mensaje: 'No fue posible guardar las horas P.I.E.' });
  } finally {
    if (conn) conn.release();
  }
};

module.exports = { getPIE, guardarPIE, resumenPIE };
