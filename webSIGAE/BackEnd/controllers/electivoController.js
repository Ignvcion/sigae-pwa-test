// controllers/electivoController.js
// Electivos de 3° y 4° medio. Reglas en utils/electivos.js.
//   CU108 (RF27, RF28): plan de electivos del período
//     GET  /api/electivos/plan?periodo=          plan del período, catálogo de electivas y docentes
//     POST /api/electivos/plan                   { periodo, asignaturas: [{ Asignatura_Id, ruta, horas, docentes: [ids] }] }
//     PUT  /api/electivos/plan/:id               { asignaturas } (reemplaza)
//     POST /api/electivos/plan/clonar            { desde?, hacia }
//   CU106 (RF34, RF35): programación en bloques compartidos por 3° y 4° medio
//     GET    /api/electivos/programacion?periodo=
//     POST   /api/electivos/clases               { periodo, dia, Bloque_Horario_Id, Asignatura_Id, ruta, Docente_Usuario_Id }
//     DELETE /api/electivos/clases/:id
//   Vistas: GET /api/electivos/curso/:cursoId (horario del curso; con ?ruta= filtra la del estudiante)
const pool = require('../config/db');
const { cuentaUtilizableSQL } = require('../utils/primerIngreso');
const { obtenerPeriodos } = require('../utils/periodos');
const { claseVigente } = require('../utils/clasesEliminadas');
const { condicionDesajustado } = require('../utils/bloquesDesajustados');
const { RUTAS_ELECTIVO, normalizarRuta } = require('../utils/rutaFormacion');
const { validarDisponibilidad, resumenSemanal, advertenciaHorasAdeudadas } = require('../utils/disponibilidadLaboral');
const { sugerenciaEspecialidad } = require('../utils/especialidades');
const { DURACION_SQL, cursoConElectivosSQL, completitudElectivos } = require('../utils/electivos');
const { verificarCargaLectiva, docentesConPIEEnBloque } = require('../utils/cargaLectiva');

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const hhmm = (t) => String(t ?? '').slice(0, 5);

class ErrorElectivo extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

const responderError = (res, error, contexto, mensaje500) => {
  if (error instanceof ErrorElectivo) return res.status(error.status).json({ mensaje: error.message, ...error.extra });
  console.error(contexto, error);
  return res.status(500).json({ mensaje: mensaje500 });
};

/** Período pedido: vigente por defecto; se aceptan el vigente y, con el cierre iniciado, el siguiente. */
async function resolverPeriodo(db, pedido) {
  const periodos = await obtenerPeriodos(db);
  const periodo = pedido ? String(pedido) : periodos.vigente;
  if (periodo !== periodos.vigente && periodo !== periodos.siguiente) {
    throw new ErrorElectivo(400, `El período ${periodo} no está disponible: usa el vigente o, durante el cierre, el siguiente`);
  }
  return { periodo, periodos };
}

/** Plan del período con sus asignaturas, horas programadas y docentes habilitados; null si no existe. */
async function leerPlan(db, periodo) {
  const [[plan]] = await db.query(
    'SELECT Plan_Electivos_Id, Plan_Electivos_Periodo_Lectivo FROM plan_electivos WHERE Plan_Electivos_Periodo_Lectivo = ?',
    [periodo]
  );
  if (!plan) return null;
  const [filas] = await db.query(
    `SELECT pea.Plan_Electivos_Asignatura_Id, pea.Asignatura_Id, a.Asignatura_Nombre,
            pea.Plan_Electivos_Asignatura_Ruta AS ruta, pea.Plan_Electivos_Asignatura_Horas AS horas,
            (SELECT COALESCE(SUM(${DURACION_SQL('bh')}), 0)
               FROM clase_electivo ce JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ce.Bloque_Horario_Id
              WHERE ce.Clase_Electivo_Periodo_Lectivo = ? AND ce.Asignatura_Id = pea.Asignatura_Id
                AND ce.Clase_Electivo_Ruta = pea.Plan_Electivos_Asignatura_Ruta) AS horas_programadas
       FROM plan_electivos_asignatura pea
       JOIN asignatura a ON a.Asignatura_Id = pea.Asignatura_Id
      WHERE pea.Plan_Electivos_Id = ?
      ORDER BY pea.Plan_Electivos_Asignatura_Ruta, a.Asignatura_Nombre`,
    [periodo, plan.Plan_Electivos_Id]
  );
  const [docentes] = await db.query(
    `SELECT ped.Plan_Electivos_Asignatura_Id, u.Usuario_Id, u.Usuario_Nombre_Completo
       FROM plan_electivos_docente ped
       JOIN plan_electivos_asignatura pea ON pea.Plan_Electivos_Asignatura_Id = ped.Plan_Electivos_Asignatura_Id
       JOIN usuario u ON u.Usuario_Id = ped.Docente_Usuario_Id
      WHERE pea.Plan_Electivos_Id = ?
      ORDER BY u.Usuario_Nombre_Completo`,
    [plan.Plan_Electivos_Id]
  );
  const asignaturas = filas.map((f) => ({
    Plan_Electivos_Asignatura_Id: f.Plan_Electivos_Asignatura_Id,
    Asignatura_Id: f.Asignatura_Id,
    Asignatura_Nombre: f.Asignatura_Nombre,
    ruta: f.ruta,
    horas: Number(f.horas),
    horas_programadas: Math.round(Number(f.horas_programadas) * 100) / 100,
    docentes: docentes
      .filter((d) => d.Plan_Electivos_Asignatura_Id === f.Plan_Electivos_Asignatura_Id)
      .map((d) => ({ Usuario_Id: d.Usuario_Id, Usuario_Nombre_Completo: d.Usuario_Nombre_Completo })),
  }));
  return { Plan_Electivos_Id: plan.Plan_Electivos_Id, periodo, asignaturas };
}

/** Horas por ruta y advertencia si no suman lo mismo (ambas ocupan los mismos bloques). */
function totalesPorRuta(asignaturas) {
  const totales = Object.fromEntries(RUTAS_ELECTIVO.map((r) => [r, 0]));
  for (const a of asignaturas) totales[a.ruta] += Number(a.horas);
  const [c, h] = RUTAS_ELECTIVO.map((r) => totales[r]);
  return {
    totales,
    advertencia: c !== h
      ? `Las rutas no suman las mismas horas semanales (Científica ${c} h, Humanística ${h} h) y ambas ocupan los mismos bloques.`
      : null,
  };
}

/**
 * CU108 Excepción 2: valida las filas del plan. Cada fila: asignatura electiva existente,
 * ruta Científica o Humanística, horas enteras ≥ 1, sin repetir la asignatura en la ruta,
 * y docentes habilitados que sean docentes activos.
 */
async function validarFilasPlan(db, filas) {
  if (!Array.isArray(filas) || filas.length === 0) {
    throw new ErrorElectivo(400, 'Agrega al menos una asignatura electiva al plan');
  }
  const normalizadas = [];
  const vistas = new Set();
  for (const f of filas) {
    const asignaturaId = Number(f?.Asignatura_Id);
    const ruta = normalizarRuta(f?.ruta, RUTAS_ELECTIVO);
    const horas = Number(f?.horas);
    if (!idValido(asignaturaId)) throw new ErrorElectivo(400, 'Cada fila debe indicar una asignatura');
    if (!ruta) throw new ErrorElectivo(400, 'La ruta de cada electivo debe ser Científica o Humanística');
    if (!Number.isInteger(horas) || horas < 1) throw new ErrorElectivo(400, 'Las horas semanales deben ser un número entero mayor o igual a 1');
    const clave = `${asignaturaId}|${ruta}`;
    if (vistas.has(clave)) throw new ErrorElectivo(400, 'Una asignatura no puede repetirse en la misma ruta');
    vistas.add(clave);
    const docentes = [...new Set((Array.isArray(f?.docentes) ? f.docentes : []).map(Number))];
    if (docentes.some((d) => !idValido(d))) throw new ErrorElectivo(400, 'Los docentes habilitados no son válidos');
    normalizadas.push({ asignaturaId, ruta, horas, docentes });
  }
  const ids = [...new Set(normalizadas.map((f) => f.asignaturaId))];
  const [asignaturas] = await db.query(
    'SELECT Asignatura_Id, Asignatura_Nombre, Asignatura_Es_Electiva FROM asignatura WHERE Asignatura_Id IN (?)',
    [ids]
  );
  for (const id of ids) {
    const a = asignaturas.find((x) => Number(x.Asignatura_Id) === id);
    if (!a) throw new ErrorElectivo(400, 'Una de las asignaturas no existe');
    if (Number(a.Asignatura_Es_Electiva) !== 1) {
      throw new ErrorElectivo(400, `${a.Asignatura_Nombre} no está marcada como electiva (CU47)`);
    }
  }
  const docentesIds = [...new Set(normalizadas.flatMap((f) => f.docentes))];
  if (docentesIds.length > 0) {
    const [activos] = await db.query(
      `SELECT Usuario_Id FROM usuario WHERE Usuario_Id IN (?) AND Es_Docente = 1 AND ${cuentaUtilizableSQL('usuario')}`,
      [docentesIds]
    );
    if (activos.length !== docentesIds.length) throw new ErrorElectivo(400, 'Los docentes habilitados deben ser docentes activos');
  }
  return normalizadas;
}

async function insertarFilas(conn, planId, filas) {
  for (const f of filas) {
    const [r] = await conn.query(
      `INSERT INTO plan_electivos_asignatura
         (Plan_Electivos_Id, Asignatura_Id, Plan_Electivos_Asignatura_Ruta, Plan_Electivos_Asignatura_Horas)
       VALUES (?, ?, ?, ?)`,
      [planId, f.asignaturaId, f.ruta, f.horas]
    );
    if (f.docentes.length > 0) {
      await conn.query(
        'INSERT INTO plan_electivos_docente (Plan_Electivos_Asignatura_Id, Docente_Usuario_Id) VALUES ?',
        [f.docentes.map((d) => [r.insertId, d])]
      );
    }
  }
}

// ── CU108: GET /api/electivos/plan?periodo= ──
const getPlan = async (req, res) => {
  try {
    const { periodo, periodos } = await resolverPeriodo(pool, req.query.periodo);
    const plan = await leerPlan(pool, periodo);
    const [electivas] = await pool.query(
      'SELECT Asignatura_Id, Asignatura_Nombre FROM asignatura WHERE Asignatura_Es_Electiva = 1 ORDER BY Asignatura_Nombre'
    );
    const [docentes] = await pool.query(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Especialidad FROM usuario
        WHERE Es_Docente = 1 AND ${cuentaUtilizableSQL('usuario')} ORDER BY Usuario_Nombre_Completo`
    );
    const anterior = String(Number(periodo) - 1);
    const [[hayAnterior]] = await pool.query(
      'SELECT COUNT(*) AS n FROM plan_electivos WHERE Plan_Electivos_Periodo_Lectivo = ?', [anterior]
    );
    return res.json({
      periodo,
      periodos: { vigente: periodos.vigente, siguiente: periodos.siguiente },
      plan,
      ...(plan ? totalesPorRuta(plan.asignaturas) : { totales: null, advertencia: null }),
      electivas,
      docentes,
      rutas: RUTAS_ELECTIVO,
      periodoAnterior: Number(hayAnterior?.n) > 0 ? anterior : null,
    });
  } catch (error) {
    return responderError(res, error, 'getPlan electivos:', 'No fue posible cargar el plan de electivos');
  }
};

// ── CU108: POST /api/electivos/plan ──
const crearPlan = async (req, res) => {
  let conn;
  try {
    const { periodo } = await resolverPeriodo(pool, req.body?.periodo);
    const filas = await validarFilasPlan(pool, req.body?.asignaturas);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[existente]] = await conn.query(
      'SELECT Plan_Electivos_Id FROM plan_electivos WHERE Plan_Electivos_Periodo_Lectivo = ? FOR UPDATE', [periodo]
    );
    // CU108 Excepción 3: ya existe un plan para el período; se ofrece editarlo
    if (existente) {
      throw new ErrorElectivo(409, `Ya existe un plan de electivos para ${periodo}. Puedes editarlo.`, {
        Plan_Electivos_Id: existente.Plan_Electivos_Id,
      });
    }
    const [r] = await conn.query('INSERT INTO plan_electivos (Plan_Electivos_Periodo_Lectivo) VALUES (?)', [periodo]);
    await insertarFilas(conn, r.insertId, filas);
    await conn.commit();
    const plan = await leerPlan(pool, periodo);
    return res.status(201).json({ mensaje: `Plan de electivos ${periodo} registrado`, plan, ...totalesPorRuta(plan.asignaturas) });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    return responderError(res, error, 'crearPlan electivos:', 'No fue posible registrar el plan de electivos');
  } finally {
    if (conn) conn.release();
  }
};

// ── CU108: PUT /api/electivos/plan/:id ──
const editarPlan = async (req, res) => {
  const planId = Number(req.params.id);
  if (!idValido(planId)) return res.status(400).json({ mensaje: 'Plan no válido' });
  let conn;
  try {
    const filas = await validarFilasPlan(pool, req.body?.asignaturas);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[plan]] = await conn.query(
      'SELECT Plan_Electivos_Id, Plan_Electivos_Periodo_Lectivo AS periodo FROM plan_electivos WHERE Plan_Electivos_Id = ? FOR UPDATE',
      [planId]
    );
    if (!plan) throw new ErrorElectivo(404, 'El plan de electivos no existe');
    await resolverPeriodo(conn, plan.periodo);

    // No se puede quitar una asignatura con clases programadas ni dejarle menos horas que las programadas
    const [programadas] = await conn.query(
      `SELECT ce.Asignatura_Id, ce.Clase_Electivo_Ruta AS ruta, a.Asignatura_Nombre,
              SUM(${DURACION_SQL('bh')}) AS horas
         FROM clase_electivo ce
         JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ce.Bloque_Horario_Id
         JOIN asignatura a ON a.Asignatura_Id = ce.Asignatura_Id
        WHERE ce.Clase_Electivo_Periodo_Lectivo = ?
        GROUP BY ce.Asignatura_Id, ce.Clase_Electivo_Ruta, a.Asignatura_Nombre`,
      [plan.periodo]
    );
    for (const p of programadas) {
      const fila = filas.find((f) => f.asignaturaId === Number(p.Asignatura_Id) && f.ruta === p.ruta);
      if (!fila) {
        throw new ErrorElectivo(409, `${p.Asignatura_Nombre} (${p.ruta}) tiene clases programadas: elimínalas antes de quitarla del plan`);
      }
      if (fila.horas < Number(p.horas)) {
        throw new ErrorElectivo(409, `${p.Asignatura_Nombre} (${p.ruta}) ya tiene ${Number(p.horas)} h programadas: no puede quedar con ${fila.horas} h`);
      }
    }
    await conn.query('DELETE FROM plan_electivos_asignatura WHERE Plan_Electivos_Id = ?', [planId]);
    await insertarFilas(conn, planId, filas);
    await conn.commit();
    const actualizado = await leerPlan(pool, plan.periodo);
    return res.json({ mensaje: `Plan de electivos ${plan.periodo} actualizado`, plan: actualizado, ...totalesPorRuta(actualizado.asignaturas) });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    return responderError(res, error, 'editarPlan electivos:', 'No fue posible actualizar el plan de electivos');
  } finally {
    if (conn) conn.release();
  }
};

// ── CU108: POST /api/electivos/plan/clonar  { hacia, desde? } ──
const clonarPlan = async (req, res) => {
  let conn;
  try {
    const { periodo: hacia } = await resolverPeriodo(pool, req.body?.hacia);
    const desde = String(req.body?.desde || Number(hacia) - 1);
    const origen = await leerPlan(pool, desde);
    // CU108 Excepción 1: no hay plan anterior para clonar
    if (!origen) throw new ErrorElectivo(404, `No existe un plan de electivos ${desde} para clonar`);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[existente]] = await conn.query(
      'SELECT Plan_Electivos_Id FROM plan_electivos WHERE Plan_Electivos_Periodo_Lectivo = ? FOR UPDATE', [hacia]
    );
    if (existente) {
      throw new ErrorElectivo(409, `Ya existe un plan de electivos para ${hacia}. Puedes editarlo.`, {
        Plan_Electivos_Id: existente.Plan_Electivos_Id,
      });
    }
    const [r] = await conn.query('INSERT INTO plan_electivos (Plan_Electivos_Periodo_Lectivo) VALUES (?)', [hacia]);
    // Solo se copian los docentes que siguen activos
    const [activos] = await conn.query(`SELECT Usuario_Id FROM usuario WHERE Es_Docente = 1 AND ${cuentaUtilizableSQL('usuario')}`);
    const idsActivos = new Set(activos.map((a) => Number(a.Usuario_Id)));
    await insertarFilas(conn, r.insertId, origen.asignaturas.map((a) => ({
      asignaturaId: a.Asignatura_Id,
      ruta: a.ruta,
      horas: a.horas,
      docentes: a.docentes.map((d) => Number(d.Usuario_Id)).filter((d) => idsActivos.has(d)),
    })));
    await conn.commit();
    const plan = await leerPlan(pool, hacia);
    return res.status(201).json({ mensaje: `Plan de electivos ${hacia} clonado desde ${desde}`, plan, ...totalesPorRuta(plan.asignaturas) });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    return responderError(res, error, 'clonarPlan electivos:', 'No fue posible clonar el plan de electivos');
  } finally {
    if (conn) conn.release();
  }
};

/** Clases de electivo del período con bloque, asignatura y docente. */
async function clasesDelPeriodo(db, periodo, { ruta = null } = {}) {
  const [filas] = await db.query(
    `SELECT ce.Clase_Electivo_Id, ce.Clase_Electivo_Dia_Semana AS dia, ce.Bloque_Horario_Id,
            bh.Bloque_Horario_Hora_Inicio AS hora_inicio, bh.Bloque_Horario_Hora_Fin AS hora_fin,
            ce.Asignatura_Id, a.Asignatura_Nombre AS asignatura, ce.Clase_Electivo_Ruta AS ruta,
            ce.Docente_Usuario_Id, u.Usuario_Nombre_Completo AS docente
       FROM clase_electivo ce
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ce.Bloque_Horario_Id
       JOIN asignatura a ON a.Asignatura_Id = ce.Asignatura_Id
       JOIN usuario u ON u.Usuario_Id = ce.Docente_Usuario_Id
      WHERE ce.Clase_Electivo_Periodo_Lectivo = ? ${ruta ? 'AND ce.Clase_Electivo_Ruta = ?' : ''}
      ORDER BY FIELD(ce.Clase_Electivo_Dia_Semana, ?), bh.Bloque_Horario_Hora_Inicio, ce.Clase_Electivo_Ruta, a.Asignatura_Nombre`,
    ruta ? [periodo, ruta, DIAS] : [periodo, DIAS]
  );
  return filas.map((f) => ({ ...f, hora_inicio: hhmm(f.hora_inicio), hora_fin: hhmm(f.hora_fin) }));
}

/** Clases regulares de cursos de 3° y 4° medio del período (ocupan el bloque para electivos). */
async function regularesDeTerceroYCuarto(db, periodo) {
  const [filas] = await db.query(
    `SELECT ha.Horario_Asignatura_Dia_Semana AS dia, ha.Bloque_Horario_Id, c.Curso_Nombre AS curso,
            a.Asignatura_Nombre AS asignatura
       FROM horario_asignatura ha
       JOIN curso c ON c.Curso_Id = ha.Curso_Id
       JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
      WHERE c.Curso_Periodo_Lectivo = ? AND ${cursoConElectivosSQL('c')} AND ${claseVigente('ha')}`,
    [periodo]
  );
  return filas;
}

// ── CU106: GET /api/electivos/programacion?periodo= ──
const getProgramacion = async (req, res) => {
  try {
    const { periodo, periodos } = await resolverPeriodo(pool, req.query.periodo);
    const plan = await leerPlan(pool, periodo);
    const [bloques] = await pool.query(
      `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Hora_Inicio AS hora_inicio, bh.Bloque_Horario_Hora_Fin AS hora_fin,
              bh.Bloque_Horario_Jornada AS jornada, bh.Bloque_Horario_Tipo AS tipo
         FROM bloque_horario bh WHERE NOT ${condicionDesajustado('bh')} ORDER BY bh.Bloque_Horario_Hora_Inicio`
    );
    const [cursos] = await pool.query(
      `SELECT c.Curso_Id, c.Curso_Nombre FROM curso c
        WHERE c.Curso_Periodo_Lectivo = ? AND ${cursoConElectivosSQL('c')} ORDER BY c.Curso_Nombre`,
      [periodo]
    );
    return res.json({
      periodo,
      periodos: { vigente: periodos.vigente, siguiente: periodos.siguiente },
      dias: DIAS,
      bloques: bloques.map((b) => ({ ...b, hora_inicio: hhmm(b.hora_inicio), hora_fin: hhmm(b.hora_fin) })),
      plan,
      cursos,
      clases: await clasesDelPeriodo(pool, periodo),
      ocupadas: await regularesDeTerceroYCuarto(pool, periodo),
      completitud: await completitudElectivos(pool, periodo),
    });
  } catch (error) {
    return responderError(res, error, 'getProgramacion electivos:', 'No fue posible cargar la programación de electivos');
  }
};

// ── CU106: POST /api/electivos/clases ──
const programarElectivo = async (req, res) => {
  const { dia, Bloque_Horario_Id: bloqueId, Asignatura_Id: asignaturaId, Docente_Usuario_Id: docenteId } = req.body || {};
  let conn;
  try {
    const { periodo } = await resolverPeriodo(pool, req.body?.periodo);
    if (!DIAS.includes(dia) || !idValido(bloqueId) || !idValido(asignaturaId) || !idValido(docenteId)) {
      throw new ErrorElectivo(400, 'Indica día (lunes a viernes), bloque, asignatura, ruta y docente');
    }
    // CU106 Excepción 2: ruta Científica o Humanística (la Técnica no tiene electivos)
    const ruta = normalizarRuta(req.body?.ruta, RUTAS_ELECTIVO);
    if (!ruta) throw new ErrorElectivo(400, 'La ruta del electivo debe ser Científica o Humanística');

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Precondición: plan de electivos del período
    const plan = await leerPlan(conn, periodo);
    if (!plan) throw new ErrorElectivo(409, `Primero registra el plan de electivos de ${periodo} (CU108)`);
    // CU106 Excepción 1: la asignatura debe estar en el plan para esa ruta
    const item = plan.asignaturas.find((a) => a.Asignatura_Id === Number(asignaturaId) && a.ruta === ruta);
    if (!item) throw new ErrorElectivo(400, `La asignatura no pertenece al plan de electivos ${periodo} para la ruta ${ruta}`);

    // Bloque de clase vigente
    const [[bloque]] = await conn.query(
      `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Tipo, bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin,
              ${DURACION_SQL('bh')} AS duracion, ${condicionDesajustado('bh')} AS desajustado
         FROM bloque_horario bh WHERE bh.Bloque_Horario_Id = ?`,
      [bloqueId]
    );
    if (!bloque || bloque.Bloque_Horario_Tipo !== 'Clase' || Number(bloque.desajustado) === 1) {
      throw new ErrorElectivo(422, 'El bloque debe ser un bloque de clase vigente');
    }
    const duracion = Number(bloque.duracion);

    // CU106 Excepción 3: no superar las horas semanales del electivo en el plan
    if (item.horas_programadas + duracion > item.horas + 1e-9) {
      throw new ErrorElectivo(422, `${item.Asignatura_Nombre} (${ruta}) tiene ${item.horas} h semanales en el plan `
        + `y ya tiene ${item.horas_programadas} h programadas: este bloque (${duracion} h) las superaría`);
    }

    // CU106 Excepción 4: el bloque no puede tener clases regulares de 3° o 4° medio
    const [regulares] = await conn.query(
      `SELECT c.Curso_Nombre, a.Asignatura_Nombre FROM horario_asignatura ha
         JOIN curso c ON c.Curso_Id = ha.Curso_Id JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
        WHERE c.Curso_Periodo_Lectivo = ? AND ${cursoConElectivosSQL('c')} AND ${claseVigente('ha')}
          AND ha.Horario_Asignatura_Dia_Semana = ? AND ha.Bloque_Horario_Id = ?`,
      [periodo, dia, bloqueId]
    );
    if (regulares.length > 0) {
      throw new ErrorElectivo(409, `El bloque está ocupado por clases regulares de 3° o 4° medio: `
        + `${regulares.map((r) => `${r.Curso_Nombre} (${r.Asignatura_Nombre})`).join('; ')}`);
    }

    // CU106 Excepción 5: el docente debe estar habilitado en el plan, no tener otra clase ese día
    // y bloque en el período y estar disponible. La especialidad es solo una sugerencia (CU56).
    if (!item.docentes.some((d) => d.Usuario_Id === Number(docenteId))) {
      throw new ErrorElectivo(422, `El docente no está habilitado para ${item.Asignatura_Nombre} (${ruta}) en el plan de electivos`);
    }
    const [[docente]] = await conn.query(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Especialidad, Docente_Carga_Horaria_Semanal
         FROM usuario WHERE Usuario_Id = ? AND Es_Docente = 1 AND ${cuentaUtilizableSQL('usuario')}`,
      [docenteId]
    );
    if (!docente) throw new ErrorElectivo(422, 'El docente no está activo');
    const [choques] = await conn.query(
      `SELECT CONCAT(c.Curso_Nombre, ' (', a.Asignatura_Nombre, ')') AS clase
         FROM horario_asignatura ha
         JOIN curso c ON c.Curso_Id = ha.Curso_Id JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
        WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ? AND ha.Bloque_Horario_Id = ?
          AND c.Curso_Periodo_Lectivo = ? AND ${claseVigente('ha')}
       UNION ALL
       SELECT CONCAT('el electivo ', a.Asignatura_Nombre, ' (', ce.Clase_Electivo_Ruta, ')') AS clase
         FROM clase_electivo ce JOIN asignatura a ON a.Asignatura_Id = ce.Asignatura_Id
        WHERE ce.Docente_Usuario_Id = ? AND ce.Clase_Electivo_Dia_Semana = ? AND ce.Bloque_Horario_Id = ?
          AND ce.Clase_Electivo_Periodo_Lectivo = ?`,
      [docenteId, dia, bloqueId, periodo, docenteId, dia, bloqueId, periodo]
    );
    if (choques.length > 0) {
      throw new ErrorElectivo(409, `${docente.Usuario_Nombre_Completo} ya tiene ${choques[0].clase} ese ${dia} en ese bloque`);
    }
    const fueraDisponibilidad = await validarDisponibilidad(conn, {
      docenteId, periodo, dia,
      horaInicio: bloque.Bloque_Horario_Hora_Inicio, horaFin: bloque.Bloque_Horario_Hora_Fin,
    });
    if (fueraDisponibilidad) throw new ErrorElectivo(422, fueraDisponibilidad);

    // Horas P.I.E.: un bloque P.I.E. del docente no admite clases
    if ((await docentesConPIEEnBloque(conn, [docenteId], periodo, dia, bloqueId)).size > 0) {
      throw new ErrorElectivo(409, `${docente.Usuario_Nombre_Completo} tiene horas P.I.E. ese ${dia} en ese bloque`);
    }
    // RF35 / regla 65/35: clases regulares + electivos del período, en horas pedagógicas,
    // hasta el 65 % de (carga − horas P.I.E.)
    const excedeLectivas = await verificarCargaLectiva(conn, docenteId, periodo);
    if (excedeLectivas) throw new ErrorElectivo(422, excedeLectivas);

    const [r] = await conn.query(
      `INSERT INTO clase_electivo (Clase_Electivo_Periodo_Lectivo, Clase_Electivo_Dia_Semana, Bloque_Horario_Id,
                                   Asignatura_Id, Clase_Electivo_Ruta, Docente_Usuario_Id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [periodo, dia, bloqueId, asignaturaId, ruta, docenteId]
    );
    await conn.commit();

    const resumen = await resumenSemanal(pool, docenteId, periodo);
    return res.status(201).json({
      mensaje: `${item.Asignatura_Nombre} (${ruta}) programado el ${dia} ${hhmm(bloque.Bloque_Horario_Hora_Inicio)}–${hhmm(bloque.Bloque_Horario_Hora_Fin)}`,
      Clase_Electivo_Id: r.insertId,
      sugerencia: sugerenciaEspecialidad(docente.Usuario_Nombre_Completo, docente.Docente_Especialidad, item.Asignatura_Nombre),
      advertencia: advertenciaHorasAdeudadas(resumen, docente.Usuario_Nombre_Completo),
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ese electivo ya está programado en ese día y bloque' });
    }
    return responderError(res, error, 'programarElectivo:', 'No fue posible programar el electivo');
  } finally {
    if (conn) conn.release();
  }
};

// ── CU106: DELETE /api/electivos/clases/:id ──
const eliminarElectivo = async (req, res) => {
  const id = Number(req.params.id);
  if (!idValido(id)) return res.status(400).json({ mensaje: 'Clase de electivo no válida' });
  try {
    const [[clase]] = await pool.query(
      'SELECT Clase_Electivo_Periodo_Lectivo AS periodo FROM clase_electivo WHERE Clase_Electivo_Id = ?', [id]
    );
    if (!clase) return res.status(404).json({ mensaje: 'La clase de electivo no existe' });
    await resolverPeriodo(pool, clase.periodo);
    await pool.query('DELETE FROM clase_electivo WHERE Clase_Electivo_Id = ?', [id]);
    return res.json({ mensaje: 'Electivo eliminado de la programación' });
  } catch (error) {
    return responderError(res, error, 'eliminarElectivo:', 'No fue posible eliminar el electivo');
  }
};

// ── Vista: electivos en el horario de un curso de 3° o 4° medio ──
// GET /api/electivos/curso/:cursoId?ruta=Científica  (la ruta filtra la vista del estudiante)
const getElectivosDeCurso = async (req, res) => {
  const cursoId = Number(req.params.cursoId);
  if (!idValido(cursoId)) return res.status(400).json({ mensaje: 'Curso no válido' });
  try {
    const [[curso]] = await pool.query(
      `SELECT c.Curso_Periodo_Lectivo AS periodo, ${cursoConElectivosSQL('c')} AS tiene FROM curso c WHERE c.Curso_Id = ?`,
      [cursoId]
    );
    if (!curso) return res.status(404).json({ mensaje: 'Curso no encontrado' });
    if (Number(curso.tiene) !== 1) return res.json({ tieneElectivos: false, clases: [] });
    const ruta = normalizarRuta(req.query.ruta, RUTAS_ELECTIVO);
    return res.json({ tieneElectivos: true, periodo: curso.periodo, ruta, clases: await clasesDelPeriodo(pool, curso.periodo, { ruta }) });
  } catch (error) {
    return responderError(res, error, 'getElectivosDeCurso:', 'No fue posible cargar los electivos del curso');
  }
};

module.exports = {
  getPlan,
  crearPlan,
  editarPlan,
  clonarPlan,
  getProgramacion,
  programarElectivo,
  eliminarElectivo,
  getElectivosDeCurso,
  clasesDelPeriodo,
};
