// controllers/promocionController.js
// RF61: situación final de los estudiantes (CU98, CU99) y promoción curso a curso
// o caso por caso (CU100 corregido). Reglas: docs/decisiones-rf60-rf61-periodos.txt.
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const { obtenerPeriodos } = require('../utils/periodos');
const { registrarHistorial } = require('../utils/historial');
const { asignarJefatura, obtenerDocente, mensajeTope } = require('../utils/jefatura');
const {
  ESTADOS, EFECTOS, valoresPermitidos, normalizarValor, normalizarRut, nombreComparable,
} = require('../utils/situacionFinal');

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const esAdministrador = (user) => (user?.roles || []).includes('Administrador');
const nombreCurso = (c) => `${c.Curso_Nombre} (${c.Curso_Periodo_Lectivo})`;

/** Curso con su nivel, orden y el orden máximo de niveles. null si no existe. */
async function obtenerCurso(conn, cursoId, { bloquear = false } = {}) {
  const [filas] = await conn.query(
    `SELECT c.Curso_Id, c.Curso_Nombre, c.Curso_Seccion, c.Curso_Periodo_Lectivo, c.Nivel_Educativo_Id,
            c.Curso_Profesor_Jefe_Usuario_Id, n.Nivel_Educativo_Nombre, n.Nivel_Educativo_Orden,
            (SELECT MAX(Nivel_Educativo_Orden) FROM nivel_educativo) AS Orden_Maximo
       FROM curso c
       JOIN nivel_educativo n ON n.Nivel_Educativo_Id = c.Nivel_Educativo_Id
      WHERE c.Curso_Id = ?${bloquear ? ' FOR UPDATE' : ''}`,
    [cursoId]
  );
  return Array.isArray(filas) ? filas[0] || null : null;
}

/**
 * Valida que el usuario pueda registrar situaciones del curso y que el curso sea
 * del período vigente. Devuelve { curso, periodos } o { status, mensaje }.
 */
async function prepararRegistro(conn, user, cursoId) {
  if (!idValido(cursoId)) return { status: 400, mensaje: 'Curso no válido' };
  const curso = await obtenerCurso(conn, cursoId);
  if (!curso) return { status: 404, mensaje: 'Curso no encontrado' };
  // Registran el profesor jefe del curso, el administrador o el super administrador
  const esJefe = Number(curso.Curso_Profesor_Jefe_Usuario_Id) === Number(user.id);
  if (!esAdministrador(user) && !esJefe) {
    return { status: 403, mensaje: 'Solo el profesor jefe del curso o la administración registran la situación final' };
  }
  const periodos = await obtenerPeriodos(conn);
  if (curso.Curso_Periodo_Lectivo !== periodos.vigente) {
    return { status: 409, mensaje: `La situación final se registra en cursos del período vigente (${periodos.vigente})` };
  }
  return { curso, periodos };
}

/**
 * Estudiantes del curso con su situación final del período: los que siguen en el
 * curso y los que ya salieron por una promoción aplicada desde este curso.
 */
async function estudiantesConSituacion(conn, curso, periodo) {
  const [filas] = await conn.query(
    `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Estudiante_RUT, e.Estudiante_Estado_Academico,
            e.Curso_Id AS Curso_Actual_Id,
            sf.Situacion_Final_Valor, sf.Situacion_Final_Estado, sf.Curso_Id AS Situacion_Curso_Id
       FROM estudiante e
       LEFT JOIN situacion_final sf
              ON sf.Estudiante_Id = e.Estudiante_Id AND sf.Situacion_Final_Periodo_Lectivo = ?
      WHERE e.Estudiante_Fecha_Eliminacion IS NULL
        AND (e.Curso_Id = ? OR (sf.Curso_Id = ? AND sf.Situacion_Final_Estado = ?))
      ORDER BY e.Estudiante_Nombre_Completo`,
    [periodo, curso.Curso_Id, curso.Curso_Id, ESTADOS.APLICADO]
  );
  return (Array.isArray(filas) ? filas : []).map((f) => {
    // Una situación registrada desde otro curso (p. ej. antes de un cambio de sección) no cuenta aquí
    const propia = f.Situacion_Final_Valor && Number(f.Situacion_Curso_Id) === Number(curso.Curso_Id);
    return {
      Estudiante_Id: f.Estudiante_Id,
      Estudiante_Nombre_Completo: f.Estudiante_Nombre_Completo,
      Estudiante_RUT: f.Estudiante_RUT,
      Estudiante_Estado_Academico: f.Estudiante_Estado_Academico,
      enCurso: Number(f.Curso_Actual_Id) === Number(curso.Curso_Id),
      situacion: propia ? { valor: f.Situacion_Final_Valor, estado: f.Situacion_Final_Estado } : null,
    };
  });
}

function resumen(estudiantes) {
  const r = { total: estudiantes.length, sinSituacion: 0, borrador: 0, registrado: 0, aplicado: 0 };
  for (const e of estudiantes) {
    if (!e.situacion) r.sinSituacion += 1;
    else if (e.situacion.estado === ESTADOS.BORRADOR) r.borrador += 1;
    else if (e.situacion.estado === ESTADOS.REGISTRADO) r.registrado += 1;
    else if (e.situacion.estado === ESTADOS.APLICADO) r.aplicado += 1;
  }
  return r;
}

const datosCurso = (curso) => ({
  Curso_Id: curso.Curso_Id,
  Curso_Nombre: curso.Curso_Nombre,
  Curso_Periodo_Lectivo: curso.Curso_Periodo_Lectivo,
  Nivel_Educativo_Nombre: curso.Nivel_Educativo_Nombre,
  Curso_Profesor_Jefe_Usuario_Id: curso.Curso_Profesor_Jefe_Usuario_Id,
});

// ── CU98: listado del curso con la situación final de cada estudiante ──
// GET /api/promocion/cursos/:cursoId/situaciones
const getSituacionesCurso = async (req, res) => {
  try {
    const prep = await prepararRegistro(pool, req.user, Number(req.params.cursoId));
    if (prep.status) return res.status(prep.status).json({ mensaje: prep.mensaje });
    const { curso, periodos } = prep;
    const estudiantes = await estudiantesConSituacion(pool, curso, periodos.vigente);
    return res.json({
      curso: datosCurso(curso),
      periodo: periodos.vigente,
      cierreIniciado: periodos.cierreIniciado,
      valoresPermitidos: valoresPermitidos(curso.Nivel_Educativo_Orden, curso.Orden_Maximo),
      estudiantes,
      resumen: resumen(estudiantes),
    });
  } catch (error) {
    console.error('getSituacionesCurso:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar la situación final del curso' });
  }
};

/**
 * Guarda situaciones (upsert por estudiante y período). `filas` = [{ estudianteId, valor }],
 * ya validadas. Registra en historial las que quedan como Registrado.
 */
async function guardarSituaciones(conn, { curso, periodo, filas, estado, responsableId, origen }) {
  for (const f of filas) {
    await conn.query(
      `INSERT INTO situacion_final
         (Situacion_Final_Periodo_Lectivo, Situacion_Final_Valor, Situacion_Final_Estado,
          Situacion_Final_Fecha_Registro, Estudiante_Id, Curso_Id, Usuario_Responsable_Id)
       VALUES (?, ?, ?, NOW(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         Situacion_Final_Valor = VALUES(Situacion_Final_Valor),
         Situacion_Final_Estado = VALUES(Situacion_Final_Estado),
         Situacion_Final_Fecha_Registro = NOW(),
         Curso_Id = VALUES(Curso_Id),
         Usuario_Responsable_Id = VALUES(Usuario_Responsable_Id)`,
      [periodo, f.valor, estado, f.estudianteId, curso.Curso_Id, responsableId]
    );
    if (estado === ESTADOS.REGISTRADO) {
      await registrarHistorial(conn, {
        atributo: 'Situacion_Final_Valor',
        anterior: f.anterior || null,
        nuevo: f.valor,
        descripcion: `${origen}: situación final ${periodo} registrada en ${nombreCurso(curso)}`,
        estudianteId: f.estudianteId,
        responsableId,
      });
    }
  }
}

// ── CU98: registrar la situación final (borrador o confirmada) ──
// PUT /api/promocion/cursos/:cursoId/situaciones
// Body: { situaciones: [{ estudianteId, valor }], confirmar?: boolean }
const registrarSituaciones = async (req, res) => {
  const { situaciones, confirmar = false } = req.body || {};
  if (!Array.isArray(situaciones) || situaciones.length === 0) {
    return res.status(400).json({ mensaje: 'Debes indicar al menos una situación final' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const prep = await prepararRegistro(conn, req.user, Number(req.params.cursoId));
    if (prep.status) {
      await conn.rollback();
      return res.status(prep.status).json({ mensaje: prep.mensaje });
    }
    const { curso, periodos } = prep;
    const permitidos = valoresPermitidos(curso.Nivel_Educativo_Orden, curso.Orden_Maximo);
    const estudiantes = await estudiantesConSituacion(conn, curso, periodos.vigente);
    const porId = new Map(estudiantes.map((e) => [Number(e.Estudiante_Id), e]));

    const filas = [];
    const vistos = new Set();
    for (const s of situaciones) {
      const id = Number(s?.estudianteId);
      const est = porId.get(id);
      if (!est || !est.enCurso) {
        await conn.rollback();
        return res.status(400).json({ mensaje: `El estudiante ${s?.estudianteId} no pertenece a ${curso.Curso_Nombre}` });
      }
      if (vistos.has(id)) {
        await conn.rollback();
        return res.status(400).json({ mensaje: `${est.Estudiante_Nombre_Completo} aparece dos veces` });
      }
      vistos.add(id);
      // CU98 Excepción 2: la promoción de este estudiante ya se aplicó
      if (est.situacion?.estado === ESTADOS.APLICADO) {
        await conn.rollback();
        return res.status(409).json({ mensaje: `La promoción de ${est.Estudiante_Nombre_Completo} ya fue aplicada: no se puede modificar` });
      }
      if (!permitidos.includes(s.valor)) {
        await conn.rollback();
        return res.status(400).json({
          mensaje: `"${s.valor}" no es una situación válida para ${curso.Nivel_Educativo_Nombre}. Valores: ${permitidos.join(', ')}`,
        });
      }
      filas.push({ estudianteId: id, valor: s.valor, anterior: est.situacion?.valor });
    }

    // CU98 Excepción 1: si faltan estudiantes, se guarda como borrador e indica los faltantes
    const faltantes = estudiantes.filter((e) => e.enCurso && !e.situacion && !vistos.has(Number(e.Estudiante_Id)));
    const estado = confirmar && faltantes.length === 0 ? ESTADOS.REGISTRADO : ESTADOS.BORRADOR;
    await guardarSituaciones(conn, {
      curso, periodo: periodos.vigente, filas, estado, responsableId: req.user.id, origen: 'CU98',
    });

    // Al confirmar, los borradores anteriores del curso que no venían en esta solicitud también se registran
    if (estado === ESTADOS.REGISTRADO) {
      const pendientes = estudiantes
        .filter((e) => e.enCurso && e.situacion?.estado === ESTADOS.BORRADOR && !vistos.has(Number(e.Estudiante_Id)))
        .map((e) => ({ estudianteId: Number(e.Estudiante_Id), valor: e.situacion.valor, anterior: null }));
      await guardarSituaciones(conn, {
        curso, periodo: periodos.vigente, filas: pendientes, estado, responsableId: req.user.id, origen: 'CU98',
      });
    }

    await conn.commit();
    if (confirmar && faltantes.length > 0) {
      return res.json({
        estado,
        mensaje: `Faltan ${faltantes.length} estudiante(s) sin situación final: se guardó como borrador`,
        faltantes: faltantes.map((e) => ({ Estudiante_Id: e.Estudiante_Id, Estudiante_Nombre_Completo: e.Estudiante_Nombre_Completo })),
      });
    }
    return res.json({
      estado,
      mensaje: estado === ESTADOS.REGISTRADO
        ? 'Situación final registrada: queda lista para la promoción'
        : 'Situación final guardada como borrador',
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('registrarSituaciones:', error);
    return res.status(500).json({ mensaje: 'No fue posible guardar la situación final, reintente más tarde' });
  } finally {
    if (conn) conn.release();
  }
};

// ── CU99: plantilla Excel del curso (RUT, Nombre, Situación) ──
// GET /api/promocion/cursos/:cursoId/plantilla
const descargarPlantilla = async (req, res) => {
  try {
    const prep = await prepararRegistro(pool, req.user, Number(req.params.cursoId));
    if (prep.status) return res.status(prep.status).json({ mensaje: prep.mensaje });
    const { curso, periodos } = prep;
    const permitidos = valoresPermitidos(curso.Nivel_Educativo_Orden, curso.Orden_Maximo);
    // Los estudiantes con la promoción ya aplicada no se pueden modificar: no van en la plantilla
    const estudiantes = (await estudiantesConSituacion(pool, curso, periodos.vigente))
      .filter((e) => e.enCurso && e.situacion?.estado !== ESTADOS.APLICADO);

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Situación final');
    hoja.columns = [
      { header: 'RUT', key: 'rut', width: 16 },
      { header: 'Nombre', key: 'nombre', width: 40 },
      { header: 'Situación', key: 'situacion', width: 18 },
    ];
    hoja.getRow(1).font = { bold: true };
    estudiantes.forEach((e) => hoja.addRow({
      rut: e.Estudiante_RUT,
      nombre: e.Estudiante_Nombre_Completo,
      situacion: e.situacion?.valor || '',
    }));
    // Lista desplegable con los valores válidos del nivel
    for (let fila = 2; fila <= Math.max(estudiantes.length + 1, 2); fila += 1) {
      hoja.getCell(`C${fila}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${permitidos.join(',')}"`],
        showErrorMessage: true,
        error: `Valores válidos: ${permitidos.join(', ')}`,
      };
    }
    const nombre = `situacion_final_${curso.Curso_Nombre.replace(/[^\w]+/g, '_')}_${periodos.vigente}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    await libro.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('descargarPlantilla:', error);
    return res.status(500).json({ mensaje: 'No fue posible generar la plantilla' });
  }
};

const textoCelda = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join('') : ''));
  return String(v);
};

/**
 * Lee el Excel: [{ fila, rut, nombre, situacion }] o { error } si no tiene el
 * formato esperado (CU99 Excepción 1).
 */
async function leerExcel(buffer) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    return { error: 'El archivo no es un Excel (.xlsx) válido' };
  }
  const hoja = libro.worksheets[0];
  if (!hoja) return { error: 'El archivo no tiene hojas' };
  const encabezados = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    encabezados[col] = nombreComparable(textoCelda(c.value));
  });
  const col = (nombre) => encabezados.indexOf(nombre);
  const cRut = col('rut');
  const cNombre = col('nombre');
  const cSit = encabezados.findIndex((h) => h === 'situacion' || h === 'situacion final');
  if (cRut < 1 || cNombre < 1 || cSit < 1) {
    return { error: 'El archivo debe tener las columnas RUT, Nombre y Situación (usa la plantilla del curso)' };
  }
  const filas = [];
  hoja.eachRow((row, n) => {
    if (n === 1) return;
    const rut = textoCelda(row.getCell(cRut).value).trim();
    const nombre = textoCelda(row.getCell(cNombre).value).trim();
    const situacion = textoCelda(row.getCell(cSit).value).trim();
    if (!rut && !nombre && !situacion) return;
    filas.push({ fila: n, rut, nombre, situacion });
  });
  if (filas.length === 0) return { error: 'El archivo no tiene filas con estudiantes' };
  return { filas };
}

// ── CU99: cargar la situación final desde Excel ──
// POST /api/promocion/cursos/:cursoId/situaciones/excel   (multipart, campo "archivo")
// Sin ?confirmar=true solo valida y muestra el resumen; con confirmar registra las filas válidas.
const cargarExcel = async (req, res) => {
  if (!req.file) return res.status(400).json({ mensaje: 'Debes adjuntar el archivo Excel (campo "archivo")' });
  const confirmar = String(req.query.confirmar || req.body?.confirmar) === 'true';

  let conn;
  try {
    const lectura = await leerExcel(req.file.buffer);
    if (lectura.error) return res.status(400).json({ mensaje: lectura.error });

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const prep = await prepararRegistro(conn, req.user, Number(req.params.cursoId));
    if (prep.status) {
      await conn.rollback();
      return res.status(prep.status).json({ mensaje: prep.mensaje });
    }
    const { curso, periodos } = prep;
    const permitidos = valoresPermitidos(curso.Nivel_Educativo_Orden, curso.Orden_Maximo);
    const delCurso = await estudiantesConSituacion(conn, curso, periodos.vigente);
    const porRutCurso = new Map(delCurso.filter((e) => e.enCurso).map((e) => [normalizarRut(e.Estudiante_RUT), e]));

    const ruts = [...new Set(lectura.filas.map((f) => normalizarRut(f.rut)).filter(Boolean))];
    const [enSistema] = ruts.length
      ? await conn.query(
        `SELECT e.Estudiante_RUT, c.Curso_Nombre FROM estudiante e JOIN curso c ON c.Curso_Id = e.Curso_Id
          WHERE e.Estudiante_Fecha_Eliminacion IS NULL`
      )
      : [[]];
    const cursoDeRut = new Map((enSistema || []).map((e) => [normalizarRut(e.Estudiante_RUT), e.Curso_Nombre]));

    const validas = [];
    const rechazadas = [];
    const advertencias = [];
    const vistos = new Set();
    for (const f of lectura.filas) {
      const rut = normalizarRut(f.rut);
      const est = rut && porRutCurso.get(rut);
      if (!rut) { rechazadas.push({ ...f, motivo: 'RUT con formato inválido' }); continue; }
      if (!est) {
        rechazadas.push({
          ...f,
          // CU99 Excepciones 2 y 3
          motivo: cursoDeRut.has(rut) ? `El RUT pertenece a otro curso (${cursoDeRut.get(rut)})` : 'El RUT no existe en el sistema',
        });
        continue;
      }
      if (vistos.has(rut)) { rechazadas.push({ ...f, motivo: 'RUT repetido en el archivo' }); continue; }
      vistos.add(rut);
      const valor = normalizarValor(f.situacion, permitidos);
      // CU99 Excepción 4
      if (!valor) {
        rechazadas.push({ ...f, motivo: `Situación no reconocida. Valores: ${permitidos.join(', ')}` });
        continue;
      }
      if (est.situacion?.estado === ESTADOS.APLICADO) {
        rechazadas.push({ ...f, motivo: 'La promoción de este estudiante ya fue aplicada' });
        continue;
      }
      if (nombreComparable(f.nombre) !== nombreComparable(est.Estudiante_Nombre_Completo)) {
        advertencias.push({ fila: f.fila, rut: f.rut, mensaje: `El nombre no coincide con el RUT (en el sistema: ${est.Estudiante_Nombre_Completo})` });
      }
      validas.push({ estudianteId: Number(est.Estudiante_Id), valor, anterior: est.situacion?.valor, fila: f.fila, nombre: est.Estudiante_Nombre_Completo });
    }

    if (confirmar && validas.length > 0) {
      await guardarSituaciones(conn, {
        curso, periodo: periodos.vigente, filas: validas, estado: ESTADOS.REGISTRADO, responsableId: req.user.id, origen: 'CU99',
      });
      await conn.commit();
    } else {
      await conn.rollback();
    }
    return res.json({
      confirmado: confirmar && validas.length > 0,
      mensaje: confirmar
        ? `Se registraron ${validas.length} situación(es) final(es); ${rechazadas.length} fila(s) rechazada(s)`
        : 'Revisa el resumen y confirma para registrar las filas válidas',
      validas: validas.map(({ fila, nombre, valor }) => ({ fila, nombre, valor })),
      rechazadas,
      advertencias,
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('cargarExcel:', error);
    return res.status(500).json({ mensaje: 'No fue posible procesar el archivo, reintente más tarde' });
  } finally {
    if (conn) conn.release();
  }
};

/** Curso de destino (nivel por orden, misma sección, período). null si no existe. */
async function buscarCursoDestino(conn, { nivelOrden, seccion, periodo }) {
  const [filas] = await conn.query(
    `SELECT c.Curso_Id, c.Curso_Nombre, c.Curso_Seccion, c.Curso_Periodo_Lectivo, c.Curso_Profesor_Jefe_Usuario_Id
       FROM curso c JOIN nivel_educativo n ON n.Nivel_Educativo_Id = c.Nivel_Educativo_Id
      WHERE n.Nivel_Educativo_Orden = ? AND c.Curso_Seccion = ? AND c.Curso_Periodo_Lectivo = ?
      FOR UPDATE`,
    [nivelOrden, seccion, periodo]
  );
  return Array.isArray(filas) ? filas[0] || null : null;
}

async function nivelPorOrden(conn, orden) {
  const [filas] = await conn.query(
    'SELECT Nivel_Educativo_Id, Nivel_Educativo_Nombre FROM nivel_educativo WHERE Nivel_Educativo_Orden = ?',
    [orden]
  );
  return Array.isArray(filas) ? filas[0] || null : null;
}

// ── CU100 (corregido): aplicar la promoción de un curso o de estudiantes puntuales ──
// POST /api/promocion/cursos/:cursoId/promover
// Body: { estudianteIds?: number[], crearCursosFaltantes?: boolean }  (Administrador / Super Admin)
const promoverCurso = async (req, res) => {
  const cursoId = Number(req.params.cursoId);
  const { estudianteIds, crearCursosFaltantes = false } = req.body || {};
  if (!idValido(cursoId)) return res.status(400).json({ mensaje: 'Curso no válido' });
  if (estudianteIds !== undefined && (!Array.isArray(estudianteIds) || estudianteIds.some((id) => !idValido(id)))) {
    return res.status(400).json({ mensaje: 'La lista de estudiantes no es válida' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const curso = await obtenerCurso(conn, cursoId, { bloquear: true });
    if (!curso) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Curso no encontrado' });
    }
    const periodos = await obtenerPeriodos(conn, { bloquear: true });
    if (curso.Curso_Periodo_Lectivo !== periodos.vigente) {
      await conn.rollback();
      return res.status(409).json({ mensaje: `Solo se promueven cursos del período vigente (${periodos.vigente})` });
    }

    const [registradas] = await conn.query(
      `SELECT sf.Situacion_Final_Id, sf.Situacion_Final_Valor, sf.Estudiante_Id,
              e.Estudiante_Nombre_Completo, e.Estudiante_Estado_Academico, e.Curso_Id
         FROM situacion_final sf
         JOIN estudiante e ON e.Estudiante_Id = sf.Estudiante_Id
        WHERE sf.Curso_Id = ? AND sf.Situacion_Final_Periodo_Lectivo = ? AND sf.Situacion_Final_Estado = ?
          AND e.Curso_Id = sf.Curso_Id AND e.Estudiante_Fecha_Eliminacion IS NULL
          ${estudianteIds ? 'AND sf.Estudiante_Id IN (?)' : ''}
        FOR UPDATE`,
      estudianteIds
        ? [cursoId, periodos.vigente, ESTADOS.REGISTRADO, estudianteIds.map(Number)]
        : [cursoId, periodos.vigente, ESTADOS.REGISTRADO]
    );
    if (!Array.isArray(registradas) || registradas.length === 0) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'No hay situaciones finales registradas (confirmadas) para promover' });
    }
    if (estudianteIds && registradas.length !== new Set(estudianteIds.map(Number)).size) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'Algunos estudiantes no tienen su situación final registrada en este curso' });
    }

    // Punto abierto 2 (confirmado por el PO): sin el cierre iniciado solo se aplican retiros.
    // Promovido, Repitente, Egresado y En práctica esperan el cierre (CU100, CU101).
    const requierenCierre = registradas.filter((s) => !EFECTOS[s.Situacion_Final_Valor]?.sinCierre);
    if (requierenCierre.length > 0 && !periodos.cierreIniciado) {
      await conn.rollback();
      const valores = [...new Set(requierenCierre.map((s) => s.Situacion_Final_Valor))].join(', ');
      return res.status(409).json({
        mensaje: `Sin el cierre del período iniciado solo se pueden aplicar retiros (${valores} se aplica con el cierre iniciado).`,
      });
    }
    const conDestino = registradas.filter((s) => EFECTOS[s.Situacion_Final_Valor]?.destino);

    // Cursos de destino: nivel siguiente (promovidos) o mismo nivel (repitentes), misma sección
    const destinos = new Map(); // 'siguiente' | 'mismo' -> curso
    const faltantes = [];
    for (const tipo of [...new Set(conDestino.map((s) => EFECTOS[s.Situacion_Final_Valor].destino))]) {
      const orden = Number(curso.Nivel_Educativo_Orden) + (tipo === 'siguiente' ? 1 : 0);
      const nivel = await nivelPorOrden(conn, orden);
      if (!nivel) {
        await conn.rollback();
        return res.status(409).json({ mensaje: `No existe el nivel siguiente a ${curso.Nivel_Educativo_Nombre}` });
      }
      const destino = await buscarCursoDestino(conn, { nivelOrden: orden, seccion: curso.Curso_Seccion, periodo: periodos.siguiente });
      if (destino) destinos.set(tipo, destino);
      else faltantes.push({ tipo, nivel, nombre: `${nivel.Nivel_Educativo_Nombre} ${curso.Curso_Seccion}` });
    }

    // CU100 Excepción 2: no existe el curso de destino → se ofrece crearlo
    if (faltantes.length > 0 && !crearCursosFaltantes) {
      await conn.rollback();
      return res.status(200).json({
        requiereCrearCursos: true,
        mensaje: `Faltan cursos del período ${periodos.siguiente}: ${faltantes.map((f) => f.nombre).join(', ')}. ¿Crearlos?`,
        cursos: faltantes.map((f) => ({ Curso_Nombre: f.nombre, Curso_Periodo_Lectivo: periodos.siguiente })),
      });
    }
    const cursosCreados = [];
    for (const f of faltantes) {
      const [r] = await conn.query(
        'INSERT INTO curso (Curso_Seccion, Curso_Nombre, Nivel_Educativo_Id, Curso_Periodo_Lectivo) VALUES (?, ?, ?, ?)',
        [curso.Curso_Seccion, f.nombre, f.nivel.Nivel_Educativo_Id, periodos.siguiente]
      );
      const nuevo = {
        Curso_Id: r.insertId, Curso_Nombre: f.nombre, Curso_Seccion: curso.Curso_Seccion,
        Curso_Periodo_Lectivo: periodos.siguiente, Curso_Profesor_Jefe_Usuario_Id: null,
      };
      destinos.set(f.tipo, nuevo);
      cursosCreados.push(nombreCurso(nuevo));
    }

    // El profesor jefe acompaña a su curso: el curso de destino de los promovidos
    // hereda al jefe si aún no tiene uno y si no pasa el tope de jefaturas.
    const advertencias = [];
    const destinoPromovidos = destinos.get('siguiente');
    if (destinoPromovidos && !destinoPromovidos.Curso_Profesor_Jefe_Usuario_Id && curso.Curso_Profesor_Jefe_Usuario_Id) {
      const jefe = await obtenerDocente(conn, curso.Curso_Profesor_Jefe_Usuario_Id);
      if (jefe && jefe.Es_Docente && jefe.Usuario_Estado_Cuenta) {
        const r = await asignarJefatura(conn, {
          curso: destinoPromovidos, docente: jefe, responsableId: req.user.id,
          descripcion: `RF61: profesor jefe heredado de ${nombreCurso(curso)}`,
        });
        if (r.ok) destinoPromovidos.Curso_Profesor_Jefe_Usuario_Id = jefe.Usuario_Id;
        else advertencias.push(`No se heredó el profesor jefe: ${mensajeTope(jefe, r.cursos)} Asígnalo a mano.`);
      } else {
        advertencias.push(`No se heredó el profesor jefe de ${curso.Curso_Nombre}: su cuenta no está activa como docente.`);
      }
    }

    // Aplicar cada situación
    const aplicadas = { Promovido: 0, Repitente: 0, Egresado: 0, 'En práctica': 0, Retirado: 0 };
    for (const s of registradas) {
      const efecto = EFECTOS[s.Situacion_Final_Valor];
      const descripcion = `CU100: promoción ${periodos.vigente} (${s.Situacion_Final_Valor})`;
      if (efecto.destino) {
        const destino = destinos.get(efecto.destino);
        await conn.query('UPDATE estudiante SET Curso_Id = ? WHERE Estudiante_Id = ?', [destino.Curso_Id, s.Estudiante_Id]);
        await registrarHistorial(conn, {
          atributo: 'Curso_Id', anterior: nombreCurso(curso), nuevo: nombreCurso(destino),
          descripcion, estudianteId: s.Estudiante_Id, responsableId: req.user.id,
        });
      } else {
        await conn.query('UPDATE estudiante SET Estudiante_Estado_Academico = ? WHERE Estudiante_Id = ?', [efecto.estadoAcademico, s.Estudiante_Id]);
        await registrarHistorial(conn, {
          atributo: 'Estudiante_Estado_Academico', anterior: s.Estudiante_Estado_Academico, nuevo: efecto.estadoAcademico,
          descripcion, estudianteId: s.Estudiante_Id, responsableId: req.user.id,
        });
      }
      await conn.query('UPDATE situacion_final SET Situacion_Final_Estado = ? WHERE Situacion_Final_Id = ?', [ESTADOS.APLICADO, s.Situacion_Final_Id]);
      aplicadas[s.Situacion_Final_Valor] += 1;
    }

    await conn.commit();
    return res.json({
      mensaje: `Promoción aplicada a ${registradas.length} estudiante(s) de ${curso.Curso_Nombre}`,
      aplicadas,
      cursosCreados,
      advertencias,
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('promoverCurso:', error);
    return res.status(500).json({ mensaje: 'No fue posible aplicar la promoción, reintente más tarde' });
  } finally {
    if (conn) conn.release();
  }
};

module.exports = {
  getSituacionesCurso,
  registrarSituaciones,
  descargarPlantilla,
  cargarExcel,
  promoverCurso,
  // Exportados para pruebas y para el estado del cierre
  leerExcel,
  estudiantesConSituacion,
};
