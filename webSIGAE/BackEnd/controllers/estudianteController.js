// controllers/estudianteController.js
// Maneja la tabla `estudiante`. El estudiante NO es un usuario del sistema,
// no tiene login. Es solo una ficha con información académica.

const db = require('../config/db');
const { registrarHistorial, refPersona, buscarPersonas } = require('../utils/historial');
const { claseVigente } = require('../utils/clasesEliminadas');
const { cursoNoArchivado } = require('../utils/periodos');
const { condicionApoderadoAsociado, rolApoderadoSQL, puedeAsociarse, reactivarApoderados } = require('../utils/apoderadosEstudiante');
const {
  validarRut,
  validarNombreCompleto,
  validarDireccion,
  direccionDesdeColumnas,
  columnasDireccion,
  CAMPOS_DIRECCION_ESTUDIANTE,
} = require('../middleware/validation');

const MENSAJE_NOMBRE_INVALIDO = 'El nombre completo debe contener solo letras y espacios (nombre y apellido, máx. 100 caracteres)';

// CU34 y CU35: Visualizar listado de estudiantes, con filtros opcionales por curso y estado académico
// Endpoint: GET /api/estudiantes?curso=...&estado=...
const getEstudiantes = async (req, res) => {
  const { curso, estado } = req.query;
  const hayFiltros = (curso && curso.trim() !== '') || (estado && estado.trim() !== '');

  try {
    const { roles, id: userId } = req.user;
    const esAdmin = roles.includes('Administrador');
    const esDocente = roles.includes('Docente') && !esAdmin;

    // Actor(es) del CU34: Super Administrador, Administrador, Docente (no Apoderado)
    if (!esAdmin && !esDocente) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    let rows;
    if (esDocente) {
      // Un Docente solo ve estudiantes de los cursos donde tiene asignaturas asignadas
      const [cursos] = await db.query(
        `SELECT DISTINCT Curso_Id FROM horario_asignatura WHERE Usuario_Id = ? AND ${claseVigente('horario_asignatura')}`,
        [userId]
      );

      // Excepción: Docente sin cursos asignados
      if (cursos.length === 0) {
        return res.status(200).json({
          mensaje: 'No existen estudiantes disponibles para su perfil',
          estudiantes: [],
        });
      }

      const cursoIds = cursos.map((c) => c.Curso_Id);
      let sql = `
        SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Estudiante_RUT,
               e.Estudiante_Estado_Academico, e.Curso_Id, e.Apoderado_Usuario_Id, c.Curso_Nombre,
               e.Estudiante_Calle, e.Estudiante_Numero, e.Estudiante_Depto, e.Estudiante_Comuna
        FROM estudiante e
        JOIN curso c ON c.Curso_Id = e.Curso_Id
        WHERE e.Curso_Id IN (?) AND e.Estudiante_Fecha_Eliminacion IS NULL
      `;
      const params = [cursoIds];

      // Filtros opcionales (CU35) — un Docente no puede filtrar fuera de sus propios cursos
      if (curso && curso.trim() !== '') {
        sql += ' AND c.Curso_Nombre = ?';
        params.push(curso.trim());
      }
      if (estado && estado.trim() !== '') {
        sql += ' AND e.Estudiante_Estado_Academico = ?';
        params.push(estado.trim());
      }

      sql += ' ORDER BY e.Estudiante_Nombre_Completo ASC';
      [rows] = await db.query(sql, params);
    } else {
      let sql = `
        SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Estudiante_RUT,
               e.Estudiante_Estado_Academico, e.Curso_Id, e.Apoderado_Usuario_Id, c.Curso_Nombre,
               e.Estudiante_Calle, e.Estudiante_Numero, e.Estudiante_Depto, e.Estudiante_Comuna
        FROM estudiante e
        JOIN curso c ON c.Curso_Id = e.Curso_Id
        WHERE e.Estudiante_Fecha_Eliminacion IS NULL
      `;
      const params = [];

      // Filtros opcionales (CU35)
      if (curso && curso.trim() !== '') {
        sql += ' AND c.Curso_Nombre = ?';
        params.push(curso.trim());
      }
      if (estado && estado.trim() !== '') {
        sql += ' AND e.Estudiante_Estado_Academico = ?';
        params.push(estado.trim());
      }

      sql += ' ORDER BY e.Estudiante_Nombre_Completo ASC';
      [rows] = await db.query(sql, params);
    }

    if (rows.length === 0) {
      // CU34 (sin filtros): no existen estudiantes registrados en el sistema.
      // CU35/CU37 (con filtros): ninguno cumple las condiciones seleccionadas.
      return res.status(200).json({
        mensaje: hayFiltros
          ? 'No existen estudiantes que cumplan las condiciones'
          : 'No hay estudiantes registrados',
        estudiantes: [],
      });
    }

    res.json(rows);
  } catch (error) {
    console.error(error);
    // CU37: con filtros aplicados, mensaje distinto al de CU34 sin filtros
    res.status(500).json({
      mensaje: hayFiltros
        ? 'No fue posible completar la consulta, reintente más tarde'
        : 'No fue posible recuperar los registros',
    });
  }
};

// CU36: Buscar estudiantes por nombre completo o RUT
// Endpoint: GET /api/estudiantes/buscar?criterio=...
const buscarEstudiantes = async (req, res) => {
  const { roles, id: userId } = req.user;
  const esAdmin = roles.includes('Administrador');
  const esDocente = roles.includes('Docente') && !esAdmin;

  // Actor(es) del CU36: Super Administrador, Administrador, Docente (no Apoderado)
  if (!esAdmin && !esDocente) {
    return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
  }

  // CU36 - Excepción "Criterio vacío o solo espacios"
  const criterio = (req.query.criterio || '').trim();
  if (!criterio) {
    return res.status(400).json({ mensaje: 'Ingrese al menos un carácter para realizar la búsqueda' });
  }

  try {
    let rows;
    if (esDocente) {
      // Un Docente solo puede buscar entre estudiantes de sus propios cursos
      const [cursos] = await db.query(
        `SELECT DISTINCT Curso_Id FROM horario_asignatura WHERE Usuario_Id = ? AND ${claseVigente('horario_asignatura')}`,
        [userId]
      );

      // CU36 - Excepción "Docente sin cursos asignados"
      if (cursos.length === 0) {
        return res.status(200).json({
          mensaje: 'No existen estudiantes disponibles para su perfil',
          estudiantes: [],
        });
      }

      const cursoIds = cursos.map((c) => c.Curso_Id);
      [rows] = await db.query(
        `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Estudiante_RUT,
                e.Estudiante_Estado_Academico, e.Curso_Id, e.Apoderado_Usuario_Id, c.Curso_Nombre,
                e.Estudiante_Calle, e.Estudiante_Numero, e.Estudiante_Depto, e.Estudiante_Comuna
         FROM estudiante e
         JOIN curso c ON c.Curso_Id = e.Curso_Id
         WHERE e.Curso_Id IN (?) AND e.Estudiante_Fecha_Eliminacion IS NULL
           AND (e.Estudiante_Nombre_Completo LIKE ? OR e.Estudiante_RUT LIKE ?)
         ORDER BY e.Estudiante_Nombre_Completo ASC`,
        [cursoIds, `%${criterio}%`, `%${criterio}%`]
      );
    } else {
      [rows] = await db.query(
        `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Estudiante_RUT,
                e.Estudiante_Estado_Academico, e.Curso_Id, e.Apoderado_Usuario_Id, c.Curso_Nombre,
                e.Estudiante_Calle, e.Estudiante_Numero, e.Estudiante_Depto, e.Estudiante_Comuna
         FROM estudiante e
         JOIN curso c ON c.Curso_Id = e.Curso_Id
         WHERE e.Estudiante_Fecha_Eliminacion IS NULL
           AND (e.Estudiante_Nombre_Completo LIKE ? OR e.Estudiante_RUT LIKE ?)
         ORDER BY e.Estudiante_Nombre_Completo ASC`,
        [`%${criterio}%`, `%${criterio}%`]
      );
    }

    // CU36 - Excepción "Sin coincidencias"
    if (rows.length === 0) {
      return res.status(200).json({
        mensaje: 'No se encontraron estudiantes con el criterio ingresado',
        estudiantes: [],
      });
    }

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'No fue posible completar la consulta, reintente más tarde' });
  }
};

// Obtener un estudiante por ID
const getEstudianteById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM estudiante WHERE Estudiante_Id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Estudiante no encontrado' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener el estudiante' });
  }
};

// Crear ficha estudiantil
const createEstudiante = async (req, res) => {
  const {
    Estudiante_Nombre_Completo,
    Estudiante_RUT,
    Curso_Id,
    Estudiante_Estado_Academico,
    Apoderado_Usuario_Id,
  } = req.body;

  if (!Estudiante_Nombre_Completo || !Estudiante_RUT || !Curso_Id || !Estudiante_Estado_Academico) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios (nombre, RUT, curso, estado académico)' });
  }

  if (!validarRut(Estudiante_RUT)) {
    return res.status(400).json({ mensaje: 'RUT de estudiante inválido (verifique el dígito verificador)' });
  }

  if (!validarNombreCompleto(Estudiante_Nombre_Completo)) {
    return res.status(400).json({ mensaje: MENSAJE_NOMBRE_INVALIDO });
  }

  // Incremento 3: dirección separada (calle, número y comuna obligatorios; depto opcional)
  const direccion = direccionDesdeColumnas(req.body, CAMPOS_DIRECCION_ESTUDIANTE);
  const errorDireccion = validarDireccion(direccion);
  if (errorDireccion) {
    return res.status(400).json({ mensaje: errorDireccion });
  }

  try {
    // Verificar RUT duplicado
    const [existe] = await db.query(
      'SELECT Estudiante_Id FROM estudiante WHERE Estudiante_RUT = ?',
      [Estudiante_RUT]
    );
    if (existe.length > 0) {
      return res.status(400).json({ mensaje: 'Ya existe un estudiante con ese RUT' });
    }

    // RF06 / CU6: el curso debe existir y estar activo en el período vigente o, con el
    // cierre iniciado, en el siguiente (no en un período anterior)
    const [curso] = await db.query(
      `SELECT c.Curso_Id FROM curso c WHERE c.Curso_Id = ? AND ${cursoNoArchivado('c')}`, [Curso_Id]
    );
    if (curso.length === 0) {
      return res.status(404).json({
        mensaje: `No se encontró el curso con Id ${Curso_Id} en el período vigente ni en el siguiente`,
      });
    }

    const [resultado] = await db.query(
      `INSERT INTO estudiante (
        Estudiante_Nombre_Completo,
        Estudiante_RUT,
        Curso_Id,
        Estudiante_Estado_Academico,
        Apoderado_Usuario_Id,
        Estudiante_Calle,
        Estudiante_Numero,
        Estudiante_Depto,
        Estudiante_Comuna
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Estudiante_Nombre_Completo,
        Estudiante_RUT,
        Curso_Id,
        Estudiante_Estado_Academico,
        Apoderado_Usuario_Id || null,
        ...columnasDireccion(direccion, CAMPOS_DIRECCION_ESTUDIANTE).map(([, valor]) => valor),
      ]
    );

    const [nuevo] = await db.query(
      'SELECT * FROM estudiante WHERE Estudiante_Id = ?',
      [resultado.insertId]
    );
    res.status(201).json(nuevo[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar el estudiante' });
  }
};

const CAMPOS_EDITABLES_ESTUDIANTE = new Set([
  'Estudiante_Nombre_Completo',
  'Estudiante_RUT',
  'Curso_Id',
  'Estudiante_Estado_Academico',
  'Apoderado_Usuario_Id',
  ...Object.values(CAMPOS_DIRECCION_ESTUDIANTE),
]);

// CU38: Editar curso asociado y estado académico (y otros campos editables) de un estudiante
const updateEstudiante = async (req, res) => {
  const { id } = req.params;
  const datos = { ...req.body };
  delete datos.Estudiante_Id;

  const datosFiltrados = Object.fromEntries(
    Object.entries(datos).filter(([k]) => CAMPOS_EDITABLES_ESTUDIANTE.has(k))
  );

  if (Object.keys(datosFiltrados).length === 0) {
    return res.status(400).json({ mensaje: 'No hay campos válidos para actualizar' });
  }

  if (datosFiltrados.Estudiante_Nombre_Completo !== undefined) {
    if (!validarNombreCompleto(datosFiltrados.Estudiante_Nombre_Completo)) {
      return res.status(400).json({ mensaje: MENSAJE_NOMBRE_INVALIDO });
    }
    datosFiltrados.Estudiante_Nombre_Completo = datosFiltrados.Estudiante_Nombre_Completo.trim();
  }

  // Dirección: solo se validan los campos enviados; los vacíos se guardan como NULL
  const direccionEnviada = direccionDesdeColumnas(datosFiltrados, CAMPOS_DIRECCION_ESTUDIANTE);
  const errorDireccion = validarDireccion(direccionEnviada, { parcial: true });
  if (errorDireccion) {
    return res.status(400).json({ mensaje: errorDireccion });
  }
  for (const [columna, valor] of columnasDireccion(direccionEnviada, CAMPOS_DIRECCION_ESTUDIANTE)) {
    if (datosFiltrados[columna] !== undefined) datosFiltrados[columna] = valor;
  }

  try {
    const [existe] = await db.query('SELECT * FROM estudiante WHERE Estudiante_Id = ?', [id]);
    if (existe.length === 0) {
      return res.status(404).json({ mensaje: 'Estudiante no encontrado' });
    }
    const actual = existe[0];

    // CU38 - Excepción "Curso no existe o inactivo" (solo si el curso realmente cambia)
    if (
      Object.prototype.hasOwnProperty.call(datosFiltrados, 'Curso_Id') &&
      String(datosFiltrados.Curso_Id) !== String(actual.Curso_Id)
    ) {
      // CU38: el curso debe existir y estar activo en el período vigente o siguiente
      const [curso] = await db.query(
        `SELECT c.Curso_Id FROM curso c WHERE c.Curso_Id = ? AND ${cursoNoArchivado('c')}`, [datosFiltrados.Curso_Id]
      );
      if (curso.length === 0) {
        return res.status(400).json({ mensaje: 'El curso seleccionado no existe o no está activo en el período vigente ni en el siguiente' });
      }
    }

    // CU38 - Excepción "Sin modificaciones"
    const hayCambios = Object.entries(datosFiltrados).some(
      ([campo, valor]) => String(actual[campo] ?? '') !== String(valor ?? '')
    );
    if (!hayCambios) {
      return res.status(200).json({ mensaje: 'No existen cambios para actualizar' });
    }

    const campos  = Object.keys(datosFiltrados).map(c => `${c} = ?`);
    const valores = [...Object.values(datosFiltrados), id];

    await db.query(
      `UPDATE estudiante SET ${campos.join(', ')} WHERE Estudiante_Id = ?`,
      valores
    );

    const [actualizado] = await db.query('SELECT * FROM estudiante WHERE Estudiante_Id = ?', [id]);
    res.json({ mensaje: 'Ficha actualizada correctamente', estudiante: actualizado[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar el estudiante' });
  }
};

// Eliminar ficha estudiantil
// RNF16: preserva la ficha estudiantil (eliminación lógica) en lugar de
// borrar el registro físico, igual que ya se hace con las asociaciones
// apoderado-estudiante, para mantener la integridad histórica.
const deleteEstudiante = async (req, res) => {
  const { id } = req.params;
  try {
    const [resultado] = await db.query(
      `UPDATE estudiante SET Estudiante_Fecha_Eliminacion = NOW()
       WHERE Estudiante_Id = ? AND Estudiante_Fecha_Eliminacion IS NULL`,
      [id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Estudiante no encontrado' });
    }
    res.json({ mensaje: 'Ficha estudiantil eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al eliminar el estudiante' });
  }
};

// ── NUEVAS FUNCIONES ─────────────────────────────────────────────────────────

// Obtener estudiantes sin apoderado asignado (para el selector del modal)
const getEstudiantesSinApoderado = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
        e.Estudiante_Id,
        e.Estudiante_Nombre_Completo,
        e.Estudiante_RUT,
        e.Estudiante_Estado_Academico,
        c.Curso_Nombre
       FROM estudiante e
       JOIN curso c ON e.Curso_Id = c.Curso_Id
       WHERE e.Apoderado_Usuario_Id IS NULL AND e.Estudiante_Fecha_Eliminacion IS NULL
       ORDER BY e.Estudiante_Nombre_Completo ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener estudiantes sin apoderado' });
  }
};

// Asignar apoderado a uno o más estudiantes (CU 7 y CU 8)
// Body: { apoderadoId: number, estudianteIds: number[] }
const asignarApoderado = async (req, res) => {
  const { apoderadoId, estudianteIds } = req.body;

  if (!apoderadoId || !Array.isArray(estudianteIds) || estudianteIds.length === 0) {
    return res.status(400).json({
      mensaje: 'Se requiere apoderadoId y al menos un estudianteId',
    });
  }

  const conn = await db.getConnection();
  try {
    const [apoderado] = await conn.query(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Es_Apoderado, Usuario_Estado_Cuenta, Apoderado_Sin_Asociaciones_Desde
       FROM usuario WHERE Usuario_Id = ?`,
      [apoderadoId]
    );

    if (apoderado.length === 0)
      return res.status(404).json({ mensaje: 'Apoderado no encontrado' });
    if (!apoderado[0].Es_Apoderado)
      return res.status(400).json({ mensaje: 'El usuario seleccionado no tiene rol de apoderado' });
    // Inactivo por haber quedado sin estudiantes: se puede asociar y se reactiva
    if (!puedeAsociarse(apoderado[0]))
      return res.status(400).json({ mensaje: 'El apoderado seleccionado está inactivo' });

    await conn.beginTransaction();

    const asignados     = [];
    const omitidos      = [];
    const noEncontrados = [];

    for (const estudianteId of estudianteIds) {
      const [estudiante] = await conn.query(
        'SELECT Estudiante_Id, Estudiante_Nombre_Completo, Apoderado_Usuario_Id FROM estudiante WHERE Estudiante_Id = ?',
        [estudianteId]
      );

      if (estudiante.length === 0) {
        noEncontrados.push(estudianteId);
        continue;
      }

      if (estudiante[0].Apoderado_Usuario_Id === apoderadoId) {
        omitidos.push(estudiante[0].Estudiante_Nombre_Completo);
        continue;
      }

      await conn.query(
        'UPDATE estudiante SET Apoderado_Usuario_Id = ? WHERE Estudiante_Id = ?',
        [apoderadoId, estudianteId]
      );
      // RF57: si era suplente del estudiante, deja de serlo al quedar como titular
      await conn.query(
        'DELETE FROM apoderado_suplente WHERE Estudiante_Id = ? AND Suplente_Usuario_Id = ?',
        [estudianteId, apoderadoId]
      );
      asignados.push(estudiante[0].Estudiante_Nombre_Completo);
    }

    if (asignados.length > 0) await reactivarApoderados(conn, [apoderado[0]]);
    await conn.commit();
    res.json({
      mensaje      : 'Proceso completado',
      asignados    : asignados.length,
      omitidos     : omitidos.length,
      noEncontrados: noEncontrados.length,
      detalle      : { asignados, omitidos, noEncontrados },
    });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error(error);
    res.status(500).json({ mensaje: 'Error al asignar apoderado' });
  } finally {
    conn.release();
  }
};

const verificarRut = async (req, res) => {
  const { rut } = req.query;
  if (!rut) return res.status(400).json({ mensaje: 'RUT requerido' });
  try {
    const [rows] = await db.query(
      'SELECT Estudiante_Id FROM estudiante WHERE Estudiante_RUT = ?',
      [rut]
    );
    res.json({ existe: rows.length > 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al verificar el RUT' });
  }
};

// ==========================================
// CU9: Eliminar todas las asociaciones de un apoderado
// ==========================================
const eliminarTodasAsociacionesApoderado = async (req, res) => {
  const { apoderadoId } = req.params;
  let conn;

  try {
    // 1. Validar existencia y estado del apoderado
    const [apoderado] = await db.query(
      'SELECT Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo, Usuario_Estado_Cuenta, Es_Apoderado FROM usuario WHERE Usuario_Id = ?',
      [apoderadoId]
    );

    if (apoderado.length === 0) {
      return res.status(404).json({ mensaje: 'Apoderado no encontrado' });
    }

    if (!apoderado[0].Usuario_Estado_Cuenta) {
      return res.status(400).json({ mensaje: 'La cuenta del apoderado está inactiva' });
    }

    // 2-4 en una transacción: el cambio y su registro en historial van juntos.
    conn = await db.getConnection();
    await conn.beginTransaction();

    // 2. Excepción 1: Verificar que tenga asociaciones activas, como titular o como
    // suplente (RF57). Las filas quedan bloqueadas hasta el commit.
    const [comoTitular] = await conn.query(
      'SELECT Estudiante_Id FROM estudiante WHERE Apoderado_Usuario_Id = ? FOR UPDATE',
      [apoderadoId]
    );
    const [comoSuplente] = await conn.query(
      'SELECT Estudiante_Id FROM apoderado_suplente WHERE Suplente_Usuario_Id = ? FOR UPDATE',
      [apoderadoId]
    );

    if (comoTitular.length === 0 && comoSuplente.length === 0) {
      await conn.rollback();
      return res.status(400).json({
        mensaje: 'No existen asociaciones disponibles para eliminar',
      });
    }

    // 3. Desvincular todas las relaciones (eliminación lógica de la relación)
    const [resultado] = await conn.query(
      'UPDATE estudiante SET Apoderado_Usuario_Id = NULL WHERE Apoderado_Usuario_Id = ?',
      [apoderadoId]
    );

    // RF57: también deja de ser suplente de cualquier estudiante
    const [resultadoSuplente] = await conn.query(
      'DELETE FROM apoderado_suplente WHERE Suplente_Usuario_Id = ?',
      [apoderadoId]
    );
    const suplenciasEliminadas = resultadoSuplente?.affectedRows || 0;

    // 4. Registra trazabilidad: una fila por estudiante desvinculado
    for (const { Estudiante_Id } of comoTitular) {
      await registrarHistorial(conn, {
        atributo: 'Apoderado_Usuario_Id',
        anterior: refPersona(apoderado[0]),
        nuevo: null,
        descripcion: 'CU9: eliminación de todas las asociaciones del apoderado',
        usuarioId: Number(apoderadoId),
        estudianteId: Estudiante_Id,
        responsableId: req.user.id,
      });
    }
    for (const { Estudiante_Id } of comoSuplente) {
      await registrarHistorial(conn, {
        atributo: 'apoderado_suplente',
        anterior: refPersona(apoderado[0]),
        nuevo: null,
        descripcion: 'CU9: eliminación de todas las asociaciones del apoderado (suplencia)',
        usuarioId: Number(apoderadoId),
        estudianteId: Estudiante_Id,
        responsableId: req.user.id,
      });
    }

    await conn.commit();

    return res.json({
      mensaje: 'Todas las asociaciones activas fueron eliminadas exitosamente',
      eliminadas: resultado.affectedRows + suplenciasEliminadas,
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error(error);
    return res.status(500).json({ mensaje: 'Error al eliminar las asociaciones del apoderado' });
  } finally {
    if (conn) conn.release();
  }
};

// ==========================================
// CU10: Eliminar asociación específica entre apoderado y estudiante
// ==========================================
const eliminarAsociacionEspecifica = async (req, res) => {
  const { estudianteId } = req.params;
  let conn;

  try {
    const [estudiante] = await db.query(
      'SELECT Estudiante_Id, Estudiante_Nombre_Completo, Apoderado_Usuario_Id FROM estudiante WHERE Estudiante_Id = ?',
      [estudianteId]
    );

    if (estudiante.length === 0) {
      return res.status(404).json({ mensaje: 'Ficha de estudiante no encontrada' });
    }

    // Excepción 1: la asociación ya no se encuentra activa
    if (!estudiante[0].Apoderado_Usuario_Id) {
      return res.status(400).json({
        mensaje: 'No fue posible completar la eliminación',
      });
    }

    const apoderadoAnterior = estudiante[0].Apoderado_Usuario_Id;

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Solo si sigue asociado al mismo apoderado que se leyó (evita pisar un cambio concurrente)
    const [resultado] = await conn.query(
      'UPDATE estudiante SET Apoderado_Usuario_Id = NULL WHERE Estudiante_Id = ? AND Apoderado_Usuario_Id = ?',
      [estudianteId, apoderadoAnterior]
    );

    if (resultado.affectedRows === 0) {
      await conn.rollback();
      return res.status(400).json({
        mensaje: 'No fue posible completar la eliminación',
      });
    }

    // Registra trazabilidad
    const personasCU10 = await buscarPersonas(conn, [apoderadoAnterior]);
    await registrarHistorial(conn, {
      atributo: 'Apoderado_Usuario_Id',
      anterior: refPersona(personasCU10.get(Number(apoderadoAnterior))),
      nuevo: null,
      descripcion: 'CU10: eliminación de la asociación apoderado-estudiante',
      usuarioId: apoderadoAnterior,
      estudianteId: estudiante[0].Estudiante_Id,
      responsableId: req.user.id,
    });

    await conn.commit();

    return res.json({
      mensaje: 'Asociación específica eliminada exitosamente',
      estudiante: estudiante[0].Estudiante_Nombre_Completo,
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error(error);
    return res.status(500).json({ mensaje: 'Error al eliminar la asociación específica' });
  } finally {
    if (conn) conn.release();
  }
};

// CU40: Visualizar estudiantes asociados a un apoderado
// GET /api/estudiantes/apoderado/:apoderadoId/asociados
const getEstudiantesAsociados = async (req, res) => {
  try {
    const { roles, id: userId } = req.user;
    const esAdmin = roles.includes('Administrador');
    const esApoderadoSinAdmin = roles.includes('Apoderado') && !esAdmin;

    // Solo el propio Apoderado o un Administrador/SuperAdmin pueden consultar esta información
    if (!esApoderadoSinAdmin && !esAdmin) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    // Si el actor es Apoderado (y no Admin), solo puede ver sus propios estudiantes asociados
    const apoderadoId = esApoderadoSinAdmin ? userId : Number(req.params.apoderadoId);

    // Excepción 2: el apoderado destino no existe (solo relevante cuando lo busca un Admin/SuperAdmin)
    if (!esApoderadoSinAdmin) {
      const [apoderado] = await db.query(
        'SELECT Usuario_Id FROM usuario WHERE Usuario_Id = ? AND Es_Apoderado = 1',
        [apoderadoId]
      );
      if (apoderado.length === 0) {
        return res.status(404).json({ mensaje: 'El apoderado no fue encontrado' });
      }
    }

    // RF57: incluye a los estudiantes de los que es titular o suplente
    const [estudiantes] = await db.query(
      `SELECT
        e.Estudiante_Id,
        e.Estudiante_Nombre_Completo,
        e.Estudiante_RUT,
        e.Estudiante_Estado_Academico,
        c.Curso_Nombre,
        ${rolApoderadoSQL('e')} AS Rol_Apoderado
      FROM estudiante e
      JOIN curso c ON c.Curso_Id = e.Curso_Id
      WHERE ${condicionApoderadoAsociado('e')}
      ORDER BY e.Estudiante_Nombre_Completo ASC`,
      [apoderadoId, apoderadoId, apoderadoId]
    );

    // Excepción 1: el apoderado no tiene estudiantes asociados
    if (estudiantes.length === 0) {
      return res.status(200).json({
        mensaje: 'No existen estudiantes asociados a la cuenta',
        estudiantes: [],
      });
    }

    return res.json(estudiantes);
  } catch (error) {
    console.error(error);
    // Excepción 3: interrupción técnica durante la consulta
    return res.status(500).json({ mensaje: 'No fue posible cargar estudiantes, reintente más tarde' });
  }
};

// CU39: Editar asociaciones de un estudiante sin modificar sus datos personales
// PUT /api/estudiantes/:estudianteId/apoderado  { apoderadoId: number|null }
const editarAsociaciones = async (req, res) => {
  const { estudianteId } = req.params;
  const apoderadoIdBody = req.body.apoderadoId;
  const confirmarEliminacion = req.body.confirmarEliminacion === true;

  if (apoderadoIdBody === undefined) {
    return res.status(400).json({ mensaje: 'Debe indicar un apoderadoId (o null para eliminar la asociación)' });
  }

  // Normaliza a Number o null para comparar de forma confiable contra el valor almacenado
  const apoderadoId = apoderadoIdBody === null ? null : Number(apoderadoIdBody);
  let conn;
  let nuevoApoderado = null;

  try {
    const [estudiante] = await db.query(
      'SELECT Estudiante_Id, Apoderado_Usuario_Id FROM estudiante WHERE Estudiante_Id = ?',
      [estudianteId]
    );

    if (estudiante.length === 0) {
      return res.status(404).json({ mensaje: 'Ficha de estudiante no encontrada' });
    }

    const apoderadoActual = estudiante[0].Apoderado_Usuario_Id;

    // Excepción "Apoderado ya vinculado": no duplicar la asociación existente
    if (apoderadoId === apoderadoActual) {
      return res.status(400).json({ mensaje: 'La asociación ya existe, no se duplicará el registro' });
    }

    // CU39 - Excepción "Elimina última asociación": un estudiante solo puede tener un
    // apoderado a la vez, así que eliminar la asociación actual siempre deja al
    // estudiante sin ninguna. Se exige una confirmación adicional antes de aplicarlo.
    if (apoderadoId === null && apoderadoActual !== null && !confirmarEliminacion) {
      return res.status(200).json({
        mensaje: 'Esta acción eliminará la única asociación registrada del estudiante. Confirme nuevamente para continuar.',
        requiereConfirmacion: true,
      });
    }

    // Si se asigna un nuevo apoderado (no se está eliminando), validar que exista y esté activo
    if (apoderadoId !== null) {
      const [apoderado] = await db.query(
        'SELECT Usuario_Id, Usuario_Estado_Cuenta, Apoderado_Sin_Asociaciones_Desde FROM usuario WHERE Usuario_Id = ? AND Es_Apoderado = 1',
        [apoderadoId]
      );
      if (apoderado.length === 0) {
        return res.status(404).json({ mensaje: 'Apoderado no encontrado' });
      }
      nuevoApoderado = apoderado[0];
      // Inactivo por haber quedado sin estudiantes: se puede asociar y se reactiva
      if (!puedeAsociarse(apoderado[0])) {
        return res.status(400).json({ mensaje: 'El apoderado seleccionado está inactivo' });
      }
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Solo si el apoderado sigue siendo el que se leyó (<=> compara también NULL)
    const [resultado] = await conn.query(
      'UPDATE estudiante SET Apoderado_Usuario_Id = ? WHERE Estudiante_Id = ? AND Apoderado_Usuario_Id <=> ?',
      [apoderadoId, estudianteId, apoderadoActual]
    );
    if (resultado.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'La asociación cambió mientras se editaba. Recargue e intente nuevamente.' });
    }

    // RF57: si el nuevo titular era suplente del estudiante, deja de serlo
    if (apoderadoId !== null) {
      await conn.query(
        'DELETE FROM apoderado_suplente WHERE Estudiante_Id = ? AND Suplente_Usuario_Id = ?',
        [estudianteId, apoderadoId]
      );
      if (nuevoApoderado) await reactivarApoderados(conn, [nuevoApoderado]);
    }

    // Registra trazabilidad
    const personasCU39 = await buscarPersonas(conn, [apoderadoActual, apoderadoId]);
    await registrarHistorial(conn, {
      atributo: 'Apoderado_Usuario_Id',
      anterior: apoderadoActual === null ? null : refPersona(personasCU39.get(Number(apoderadoActual))),
      nuevo: apoderadoId === null ? null : refPersona(personasCU39.get(Number(apoderadoId))),
      descripcion: apoderadoId === null
        ? 'CU39: eliminación de la asociación del estudiante'
        : 'CU39: reasignación del apoderado del estudiante',
      usuarioId: apoderadoActual ?? apoderadoId,
      estudianteId: estudiante[0].Estudiante_Id,
      responsableId: req.user.id,
    });

    await conn.commit();

    return res.json({ mensaje: 'Asociaciones actualizadas correctamente' });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error(error);
    return res.status(500).json({ mensaje: 'Error al actualizar las asociaciones del estudiante' });
  } finally {
    if (conn) conn.release();
  }
};

// CU41: Visualizar detalle de estudiante desde la lista de asociados del apoderado
// GET /api/estudiantes/apoderado/:apoderadoId/asociados/:estudianteId
const getDetalleEstudiante = async (req, res) => {
  try {
    const { roles, id: userId } = req.user;
    const esAdmin = roles.includes('Administrador');
    const esApoderadoSinAdmin = roles.includes('Apoderado') && !esAdmin;

    if (!esApoderadoSinAdmin && !esAdmin) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    const apoderadoId = Number(req.params.apoderadoId);
    const { estudianteId } = req.params;

    // Excepción "Acceso directo sin permisos": un Apoderado solo puede pedir
    // el detalle bajo su propio contexto. Se rechaza ANTES de tocar la BD.
    if (esApoderadoSinAdmin && apoderadoId !== userId) {
      return res.status(403).json({ mensaje: 'No tienes permiso para visualizar este estudiante' });
    }

    const [estudiante] = await db.query(
      `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Estudiante_RUT,
              e.Estudiante_Estado_Academico, c.Curso_Nombre,
              e.Estudiante_Calle, e.Estudiante_Numero, e.Estudiante_Depto, e.Estudiante_Comuna
       FROM estudiante e
       JOIN curso c ON c.Curso_Id = e.Curso_Id
       WHERE e.Estudiante_Id = ? AND ${condicionApoderadoAsociado('e')}`,
      [estudianteId, apoderadoId, apoderadoId]
    );

    // Excepción "Estudiante ya no se encuentra asociado"
    if (estudiante.length === 0) {
      return res.status(404).json({ mensaje: 'El estudiante ya no se encuentra asociado a esta cuenta' });
    }

    return res.json(estudiante[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'No fue posible cargar la ficha estudiantil, reintente más tarde' });
  }
};

// GET /api/estudiantes/curso/:cursoId/mis-estudiantes
// "Mis Cursos": estudiantes de un curso en el que el docente hace clases.
// Solo datos no invasivos (sin RUT ni dirección). Un Administrador puede ver cualquier curso.
const getEstudiantesCursoDocente = async (req, res) => {
  try {
    const { roles, id: userId } = req.user;
    const esAdmin = roles.includes('Administrador');
    const esDocente = roles.includes('Docente');

    if (!esAdmin && !esDocente) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    const cursoId = Number(req.params.cursoId);
    if (!Number.isInteger(cursoId) || cursoId <= 0) {
      return res.status(400).json({ mensaje: 'ID de curso inválido' });
    }

    const [[curso]] = await db.query(
      'SELECT Curso_Id, Curso_Nombre FROM curso WHERE Curso_Id = ?',
      [cursoId]
    );

    if (!curso) {
      return res.status(404).json({ mensaje: 'El curso no fue encontrado' });
    }

    // Un docente solo puede ver los cursos en los que tiene clases asignadas
    if (!esAdmin) {
      const [asignado] = await db.query(
        `SELECT 1 FROM horario_asignatura WHERE Usuario_Id = ? AND Curso_Id = ? AND ${claseVigente('horario_asignatura')} LIMIT 1`,
        [userId, cursoId]
      );
      if (asignado.length === 0) {
        return res.status(403).json({ mensaje: 'No haces clases en este curso' });
      }
    }

    const [estudiantes] = await db.query(
      `SELECT
        e.Estudiante_Id,
        e.Estudiante_Nombre_Completo,
        e.Estudiante_Estado_Academico,
        u.Usuario_Nombre_Completo AS Apoderado_Nombre
      FROM estudiante e
      LEFT JOIN usuario u ON u.Usuario_Id = e.Apoderado_Usuario_Id
      WHERE e.Curso_Id = ? AND e.Estudiante_Fecha_Eliminacion IS NULL
      ORDER BY e.Estudiante_Nombre_Completo ASC`,
      [cursoId]
    );

    return res.json({
      curso: { id: curso.Curso_Id, nombre: curso.Curso_Nombre },
      estudiantes,
    });
  } catch (error) {
    console.error('getEstudiantesCursoDocente:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar los estudiantes, reintente más tarde' });
  }
};

module.exports = {
  getEstudiantes,
  getEstudiantesCursoDocente,
  buscarEstudiantes, // CU36
  getEstudianteById,
  createEstudiante,
  updateEstudiante,
  deleteEstudiante,
  getEstudiantesSinApoderado,
  asignarApoderado,
  verificarRut,
  eliminarTodasAsociacionesApoderado, // CU9
  eliminarAsociacionEspecifica,       // CU10
  getEstudiantesAsociados,            // CU40
  editarAsociaciones,                 // CU39
  getDetalleEstudiante,                // CU41
};
