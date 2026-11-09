// controllers/profesorJefeController.js
// RF60: profesor jefe de curso (CU95, CU96) y estudiantes de un curso (CU97).
// Reglas en utils/jefatura.js y docs/decisiones-rf60-rf61-periodos.txt (punto 3).
const pool = require('../config/db');
const { claseVigente } = require('../utils/clasesEliminadas');
const { obtenerPeriodos } = require('../utils/periodos');
const { registrarHistorial, refPersona } = require('../utils/historial');
const { RUTAS, nivelConRutaSQL, normalizarRuta } = require('../utils/rutaFormacion');
const { asignarJefatura, obtenerDocente, jefaturasDelDocente, mensajeTope, nombreCurso } = require('../utils/jefatura');

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const esAdministrador = (user) => (user?.roles || []).includes('Administrador');

/** Curso bloqueado para la transacción, con su profesor jefe actual. null si no existe. */
async function cursoParaJefatura(conn, cursoId) {
  const [filas] = await conn.query(
    `SELECT c.Curso_Id, c.Curso_Nombre, c.Curso_Periodo_Lectivo, c.Curso_Profesor_Jefe_Usuario_Id,
            pj.Usuario_RUT, pj.Usuario_Nombre_Completo
       FROM curso c
       LEFT JOIN usuario pj ON pj.Usuario_Id = c.Curso_Profesor_Jefe_Usuario_Id
      WHERE c.Curso_Id = ? FOR UPDATE`,
    [cursoId]
  );
  return Array.isArray(filas) ? filas[0] || null : null;
}

const jefeDe = (curso) => (curso.Curso_Profesor_Jefe_Usuario_Id
  ? {
    Usuario_Id: curso.Curso_Profesor_Jefe_Usuario_Id,
    Usuario_RUT: curso.Usuario_RUT,
    Usuario_Nombre_Completo: curso.Usuario_Nombre_Completo,
  }
  : null);

/** CU96 Exc. 2: situaciones finales aún no aplicadas que registró el jefe actual en el curso. */
async function situacionesEnRegistro(conn, cursoId, jefeId) {
  const [[fila]] = await conn.query(
    `SELECT COUNT(*) AS total FROM situacion_final
      WHERE Curso_Id = ? AND Usuario_Responsable_Id = ? AND Situacion_Final_Estado <> 'Aplicado'`,
    [cursoId, jefeId]
  );
  return Number(fila?.total || 0);
}

// ── CU95 / CU96: designar o reemplazar al profesor jefe ──
// PUT /api/cursos/:id/profesor-jefe
// Body: { docenteId, confirmarReemplazo?: boolean, confirmarSituaciones?: boolean }
const designarProfesorJefe = async (req, res) => {
  const cursoId = Number(req.params.id);
  const { docenteId, confirmarReemplazo = false, confirmarSituaciones = false } = req.body || {};
  if (!idValido(cursoId)) return res.status(400).json({ mensaje: 'Curso no válido' });
  if (!idValido(docenteId)) return res.status(400).json({ mensaje: 'Debes seleccionar un docente' });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const curso = await cursoParaJefatura(conn, cursoId);
    if (!curso) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Curso no encontrado' });
    }
    const { vigente } = await obtenerPeriodos(conn);
    if (curso.Curso_Periodo_Lectivo < vigente) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'El curso pertenece a un período ya cerrado' });
    }

    const docente = await obtenerDocente(conn, Number(docenteId));
    if (!docente || !docente.Es_Docente) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Docente no encontrado' });
    }
    // CU95 Excepción 1: el docente seleccionado está inactivo
    if (!docente.Usuario_Estado_Cuenta) {
      await conn.rollback();
      return res.status(400).json({ mensaje: `La cuenta de ${docente.Usuario_Nombre_Completo} está inactiva` });
    }

    const jefeActual = jefeDe(curso);
    if (jefeActual && Number(jefeActual.Usuario_Id) === Number(docente.Usuario_Id)) {
      await conn.rollback();
      return res.json({ mensaje: `${docente.Usuario_Nombre_Completo} ya es el profesor jefe de ${curso.Curso_Nombre}` });
    }

    if (jefeActual) {
      // CU95 Excepción 2: el curso ya tiene profesor jefe → confirmar el reemplazo
      if (!confirmarReemplazo) {
        await conn.rollback();
        return res.status(200).json({
          requiereConfirmacion: true,
          mensaje: `${curso.Curso_Nombre} ya tiene como profesor jefe a ${jefeActual.Usuario_Nombre_Completo}. `
            + '¿Confirmas el reemplazo?',
          jefeActual: { Usuario_Id: jefeActual.Usuario_Id, Usuario_Nombre_Completo: jefeActual.Usuario_Nombre_Completo },
        });
      }
      // CU96 Excepción 2: el jefe actual tiene situaciones finales en registro
      const pendientes = await situacionesEnRegistro(conn, curso.Curso_Id, jefeActual.Usuario_Id);
      if (pendientes > 0 && !confirmarSituaciones) {
        await conn.rollback();
        return res.status(200).json({
          requiereConfirmacionAdicional: true,
          mensaje: `${jefeActual.Usuario_Nombre_Completo} tiene ${pendientes} situación(es) final(es) en registro `
            + 'en este curso. Se conservan, pero el nuevo profesor jefe podrá modificarlas. ¿Confirmas?',
        });
      }
    }

    const resultado = await asignarJefatura(conn, {
      curso,
      docente,
      jefeAnterior: jefeActual,
      responsableId: req.user.id,
      descripcion: jefeActual ? 'CU96: reemplazo de profesor jefe' : 'CU95: designación de profesor jefe',
    });
    if (!resultado.ok) {
      await conn.rollback();
      return res.status(409).json({ mensaje: mensajeTope(docente, resultado.cursos) });
    }

    await conn.commit();
    return res.json({
      mensaje: `${docente.Usuario_Nombre_Completo} quedó como profesor jefe de ${nombreCurso(curso)}`,
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('designarProfesorJefe:', error);
    return res.status(500).json({ mensaje: 'No fue posible registrar la jefatura, reintente más tarde' });
  } finally {
    if (conn) conn.release();
  }
};

// ── CU96: retirar la jefatura de un curso ──
// DELETE /api/cursos/:id/profesor-jefe   Body: { confirmarSituaciones?: boolean }
const retirarProfesorJefe = async (req, res) => {
  const cursoId = Number(req.params.id);
  const confirmarSituaciones = req.body?.confirmarSituaciones === true;
  if (!idValido(cursoId)) return res.status(400).json({ mensaje: 'Curso no válido' });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const curso = await cursoParaJefatura(conn, cursoId);
    if (!curso) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Curso no encontrado' });
    }
    const jefeActual = jefeDe(curso);
    // CU96 Excepción 1: el curso no tiene profesor jefe
    if (!jefeActual) {
      await conn.rollback();
      return res.status(400).json({ mensaje: `${curso.Curso_Nombre} no tiene profesor jefe` });
    }
    // CU96 Excepción 2
    const pendientes = await situacionesEnRegistro(conn, curso.Curso_Id, jefeActual.Usuario_Id);
    if (pendientes > 0 && !confirmarSituaciones) {
      await conn.rollback();
      return res.status(200).json({
        requiereConfirmacionAdicional: true,
        mensaje: `${jefeActual.Usuario_Nombre_Completo} tiene ${pendientes} situación(es) final(es) en registro `
          + 'en este curso. Se conservan. ¿Confirmas que quieres retirar la jefatura?',
      });
    }

    await conn.query('UPDATE curso SET Curso_Profesor_Jefe_Usuario_Id = NULL WHERE Curso_Id = ?', [curso.Curso_Id]);
    await registrarHistorial(conn, {
      atributo: 'Curso_Profesor_Jefe_Usuario_Id',
      anterior: refPersona(jefeActual),
      nuevo: null,
      descripcion: `CU96: retiro de profesor jefe: ${nombreCurso(curso)}`,
      usuarioId: jefeActual.Usuario_Id,
      responsableId: req.user.id,
    });
    await conn.commit();
    return res.json({ mensaje: `Se retiró la jefatura de ${curso.Curso_Nombre}` });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('retirarProfesorJefe:', error);
    return res.status(500).json({ mensaje: 'No fue posible retirar la jefatura, reintente más tarde' });
  } finally {
    if (conn) conn.release();
  }
};

/** ¿El docente imparte clases (vigentes) en el curso o es su profesor jefe? */
async function docenteTieneRelacion(conn, docenteId, cursoId) {
  const [filas] = await conn.query(
    `SELECT 1 FROM curso c
      WHERE c.Curso_Id = ? AND (
        c.Curso_Profesor_Jefe_Usuario_Id = ?
        OR EXISTS (SELECT 1 FROM horario_asignatura ha
                    WHERE ha.Curso_Id = c.Curso_Id AND ha.Usuario_Id = ? AND ${claseVigente('ha')})
      ) LIMIT 1`,
    [cursoId, docenteId, docenteId]
  );
  return Array.isArray(filas) && filas.length > 0;
}

// ── CU97: estudiantes de un curso desde la gestión de cursos ──
// GET /api/cursos/:id/estudiantes  (Administrador / Super Admin; Docente con relación)
const getEstudiantesDeCurso = async (req, res) => {
  const cursoId = Number(req.params.id);
  if (!idValido(cursoId)) return res.status(400).json({ mensaje: 'Curso no válido' });
  const admin = esAdministrador(req.user);
  const docente = (req.user?.roles || []).includes('Docente');
  if (!admin && !docente) {
    return res.status(403).json({ mensaje: 'No tienes permiso para ver los estudiantes de este curso' });
  }

  try {
    const [cursos] = await pool.query(
      `SELECT c.Curso_Id, c.Curso_Nombre, c.Curso_Periodo_Lectivo, c.Curso_Profesor_Jefe_Usuario_Id,
              (SELECT ${nivelConRutaSQL('n')} FROM nivel_educativo n WHERE n.Nivel_Educativo_Id = c.Nivel_Educativo_Id) AS Permite_Ruta
         FROM curso c WHERE c.Curso_Id = ?`,
      [cursoId]
    );
    if (cursos.length === 0) return res.status(404).json({ mensaje: 'Curso no encontrado' });
    cursos[0].Permite_Ruta = Number(cursos[0].Permite_Ruta) === 1; // CU105: 2°, 3° y 4° medio

    // CU97 Excepción 2: el docente no tiene relación con el curso
    if (!admin && !(await docenteTieneRelacion(pool, req.user.id, cursoId))) {
      return res.status(403).json({ mensaje: 'No impartes clases ni eres profesor jefe de este curso' });
    }

    const [estudiantes] = await pool.query(
      `SELECT Estudiante_Id, Estudiante_Nombre_Completo, Estudiante_RUT, Estudiante_Estado_Academico,
              Estudiante_Ruta_Formacion
         FROM estudiante
        WHERE Curso_Id = ? AND Estudiante_Fecha_Eliminacion IS NULL
        ORDER BY Estudiante_Nombre_Completo`,
      [cursoId]
    );
    return res.json({
      curso: cursos[0],
      estudiantes,
      // CU97 Excepción 1: el curso no tiene estudiantes
      ...(estudiantes.length === 0 && { mensaje: 'El curso no tiene estudiantes' }),
    });
  } catch (error) {
    console.error('getEstudiantesDeCurso:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar los estudiantes del curso' });
  }
};

// ── Cursos de los que el docente autenticado es profesor jefe (período vigente y siguiente) ──
// GET /api/cursos/mis-jefaturas
const getMisJefaturas = async (req, res) => {
  try {
    const { vigente, siguiente } = await obtenerPeriodos(pool);
    const periodos = [vigente, siguiente].filter(Boolean);
    const cursos = [];
    for (const periodo of periodos) {
      cursos.push(...(await jefaturasDelDocente(pool, req.user.id, periodo)).map((c) => ({ ...c, Curso_Periodo_Lectivo: periodo })));
    }
    return res.json({ periodoVigente: vigente, cursos });
  } catch (error) {
    console.error('getMisJefaturas:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar tus jefaturas' });
  }
};

// ── CU105: asignar la ruta de formación a estudiantes desde la pestaña del curso ──
// PUT /api/cursos/:id/ruta-formacion   Body: { estudianteIds: [..], ruta: 'Científica' }
const asignarRutaFormacion = async (req, res) => {
  const cursoId = Number(req.params.id);
  const { estudianteIds } = req.body || {};
  if (!idValido(cursoId)) return res.status(400).json({ mensaje: 'Curso no válido' });
  // CU105 Excepción 2: la ruta debe ser Científica, Humanística o Técnica
  const ruta = normalizarRuta(req.body?.ruta);
  if (!ruta) return res.status(400).json({ mensaje: `La ruta debe ser ${RUTAS.join(', ')}` });
  if (!Array.isArray(estudianteIds) || estudianteIds.length === 0 || estudianteIds.some((id) => !idValido(id))) {
    return res.status(400).json({ mensaje: 'Selecciona uno o más estudiantes' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [[curso]] = await conn.query(
      `SELECT c.Curso_Id, c.Curso_Nombre, c.Curso_Periodo_Lectivo, ${nivelConRutaSQL('n')} AS Permite_Ruta
         FROM curso c JOIN nivel_educativo n ON n.Nivel_Educativo_Id = c.Nivel_Educativo_Id
        WHERE c.Curso_Id = ?`,
      [cursoId]
    );
    if (!curso) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Curso no encontrado' });
    }
    // CU105 Excepción 1: la ruta se decide desde 2° medio
    if (Number(curso.Permite_Ruta) !== 1) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'La ruta de formación solo se asigna a estudiantes de 2°, 3° y 4° medio' });
    }
    const ids = [...new Set(estudianteIds.map(Number))];
    const [estudiantes] = await conn.query(
      `SELECT Estudiante_Id, Estudiante_Ruta_Formacion FROM estudiante
        WHERE Estudiante_Id IN (?) AND Curso_Id = ? AND Estudiante_Fecha_Eliminacion IS NULL FOR UPDATE`,
      [ids, cursoId]
    );
    if (estudiantes.length !== ids.length) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'Algunos estudiantes no pertenecen a este curso' });
    }
    let cambiados = 0;
    for (const e of estudiantes) {
      if (e.Estudiante_Ruta_Formacion === ruta) continue;
      await conn.query('UPDATE estudiante SET Estudiante_Ruta_Formacion = ? WHERE Estudiante_Id = ?', [ruta, e.Estudiante_Id]);
      await registrarHistorial(conn, {
        atributo: 'Estudiante_Ruta_Formacion',
        anterior: e.Estudiante_Ruta_Formacion,
        nuevo: ruta,
        descripcion: `CU105: ruta de formación (${nombreCurso(curso)})`,
        estudianteId: e.Estudiante_Id,
        responsableId: req.user.id,
      });
      cambiados += 1;
    }
    await conn.commit();
    return res.json({
      mensaje: cambiados > 0
        ? `Ruta ${ruta} registrada para ${cambiados} estudiante(s)`
        : `Los estudiantes seleccionados ya tenían la ruta ${ruta}`,
      ruta,
      cambiados,
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('asignarRutaFormacion:', error);
    return res.status(500).json({ mensaje: 'No fue posible registrar la ruta de formación' });
  } finally {
    if (conn) conn.release();
  }
};

module.exports = {
  designarProfesorJefe, retirarProfesorJefe, getEstudiantesDeCurso, getMisJefaturas, docenteTieneRelacion,
  asignarRutaFormacion,
};
