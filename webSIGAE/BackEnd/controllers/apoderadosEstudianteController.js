// Apoderado titular y suplentes de un estudiante (RF57 / CU90, CU91).
//
// El titular es estudiante.Apoderado_Usuario_Id (el mismo campo de la asociación de CU7/CU39)
// y los suplentes, hasta MAX_SUPLENTES, se guardan en apoderado_suplente.
const pool = require('../config/db');
const { claseVigente } = require('../utils/clasesEliminadas');
const { MAX_SUPLENTES, obtenerApoderadosEstudiante } = require('../utils/apoderadosEstudiante');
const { registrarHistorial, refPersona, refPersonas } = require('../utils/historial');

const esAdministrador = (user) => (user?.roles || []).includes('Administrador');
const esDocente = (user) => (user?.roles || []).includes('Docente');

const ESTUDIANTE_NO_EXISTE = { mensaje: 'Ficha de estudiante no encontrada' };
const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

// Historial: personas como "RUT sin DV (Nombre)", con el helper común (utils/historial.js).

/**
 * Valida el cuerpo de CU90. Devuelve { error } o { titularId, suplenteIds } normalizados.
 * CU90 Excepción 2: la selección deja dos titulares o ninguno.
 */
function validarDesignacion(body = {}) {
  const { titularId, suplenteIds = [] } = body;

  if (Array.isArray(titularId)) {
    if (titularId.length > 1) return { error: 'Un estudiante tiene un único apoderado titular: selecciona solo uno' };
  }
  const titular = Array.isArray(titularId) ? titularId[0] : titularId;
  if (titular === undefined || titular === null || titular === '') {
    return { error: 'Debes designar un apoderado titular: cada estudiante tiene exactamente uno' };
  }
  if (!idValido(titular)) return { error: 'El apoderado titular seleccionado no es válido' };

  if (!Array.isArray(suplenteIds)) return { error: 'Los suplentes deben enviarse como una lista' };
  if (suplenteIds.some((id) => !idValido(id))) return { error: 'Uno de los suplentes seleccionados no es válido' };

  const suplentes = suplenteIds.map(Number);
  if (new Set(suplentes).size !== suplentes.length) {
    return { error: 'Un mismo apoderado no puede figurar dos veces como suplente' };
  }
  if (suplentes.includes(Number(titular))) {
    return { error: 'El apoderado titular no puede ser también suplente del mismo estudiante' };
  }
  if (suplentes.length > MAX_SUPLENTES) {
    return { error: `Un estudiante puede tener como máximo ${MAX_SUPLENTES} apoderados suplentes` };
  }
  return { titularId: Number(titular), suplenteIds: suplentes };
}

// ── CU90: titular y suplentes actuales del estudiante (Administrador / Super Admin) ──
const getApoderadosEstudiante = async (req, res) => {
  try {
    const datos = await obtenerApoderadosEstudiante(pool, Number(req.params.estudianteId));
    if (!datos) return res.status(404).json(ESTUDIANTE_NO_EXISTE);
    return res.json({ ...datos, maxSuplentes: MAX_SUPLENTES });
  } catch (error) {
    console.error('getApoderadosEstudiante:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar los apoderados del estudiante' });
  }
};

// ── CU90: designar titular y suplentes (Administrador / Super Admin) ──
// Body: { titularId: number, suplenteIds: number[] }
const designarApoderados = async (req, res) => {
  const validacion = validarDesignacion(req.body);
  if (validacion.error) return res.status(400).json({ mensaje: validacion.error });
  const { titularId, suplenteIds } = validacion;
  const estudianteId = Number(req.params.estudianteId);

  let conn;
  try {
    const actual = await obtenerApoderadosEstudiante(pool, estudianteId);
    if (!actual) return res.status(404).json(ESTUDIANTE_NO_EXISTE);

    // Todos deben ser apoderados con cuenta activa
    const ids = [titularId, ...suplenteIds];
    const [usuarios] = await pool.query(
      `SELECT Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo, Es_Apoderado, Usuario_Estado_Cuenta
         FROM usuario WHERE Usuario_Id IN (?)`,
      [ids]
    );
    const porId = new Map(usuarios.map((u) => [Number(u.Usuario_Id), u]));
    const faltante = ids.find((id) => !porId.has(id));
    if (faltante) return res.status(404).json({ mensaje: 'Uno de los apoderados seleccionados no existe' });
    const noApoderado = ids.map((id) => porId.get(id)).find((u) => !u.Es_Apoderado);
    if (noApoderado) {
      return res.status(400).json({ mensaje: `${noApoderado.Usuario_Nombre_Completo} no tiene rol de apoderado` });
    }
    const inactivo = ids.map((id) => porId.get(id)).find((u) => !u.Usuario_Estado_Cuenta);
    if (inactivo) {
      return res.status(400).json({ mensaje: `La cuenta de ${inactivo.Usuario_Nombre_Completo} está inactiva` });
    }

    const titularAnteriorId = actual.titular ? Number(actual.titular.Usuario_Id) : null;
    const suplentesAnteriores = actual.suplentes.map((s) => Number(s.Usuario_Id));
    const cambiaTitular = titularAnteriorId !== titularId;
    const mismosSuplentes =
      suplentesAnteriores.length === suplenteIds.length && suplenteIds.every((id) => suplentesAnteriores.includes(id));
    if (!cambiaTitular && mismosSuplentes) {
      return res.json({ mensaje: 'No hay cambios en la designación de apoderados' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (cambiaTitular) {
      await conn.query('UPDATE estudiante SET Apoderado_Usuario_Id = ? WHERE Estudiante_Id = ?', [titularId, estudianteId]);
      await registrarHistorial(conn, {
        estudianteId,
        atributo: 'Apoderado_Usuario_Id',
        anterior: refPersona(actual.titular),
        nuevo: refPersona(porId.get(titularId)),
        descripcion: 'Designación de apoderado titular',
        responsableId: req.user.id,
      });
    }

    if (!mismosSuplentes) {
      await conn.query('DELETE FROM apoderado_suplente WHERE Estudiante_Id = ?', [estudianteId]);
      if (suplenteIds.length > 0) {
        await conn.query(
          'INSERT INTO apoderado_suplente (Estudiante_Id, Suplente_Usuario_Id) VALUES ?',
          [suplenteIds.map((id) => [estudianteId, id])]
        );
      }
      await registrarHistorial(conn, {
        estudianteId,
        atributo: 'apoderado_suplente',
        anterior: refPersonas(actual.suplentes),
        nuevo: refPersonas(suplenteIds.map((id) => porId.get(id))),
        descripcion: 'Designación de apoderados suplentes',
        responsableId: req.user.id,
      });
    }

    await conn.commit();
    return res.json({ mensaje: 'Designación de apoderados guardada correctamente' });
  } catch (error) {
    console.error('designarApoderados:', error);
    if (conn) await conn.rollback().catch(() => {});
    return res.status(500).json({ mensaje: 'No fue posible guardar la designación de apoderados' });
  } finally {
    if (conn) conn.release();
  }
};

/** Contacto visible para el docente: nombre, correo y teléfono (CU91). */
const contacto = (u) => u && ({
  Usuario_Id: u.Usuario_Id,
  Usuario_Nombre_Completo: u.Usuario_Nombre_Completo,
  Usuario_Correo: u.Usuario_Correo || null,
  Usuario_Telefono: u.Usuario_Telefono || null,
});

// ── CU91: contactos del titular y suplentes al crear o revisar una citación ──
// Docente (solo estudiantes de sus cursos), Administrador / Super Admin (todos).
const getContactosApoderados = async (req, res) => {
  const estudianteId = Number(req.params.estudianteId);
  if (!idValido(estudianteId)) return res.status(400).json({ mensaje: 'No se especificó un estudiante válido' });

  const admin = esAdministrador(req.user);
  if (!admin && !esDocente(req.user)) {
    return res.status(403).json({ mensaje: 'No tienes permiso para ver los contactos de los apoderados' });
  }
  try {
    const datos = await obtenerApoderadosEstudiante(pool, estudianteId);
    if (!datos) return res.status(404).json(ESTUDIANTE_NO_EXISTE);

    // CU91 Excepción 2: el docente no imparte clases al estudiante
    if (!admin) {
      const [clases] = await pool.query(
        `SELECT 1 FROM horario_asignatura ha
          WHERE ha.Usuario_Id = ? AND ha.Curso_Id = ? AND ${claseVigente('ha')} LIMIT 1`,
        [req.user.id, datos.estudiante.Curso_Id]
      );
      if (clases.length === 0) {
        return res.status(403).json({
          mensaje: 'No impartes clases a este estudiante, por lo que sus datos de contacto no están disponibles',
        });
      }
    }

    return res.json({
      estudiante: datos.estudiante,
      titular: contacto(datos.titular),
      // CU91 Excepción 1: sin suplentes, la lista viene vacía y solo se muestra el titular
      suplentes: datos.suplentes.map(contacto),
    });
  } catch (error) {
    console.error('getContactosApoderados:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar los contactos de los apoderados' });
  }
};

module.exports = {
  getApoderadosEstudiante,
  designarApoderados,
  getContactosApoderados,
  // Exportado para las pruebas unitarias
  validarDesignacion,
};
