// Calendario de evaluaciones (RF58, RF59 / CU92, CU93, CU94).
//
// El docente registra evaluaciones de los cursos y asignaturas que tiene asignados en el
// período vigente y solo modifica o elimina las suyas. El calendario mensual muestra, según
// el rol activo: al apoderado, las del curso del estudiante seleccionado (titular o
// suplente); al docente, las de los cursos donde hace clases o es profesor jefe; al
// administrador, las de toda la institución.
const pool = require('../config/db');
const { claseVigente } = require('../utils/clasesEliminadas');
const { enPeriodoVigente, cursoNoArchivado } = require('../utils/periodos');
const { esApoderadoDelEstudiante } = require('../utils/apoderadosEstudiante');

const TIPOS_EVALUACION = ['Prueba', 'Control', 'Trabajo', 'Disertación', 'Examen', 'Otra'];
const MIN_CONTENIDOS = 3;
const MAX_CONTENIDOS = 1000;

// Eventos que no suspenden clases (bloquesController, IMPACTOS_EVENTO)
const IMPACTO_SIN_SUSPENSION = 'Sin impacto';

const ROLES_CALENDARIO = ['Docente', 'Apoderado', 'Administrador'];

const pad = (n) => String(n).padStart(2, '0');
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const esDiaHabil = (fecha) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay();
  return dia !== 0 && dia !== 6;
};

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

/** Rol con que se consulta: el rol activo enviado (?rol=) si lo tiene; si no, el primero aplicable. */
function resolverRol(user, rolSolicitado) {
  const roles = user?.roles || [];
  if (ROLES_CALENDARIO.includes(rolSolicitado) && roles.includes(rolSolicitado)) return rolSolicitado;
  return ROLES_CALENDARIO.find((r) => roles.includes(r)) || null;
}

/** "2026-11" → { desde: "2026-11-01", hasta: "2026-11-30" }, o null si no es un mes válido. */
function rangoDelMes(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
  if (!m) return null;
  const anio = Number(m[1]);
  const numMes = Number(m[2]);
  if (numMes < 1 || numMes > 12) return null;
  const ultimo = new Date(anio, numMes, 0).getDate();
  return { desde: `${m[1]}-${m[2]}-01`, hasta: `${m[1]}-${m[2]}-${pad(ultimo)}` };
}

/**
 * CU92 Excepción 2 (y validaciones del registro que reutiliza CU93).
 * Devuelve { errores } o { datos } normalizados.
 */
function validarEvaluacion(body = {}) {
  const { Curso_Id, Asignatura_Id, Evaluacion_Fecha, Evaluacion_Tipo, Evaluacion_Contenidos } = body;
  const errores = {};

  if (!idValido(Curso_Id) || !idValido(Asignatura_Id)) errores.asignacion = 'Selecciona el curso y la asignatura';

  if (!Evaluacion_Fecha) errores.fecha = 'La fecha es obligatoria';
  else if (!esFechaValida(Evaluacion_Fecha)) errores.fecha = 'Formato de fecha inválido';
  else if (Evaluacion_Fecha < hoyISO()) errores.fecha = 'La fecha no puede ser anterior a hoy';
  else if (!esDiaHabil(Evaluacion_Fecha)) errores.fecha = 'La evaluación debe ser en un día hábil (lunes a viernes)';

  if (!Evaluacion_Tipo) errores.tipo = 'El tipo de evaluación es obligatorio';
  else if (!TIPOS_EVALUACION.includes(Evaluacion_Tipo)) errores.tipo = 'Tipo de evaluación inválido';

  const contenidos = typeof Evaluacion_Contenidos === 'string' ? Evaluacion_Contenidos.trim() : '';
  if (!contenidos) errores.contenidos = 'Los contenidos son obligatorios';
  else if (contenidos.length < MIN_CONTENIDOS) errores.contenidos = `Los contenidos deben tener al menos ${MIN_CONTENIDOS} caracteres`;
  else if (contenidos.length > MAX_CONTENIDOS) errores.contenidos = `Los contenidos no pueden superar los ${MAX_CONTENIDOS} caracteres`;

  if (Object.keys(errores).length > 0) return { errores };
  return {
    datos: {
      cursoId: Number(Curso_Id),
      asignaturaId: Number(Asignatura_Id),
      fecha: Evaluacion_Fecha,
      tipo: Evaluacion_Tipo,
      contenidos,
    },
  };
}

/** Cursos y asignaturas que el docente tiene asignados en el período vigente (CU92). */
async function obtenerAsignaciones(conn, docenteId) {
  const [filas] = await conn.query(
    `SELECT DISTINCT ha.Curso_Id, c.Curso_Nombre, ha.Asignatura_Id, a.Asignatura_Nombre
       FROM horario_asignatura ha
       JOIN curso c      ON c.Curso_Id = ha.Curso_Id
       JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
      WHERE ha.Usuario_Id = ? AND ${claseVigente('ha')} AND ${enPeriodoVigente('ha')}
      ORDER BY c.Curso_Nombre, a.Asignatura_Nombre`,
    [docenteId]
  );
  return filas;
}

async function tieneAsignacion(conn, docenteId, cursoId, asignaturaId) {
  const [filas] = await conn.query(
    `SELECT 1 FROM horario_asignatura ha
      WHERE ha.Usuario_Id = ? AND ha.Curso_Id = ? AND ha.Asignatura_Id = ?
        AND ${claseVigente('ha')} AND ${enPeriodoVigente('ha')}
      LIMIT 1`,
    [docenteId, cursoId, asignaturaId]
  );
  return filas.length > 0;
}

/** CU92 Excepción 3: eventos institucionales de la fecha que suspenden clases (total o parcialmente). */
async function eventosQueSuspenden(conn, fecha) {
  const [filas] = await conn.query(
    `SELECT Evento_Institucional_Id, Evento_Institucional_Nombre, Evento_Institucional_Impacto_Clases
       FROM evento_institucional
      WHERE Evento_Institucional_Fecha = ? AND Evento_Institucional_Impacto_Clases <> ?`,
    [fecha, IMPACTO_SIN_SUSPENSION]
  );
  return filas;
}

const confirmado = (v) => v === true || v === 'true' || v === 1 || v === '1';

const SELECT_EVALUACION = `
  SELECT ev.Evaluacion_Id,
         DATE_FORMAT(ev.Evaluacion_Fecha, '%Y-%m-%d') AS Evaluacion_Fecha,
         ev.Evaluacion_Tipo, ev.Evaluacion_Contenidos,
         ev.Curso_Id, c.Curso_Nombre,
         ev.Asignatura_Id, a.Asignatura_Nombre,
         ev.Docente_Usuario_Id, u.Usuario_Nombre_Completo AS Docente_Nombre
    FROM evaluacion ev
    JOIN curso c      ON c.Curso_Id = ev.Curso_Id
    JOIN asignatura a ON a.Asignatura_Id = ev.Asignatura_Id
    JOIN usuario u    ON u.Usuario_Id = ev.Docente_Usuario_Id`;

const ORDEN = 'ORDER BY ev.Evaluacion_Fecha, c.Curso_Nombre, a.Asignatura_Nombre, ev.Evaluacion_Id';

const formatear = (fila, userId) => ({ ...fila, Es_Propia: Number(fila.Docente_Usuario_Id) === Number(userId) });

// ── CU92 paso 2: cursos y asignaturas del docente ──
const getMisAsignaciones = async (req, res) => {
  if (!(req.user?.roles || []).includes('Docente')) {
    return res.status(403).json({ mensaje: 'Solo un docente puede registrar evaluaciones' });
  }
  try {
    const asignaciones = await obtenerAsignaciones(pool, req.user.id);
    // CU92 Excepción 1: el docente no tiene asignaciones
    if (asignaciones.length === 0) {
      return res.status(200).json({
        mensaje: 'No tienes cursos ni asignaturas asignados en el período vigente',
        asignaciones: [],
      });
    }
    return res.json(asignaciones);
  } catch (error) {
    console.error('getMisAsignaciones:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar tus asignaciones' });
  }
};

// ── CU94: calendario mensual según el rol activo ──
// GET /api/evaluaciones?mes=YYYY-MM&rol=&estudianteId=&cursoId=&asignaturaId=
const getEvaluaciones = async (req, res) => {
  const rol = resolverRol(req.user, req.query.rol);
  if (!rol) return res.status(403).json({ mensaje: 'No tienes permiso para consultar el calendario de evaluaciones' });

  const rango = rangoDelMes(req.query.mes);
  if (!rango) return res.status(400).json({ mensaje: 'Indica un mes válido (AAAA-MM)' });

  const { estudianteId, cursoId, asignaturaId } = req.query;
  if (asignaturaId && !idValido(asignaturaId)) return res.status(400).json({ mensaje: 'Asignatura inválida' });
  if (cursoId && !idValido(cursoId)) return res.status(400).json({ mensaje: 'Curso inválido' });

  try {
    const condiciones = ['ev.Evaluacion_Fecha BETWEEN ? AND ?'];
    const params = [rango.desde, rango.hasta];

    if (rol === 'Apoderado') {
      // El apoderado elige al estudiante: solo los suyos (titular o suplente)
      if (!idValido(estudianteId)) return res.status(400).json({ mensaje: 'Selecciona un estudiante' });
      if (!(await esApoderadoDelEstudiante(pool, req.user.id, Number(estudianteId)))) {
        return res.status(404).json({ mensaje: 'El estudiante no existe o no está asociado a tu cuenta' });
      }
      condiciones.push('ev.Curso_Id = (SELECT e.Curso_Id FROM estudiante e WHERE e.Estudiante_Id = ?)');
      params.push(Number(estudianteId));
    } else if (rol === 'Docente') {
      // Cursos donde hace clases en el período vigente o de los que es profesor jefe
      condiciones.push(`ev.Curso_Id IN (
        SELECT ha.Curso_Id FROM horario_asignatura ha
         WHERE ha.Usuario_Id = ? AND ${claseVigente('ha')} AND ${enPeriodoVigente('ha')}
        UNION
        SELECT cj.Curso_Id FROM curso cj
         WHERE cj.Curso_Profesor_Jefe_Usuario_Id = ? AND ${cursoNoArchivado('cj')}
      )`);
      params.push(req.user.id, req.user.id);
      if (cursoId) {
        condiciones.push('ev.Curso_Id = ?');
        params.push(Number(cursoId));
      }
    } else {
      condiciones.push(cursoNoArchivado('c'));
      if (cursoId) {
        condiciones.push('ev.Curso_Id = ?');
        params.push(Number(cursoId));
      }
    }

    if (asignaturaId) {
      condiciones.push('ev.Asignatura_Id = ?');
      params.push(Number(asignaturaId));
    }

    const [filas] = await pool.query(`${SELECT_EVALUACION} WHERE ${condiciones.join(' AND ')} ${ORDEN}`, params);
    const evaluaciones = filas.map((f) => formatear(f, req.user.id));

    // CU94 Excepción 1: no hay evaluaciones registradas en el mes
    if (evaluaciones.length === 0) {
      return res.status(200).json({ mensaje: 'No hay evaluaciones registradas en este mes', evaluaciones: [] });
    }
    return res.json(evaluaciones);
  } catch (error) {
    console.error('getEvaluaciones:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar el calendario de evaluaciones' });
  }
};

/**
 * Validaciones comunes de CU92 y CU93: datos, asignación del docente y evento institucional.
 * Devuelve { datos } o { status, body } con la respuesta de error.
 */
async function validarRegistro(conn, user, body) {
  const { errores, datos } = validarEvaluacion(body);
  if (errores) return { status: 400, body: { mensaje: 'Datos incompletos o inválidos', errores } };

  if (!(await tieneAsignacion(conn, user.id, datos.cursoId, datos.asignaturaId))) {
    return {
      status: 403,
      body: { mensaje: 'Solo puedes registrar evaluaciones de los cursos y asignaturas que tienes asignados' },
    };
  }

  // CU92 Excepción 3: se advierte antes de guardar; el docente puede confirmar
  const eventos = await eventosQueSuspenden(conn, datos.fecha);
  if (eventos.length > 0 && !confirmado(body?.confirmar)) {
    const nombres = eventos.map((e) => `${e.Evento_Institucional_Nombre} (${e.Evento_Institucional_Impacto_Clases})`).join(', ');
    return {
      status: 409,
      body: {
        mensaje: `La fecha coincide con un evento institucional que suspende clases: ${nombres}. ¿Deseas registrarla de todos modos?`,
        requiereConfirmacion: true,
        eventos,
      },
    };
  }
  return { datos };
}

const SOLO_DOCENTE = { mensaje: 'Solo un docente puede registrar evaluaciones' };
const NO_EXISTE = { mensaje: 'La evaluación no existe' };
const AJENA = { mensaje: 'La evaluación pertenece a otro docente; no puedes modificarla' };

async function buscarEvaluacion(conn, id) {
  if (!idValido(id)) return null;
  const [filas] = await conn.query(`${SELECT_EVALUACION} WHERE ev.Evaluacion_Id = ?`, [Number(id)]);
  return filas[0] || null;
}

// ── CU92: registrar evaluación ──
const crearEvaluacion = async (req, res) => {
  if (!(req.user?.roles || []).includes('Docente')) return res.status(403).json(SOLO_DOCENTE);
  try {
    const resultado = await validarRegistro(pool, req.user, req.body);
    if (!resultado.datos) return res.status(resultado.status).json(resultado.body);
    const { cursoId, asignaturaId, fecha, tipo, contenidos } = resultado.datos;

    const [insert] = await pool.query(
      `INSERT INTO evaluacion
         (Evaluacion_Fecha, Evaluacion_Tipo, Evaluacion_Contenidos, Curso_Id, Asignatura_Id, Docente_Usuario_Id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fecha, tipo, contenidos, cursoId, asignaturaId, req.user.id]
    );
    const evaluacion = await buscarEvaluacion(pool, insert.insertId);
    return res.status(201).json({
      mensaje: 'Evaluación registrada. Ya es visible en el calendario del curso.',
      evaluacion: evaluacion && formatear(evaluacion, req.user.id),
    });
  } catch (error) {
    console.error('crearEvaluacion:', error);
    return res.status(500).json({ mensaje: 'No fue posible registrar la evaluación' });
  }
};

// ── CU93: modificar evaluación propia ──
const actualizarEvaluacion = async (req, res) => {
  if (!(req.user?.roles || []).includes('Docente')) return res.status(403).json(SOLO_DOCENTE);
  try {
    const actual = await buscarEvaluacion(pool, req.params.id);
    if (!actual) return res.status(404).json(NO_EXISTE);
    // CU93 Excepción 1: la evaluación pertenece a otro docente
    if (Number(actual.Docente_Usuario_Id) !== Number(req.user.id)) return res.status(403).json(AJENA);

    const resultado = await validarRegistro(pool, req.user, req.body);
    if (!resultado.datos) return res.status(resultado.status).json(resultado.body);
    const { cursoId, asignaturaId, fecha, tipo, contenidos } = resultado.datos;

    await pool.query(
      `UPDATE evaluacion
          SET Evaluacion_Fecha = ?, Evaluacion_Tipo = ?, Evaluacion_Contenidos = ?, Curso_Id = ?, Asignatura_Id = ?
        WHERE Evaluacion_Id = ? AND Docente_Usuario_Id = ?`,
      [fecha, tipo, contenidos, cursoId, asignaturaId, actual.Evaluacion_Id, req.user.id]
    );
    return res.json({ mensaje: 'Evaluación actualizada' });
  } catch (error) {
    console.error('actualizarEvaluacion:', error);
    return res.status(500).json({ mensaje: 'No fue posible actualizar la evaluación' });
  }
};

// ── CU93: eliminar evaluación propia ──
const eliminarEvaluacion = async (req, res) => {
  if (!(req.user?.roles || []).includes('Docente')) return res.status(403).json(SOLO_DOCENTE);
  try {
    const actual = await buscarEvaluacion(pool, req.params.id);
    if (!actual) return res.status(404).json(NO_EXISTE);
    if (Number(actual.Docente_Usuario_Id) !== Number(req.user.id)) return res.status(403).json(AJENA);

    await pool.query('DELETE FROM evaluacion WHERE Evaluacion_Id = ? AND Docente_Usuario_Id = ?', [
      actual.Evaluacion_Id,
      req.user.id,
    ]);
    return res.json({ mensaje: 'Evaluación eliminada' });
  } catch (error) {
    console.error('eliminarEvaluacion:', error);
    return res.status(500).json({ mensaje: 'No fue posible eliminar la evaluación' });
  }
};

module.exports = {
  getMisAsignaciones,
  getEvaluaciones,
  crearEvaluacion,
  actualizarEvaluacion,
  eliminarEvaluacion,
  // Exportados para las pruebas unitarias
  TIPOS_EVALUACION,
  validarEvaluacion,
  rangoDelMes,
};
