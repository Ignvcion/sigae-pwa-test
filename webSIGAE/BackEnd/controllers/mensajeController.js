// Módulo de mensajería interna docente-apoderado (CU73 / RF47).
const pool = require('../config/db');
const { notificarMensaje, marcarLeidasConversacion } = require('../utils/notificaciones');
const { claseVigente } = require('../utils/clasesEliminadas');
const { enPeriodoVigente } = require('../utils/periodos');
const {
  MENSAJE_SIN_RECEPCION,
  habilitadaHastaSQL,
  apoderadoPuedeResponderSQL,
  camposRecepcion,
} = require('../utils/recepcionMensajes');

const ROLES_MENSAJERIA = ['Docente', 'Apoderado'];

/**
 * Rol con el que el usuario usa la mensajería: el rol activo enviado por el
 * frontend (?rol=), siempre que lo tenga; si no, el primero de sus roles que
 * participe en la mensajería. Los administradores no son actores de CU73.
 */
function resolverRol(user, rolSolicitado) {
  const roles = user?.roles || [];

  if (ROLES_MENSAJERIA.includes(rolSolicitado) && roles.includes(rolSolicitado)) {
    return rolSolicitado;
  }

  return ROLES_MENSAJERIA.find((r) => roles.includes(r)) || null;
}

/**
 * Rol que cumple el usuario dentro de una conversación (Docente o Apoderado),
 * o null si no participa en ella con un rol que efectivamente tenga.
 */
function rolEnConversacion(conversacion, user) {
  const roles = user?.roles || [];
  const usuarioId = Number(user?.id);

  if (Number(conversacion.Docente_Usuario_Id) === usuarioId && roles.includes('Docente')) {
    return 'Docente';
  }

  if (Number(conversacion.Apoderado_Usuario_Id) === usuarioId && roles.includes('Apoderado')) {
    return 'Apoderado';
  }

  return null;
}

/**
 * Busca una conversación en la que participe el usuario autenticado.
 * Devuelve { conversacion, rol } o null si no existe o no le pertenece.
 */
async function buscarConversacionDelUsuario(conversacionId, user) {
  const [conversaciones] = await pool.query(
    `
    SELECT
      c.Conversacion_Id,
      c.Docente_Usuario_Id,
      c.Apoderado_Usuario_Id,
      c.Conversacion_Estado,
      docente.Docente_Recepcion_Mensajes AS Recepcion_General,
      ${habilitadaHastaSQL('c')} AS Habilitada_Hasta,
      c.Conversacion_Habilitada_Citacion_Id AS Habilitada_Citacion_Id,
      ${apoderadoPuedeResponderSQL('c', 'docente')} AS Apoderado_Puede_Responder
    FROM conversacion c
    INNER JOIN usuario docente ON docente.Usuario_Id = c.Docente_Usuario_Id
    WHERE c.Conversacion_Id = ?
      AND (
        c.Docente_Usuario_Id = ?
        OR c.Apoderado_Usuario_Id = ?
      )
    LIMIT 1
    `,
    [conversacionId, user.id, user.id]
  );

  if (conversaciones.length === 0) {
    return null;
  }

  const rol = rolEnConversacion(conversaciones[0], user);
  const { Habilitada_Citacion_Id: _cit, ...fila } = conversaciones[0];

  return rol ? { conversacion: { ...fila, ...camposRecepcion(conversaciones[0]) }, rol } : null;
}

/**
 * Contactos válidos según la relación docente-apoderado (precondición de CU73):
 * - Docente: apoderados de los estudiantes de los cursos en que hace clases.
 * - Apoderado: docentes que hacen clases en los cursos de sus estudiantes.
 * Con contactoId se limita la búsqueda a ese usuario (validación de la relación).
 */
async function buscarContactos(usuarioId, rol, contactoId = null) {
  let rows;

  if (rol === 'Docente') {
    [rows] = await pool.query(
      `
      SELECT DISTINCT
        u.Usuario_Id              AS Contacto_Id,
        u.Usuario_Nombre_Completo AS Contacto_Nombre,
        e.Estudiante_Nombre_Completo,
        cu.Curso_Nombre
      FROM estudiante e
      INNER JOIN usuario u
        ON u.Usuario_Id = e.Apoderado_Usuario_Id
      LEFT JOIN curso cu
        ON cu.Curso_Id = e.Curso_Id
      WHERE e.Estudiante_Fecha_Eliminacion IS NULL
        AND u.Usuario_Estado_Cuenta = 1
        AND u.Usuario_Id <> ?
        AND e.Curso_Id IN (
          SELECT DISTINCT Curso_Id
          FROM horario_asignatura
          WHERE Usuario_Id = ? AND ${claseVigente('horario_asignatura')}
        )
        ${contactoId ? 'AND u.Usuario_Id = ?' : ''}
      ORDER BY u.Usuario_Nombre_Completo, e.Estudiante_Nombre_Completo
      `,
      contactoId ? [usuarioId, usuarioId, contactoId] : [usuarioId, usuarioId]
    );
  } else {
    [rows] = await pool.query(
      `
      SELECT DISTINCT
        u.Usuario_Id              AS Contacto_Id,
        u.Usuario_Nombre_Completo AS Contacto_Nombre,
        u.Docente_Recepcion_Mensajes AS Recibe_Mensajes,
        e.Estudiante_Nombre_Completo,
        cu.Curso_Nombre
      FROM estudiante e
      INNER JOIN horario_asignatura ha
        ON ha.Curso_Id = e.Curso_Id AND ${claseVigente('ha')}
      INNER JOIN usuario u
        ON u.Usuario_Id = ha.Usuario_Id
      LEFT JOIN curso cu
        ON cu.Curso_Id = e.Curso_Id
      WHERE e.Apoderado_Usuario_Id = ?
        AND e.Estudiante_Fecha_Eliminacion IS NULL
        AND u.Es_Docente = 1
        AND u.Usuario_Estado_Cuenta = 1
        AND u.Usuario_Id <> ?
        ${contactoId ? 'AND u.Usuario_Id = ?' : ''}
      ORDER BY u.Usuario_Nombre_Completo, e.Estudiante_Nombre_Completo
      `,
      contactoId ? [usuarioId, usuarioId, contactoId] : [usuarioId, usuarioId]
    );
  }

  // Una fila por estudiante: se agrupan por contacto
  const contactos = new Map();

  for (const fila of rows) {
    if (!contactos.has(fila.Contacto_Id)) {
      contactos.set(fila.Contacto_Id, {
        Contacto_Id: fila.Contacto_Id,
        Contacto_Nombre: fila.Contacto_Nombre,
        Contacto_Rol: rol === 'Docente' ? 'Apoderado' : 'Docente',
        // RF54: el apoderado ve si el docente recibe mensajes (el docente siempre puede escribir)
        ...(rol === 'Apoderado' ? { Recibe_Mensajes: Number(fila.Recibe_Mensajes) === 1 } : {}),
        Estudiantes: []
      });
    }

    const detalle = fila.Curso_Nombre
      ? `${fila.Estudiante_Nombre_Completo} (${fila.Curso_Nombre})`
      : fila.Estudiante_Nombre_Completo;

    const contacto = contactos.get(fila.Contacto_Id);

    if (!contacto.Estudiantes.includes(detalle)) {
      contacto.Estudiantes.push(detalle);
    }
  }

  return [...contactos.values()];
}


/**
 * Obtiene las conversaciones del usuario autenticado según su rol activo
 * (?rol=Docente|Apoderado).
 */
const obtenerConversaciones = async (req, res) => {
  const usuarioId = req.user.id;
  const rol = resolverRol(req.user, req.query.rol);

  if (!rol) {
    return res.status(403).json({
      mensaje: 'Solo docentes y apoderados pueden acceder a los mensajes'
    });
  }

  const columna = rol === 'Docente'
    ? 'c.Docente_Usuario_Id'
    : 'c.Apoderado_Usuario_Id';

  try {
    const [rows] = await pool.query(
      `
      SELECT
        c.Conversacion_Id,
        DATE_FORMAT(c.Conversacion_Fecha_Inicio, '%Y-%m-%d') AS Conversacion_Fecha_Inicio,
        c.Conversacion_Estado,

        c.Docente_Usuario_Id,
        docente.Usuario_Nombre_Completo AS Docente_Nombre,

        c.Apoderado_Usuario_Id,
        apoderado.Usuario_Nombre_Completo AS Apoderado_Nombre,

        ? AS Mi_Rol,

        -- RF54: recepción general del docente y período habilitado en la conversación
        docente.Docente_Recepcion_Mensajes AS Recepcion_General,
        ${habilitadaHastaSQL('c')} AS Habilitada_Hasta,
        c.Conversacion_Habilitada_Citacion_Id AS Habilitada_Citacion_Id,
        ${apoderadoPuedeResponderSQL('c', 'docente')} AS Apoderado_Puede_Responder,

        (
          SELECT m.Mensaje_Contenido
          FROM mensaje m
          WHERE m.Conversacion_Id = c.Conversacion_Id
          ORDER BY m.Mensaje_Fecha_Envio DESC,
                   m.Mensaje_Hora_Envio DESC,
                   m.Mensaje_Id DESC
          LIMIT 1
        ) AS Ultimo_Mensaje,

        (
          SELECT m.Mensaje_Estado
          FROM mensaje m
          WHERE m.Conversacion_Id = c.Conversacion_Id
          ORDER BY m.Mensaje_Fecha_Envio DESC,
                   m.Mensaje_Hora_Envio DESC,
                   m.Mensaje_Id DESC
          LIMIT 1
        ) AS Estado_Ultimo_Mensaje,

        (
          SELECT COUNT(*)
          FROM mensaje m
          WHERE m.Conversacion_Id = c.Conversacion_Id
            AND m.Mensaje_Remitente_Rol <> ?
            AND m.Mensaje_Estado = 'No leído'
        ) AS No_Leidos,

        COALESCE(
          (
            SELECT MAX(TIMESTAMP(m.Mensaje_Fecha_Envio, m.Mensaje_Hora_Envio))
            FROM mensaje m
            WHERE m.Conversacion_Id = c.Conversacion_Id
          ),
          c.Conversacion_Fecha_Inicio
        ) AS Ultima_Actividad

      FROM conversacion c

      INNER JOIN usuario docente
        ON docente.Usuario_Id = c.Docente_Usuario_Id

      INNER JOIN usuario apoderado
        ON apoderado.Usuario_Id = c.Apoderado_Usuario_Id

      WHERE ${columna} = ?

      ORDER BY Ultima_Actividad DESC, c.Conversacion_Id DESC
      `,
      [rol, rol, usuarioId]
    );

    // La contraparte es quien se muestra como título de la conversación
    const conversaciones = rows.map(({ Habilitada_Citacion_Id: _cit, ...fila }) => ({
      ...fila,
      ...camposRecepcion({ ...fila, Habilitada_Citacion_Id: _cit }),
      No_Leidos: Number(fila.No_Leidos) || 0,
      Contacto_Nombre: rol === 'Docente'
        ? fila.Apoderado_Nombre
        : fila.Docente_Nombre
    }));

    return res.json(conversaciones);

  } catch (error) {
    console.error('Error al obtener conversaciones:', error);

    return res.status(500).json({
      mensaje: 'Error interno al obtener las conversaciones'
    });
  }
};


/**
 * Obtiene los mensajes de una conversación en la que participa el usuario.
 */
const obtenerMensajes = async (req, res) => {
  const conversacionId = Number(req.params.id);

  if (!Number.isInteger(conversacionId) || conversacionId <= 0) {
    return res.status(400).json({
      mensaje: 'ID de conversación inválido'
    });
  }

  try {
    const acceso = await buscarConversacionDelUsuario(conversacionId, req.user);

    if (!acceso) {
      return res.status(404).json({
        mensaje: 'Conversación no encontrada o no tienes acceso'
      });
    }

    const [mensajes] = await pool.query(
      `
      SELECT
        m.Mensaje_Id,
        m.Mensaje_Contenido,
        DATE_FORMAT(m.Mensaje_Fecha_Envio, '%Y-%m-%d') AS Mensaje_Fecha_Envio,
        m.Mensaje_Hora_Envio,
        m.Mensaje_Estado,
        m.Mensaje_Remitente_Rol,
        m.Conversacion_Id,

        CASE
          WHEN m.Mensaje_Remitente_Rol = 'Docente'
            THEN c.Docente_Usuario_Id
          WHEN m.Mensaje_Remitente_Rol = 'Apoderado'
            THEN c.Apoderado_Usuario_Id
          ELSE NULL
        END AS Remitente_Usuario_Id

      FROM mensaje m

      INNER JOIN conversacion c
        ON c.Conversacion_Id = m.Conversacion_Id

      WHERE m.Conversacion_Id = ?

      ORDER BY
        m.Mensaje_Fecha_Envio ASC,
        m.Mensaje_Hora_Envio ASC,
        m.Mensaje_Id ASC
      `,
      [conversacionId]
    );

    return res.json({
      conversacion: { ...acceso.conversacion, Mi_Rol: acceso.rol },
      mensajes
    });

  } catch (error) {
    console.error('Error al obtener mensajes:', error);

    return res.status(500).json({
      mensaje: 'Error interno al obtener los mensajes'
    });
  }
};


/**
 * Envía un mensaje dentro de una conversación.
 *
 * El rol del remitente se toma de la conversación (no del primer rol del
 * usuario), para que un usuario Docente y Apoderado a la vez pueda responder
 * en ambos tipos de conversación.
 */
const enviarMensaje = async (req, res) => {
  const conversacionId = Number(req.params.id);

  const contenido = typeof req.body?.contenido === 'string'
    ? req.body.contenido.trim()
    : '';

  if (!Number.isInteger(conversacionId) || conversacionId <= 0) {
    return res.status(400).json({
      mensaje: 'ID de conversación inválido'
    });
  }

  if (!contenido) {
    return res.status(400).json({
      mensaje: 'El contenido del mensaje es obligatorio'
    });
  }

  if (contenido.length > 5000) {
    return res.status(400).json({
      mensaje: 'El mensaje no puede superar los 5000 caracteres'
    });
  }

  try {
    const acceso = await buscarConversacionDelUsuario(conversacionId, req.user);

    if (!acceso) {
      return res.status(404).json({
        mensaje: 'Conversación no encontrada o no tienes acceso'
      });
    }

    if (!acceso.conversacion.Conversacion_Estado) {
      return res.status(409).json({
        mensaje: 'La conversación está cerrada'
      });
    }

    // RF54 / CU85 Excepción 2: con la recepción deshabilitada el apoderado no puede responder
    if (acceso.rol === 'Apoderado' && !acceso.conversacion.Apoderado_Puede_Responder) {
      return res.status(403).json({ mensaje: MENSAJE_SIN_RECEPCION, sinRecepcion: true });
    }

    // Fecha y hora las asigna MySQL: evita mezclar fecha UTC con hora local
    const [resultado] = await pool.query(
      `
      INSERT INTO mensaje (
        Mensaje_Contenido,
        Mensaje_Fecha_Envio,
        Mensaje_Hora_Envio,
        Mensaje_Estado,
        Mensaje_Remitente_Rol,
        Conversacion_Id
      )
      VALUES (?, CURDATE(), CURTIME(), 'No leído', ?, ?)
      `,
      [contenido, acceso.rol, conversacionId]
    );

    // CU101: la contraparte recibe la notificación del mensaje
    await notificarMensaje(pool, {
      mensajeId: resultado.insertId,
      conversacionId,
      destinatarioId: acceso.rol === 'Docente'
        ? acceso.conversacion.Apoderado_Usuario_Id
        : acceso.conversacion.Docente_Usuario_Id,
    });

    return res.status(201).json({
      mensaje: 'Mensaje enviado correctamente',
      mensajeId: resultado.insertId
    });

  } catch (error) {
    console.error('Error al enviar mensaje:', error);

    // Excepción 2: error al enviar o guardar el mensaje
    return res.status(500).json({
      mensaje: 'Error interno al enviar el mensaje'
    });
  }
};


/**
 * Marca como leídos los mensajes recibidos dentro de una conversación.
 */
const marcarMensajesLeidos = async (req, res) => {
  const conversacionId = Number(req.params.id);

  if (!Number.isInteger(conversacionId) || conversacionId <= 0) {
    return res.status(400).json({
      mensaje: 'ID de conversación inválido'
    });
  }

  try {
    const acceso = await buscarConversacionDelUsuario(conversacionId, req.user);

    if (!acceso) {
      return res.status(404).json({
        mensaje: 'Conversación no encontrada o no tienes acceso'
      });
    }

    const [resultado] = await pool.query(
      `
      UPDATE mensaje
      SET Mensaje_Estado = 'Leído'
      WHERE Conversacion_Id = ?
        AND Mensaje_Remitente_Rol <> ?
        AND Mensaje_Estado = 'No leído'
      `,
      [conversacionId, acceso.rol]
    );
    // CU101: al abrir la conversación, sus notificaciones quedan leídas
    await marcarLeidasConversacion(pool, { usuarioId: req.user.id, conversacionId });

    return res.json({
      mensaje: 'Mensajes marcados como leídos',
      actualizados: resultado.affectedRows
    });

  } catch (error) {
    console.error('Error al marcar mensajes como leídos:', error);

    return res.status(500).json({
      mensaje: 'Error interno al marcar los mensajes como leídos'
    });
  }
};


/**
 * Ficha de la contraparte de una conversación, para el panel lateral del chat.
 * Solo datos de contacto no invasivos: nunca RUT ni dirección.
 * - Docente ve al apoderado: nombre, teléfono, correo y sus estudiantes asociados.
 * - Apoderado ve al docente: nombre, especialidad, correo institucional y las
 *   asignaturas que dicta a sus estudiantes.
 */
const obtenerDetalleContacto = async (req, res) => {
  const conversacionId = Number(req.params.id);

  if (!Number.isInteger(conversacionId) || conversacionId <= 0) {
    return res.status(400).json({
      mensaje: 'ID de conversación inválido'
    });
  }

  try {
    const acceso = await buscarConversacionDelUsuario(conversacionId, req.user);

    if (!acceso) {
      return res.status(404).json({
        mensaje: 'Conversación no encontrada o no tienes acceso'
      });
    }

    const { conversacion, rol } = acceso;

    if (rol === 'Docente') {
      const apoderadoId = conversacion.Apoderado_Usuario_Id;

      const [usuarios] = await pool.query(
        `
        SELECT
          Usuario_Id,
          Usuario_Nombre_Completo,
          Usuario_Telefono,
          Apoderado_Correo_Natural,
          Usuario_Foto_Perfil
        FROM usuario
        WHERE Usuario_Id = ?
        LIMIT 1
        `,
        [apoderadoId]
      );

      if (usuarios.length === 0) {
        return res.status(404).json({ mensaje: 'Contacto no encontrado' });
      }

      const [estudiantes] = await pool.query(
        `
        SELECT
          e.Estudiante_Id,
          e.Estudiante_Nombre_Completo,
          cu.Curso_Nombre
        FROM estudiante e
        LEFT JOIN curso cu
          ON cu.Curso_Id = e.Curso_Id
        WHERE e.Apoderado_Usuario_Id = ?
          AND e.Estudiante_Fecha_Eliminacion IS NULL
        ORDER BY e.Estudiante_Nombre_Completo
        `,
        [apoderadoId]
      );

      const u = usuarios[0];

      return res.json({
        Rol: 'Apoderado',
        Nombre: u.Usuario_Nombre_Completo,
        Telefono: u.Usuario_Telefono,
        Correo: u.Apoderado_Correo_Natural,
        Foto: u.Usuario_Foto_Perfil,
        Estudiantes: estudiantes.map((e) => ({
          Estudiante_Id: e.Estudiante_Id,
          Nombre: e.Estudiante_Nombre_Completo,
          Curso: e.Curso_Nombre
        }))
      });
    }

    // rol === 'Apoderado': la contraparte es el docente
    const docenteId = conversacion.Docente_Usuario_Id;

    const [usuarios] = await pool.query(
      `
      SELECT
        Usuario_Id,
        Usuario_Nombre_Completo,
        Docente_Especialidad,
        Docente_Correo_Institucional,
        Usuario_Foto_Perfil
      FROM usuario
      WHERE Usuario_Id = ?
      LIMIT 1
      `,
      [docenteId]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'Contacto no encontrado' });
    }

    const [asignaturas] = await pool.query(
      `
      SELECT DISTINCT
        a.Asignatura_Nombre,
        cu.Curso_Nombre
      FROM horario_asignatura ha
      INNER JOIN asignatura a
        ON a.Asignatura_Id = ha.Asignatura_Id
      INNER JOIN curso cu
        ON cu.Curso_Id = ha.Curso_Id
      WHERE ha.Usuario_Id = ?
        AND ${claseVigente('ha')}
        AND ${enPeriodoVigente('ha')}
        AND ha.Curso_Id IN (
          SELECT Curso_Id
          FROM estudiante
          WHERE Apoderado_Usuario_Id = ?
            AND Estudiante_Fecha_Eliminacion IS NULL
        )
      ORDER BY cu.Curso_Nombre, a.Asignatura_Nombre
      `,
      [docenteId, req.user.id]
    );

    const u = usuarios[0];

    return res.json({
      Rol: 'Docente',
      Nombre: u.Usuario_Nombre_Completo,
      Especialidad: u.Docente_Especialidad,
      Correo: u.Docente_Correo_Institucional,
      Foto: u.Usuario_Foto_Perfil,
      Asignaturas: asignaturas.map((a) => ({
        Nombre: a.Asignatura_Nombre,
        Curso: a.Curso_Nombre
      }))
    });

  } catch (error) {
    console.error('Error al obtener detalle del contacto:', error);

    return res.status(500).json({
      mensaje: 'Error interno al obtener los datos del contacto'
    });
  }
};


/**
 * CU73 paso 1: contactos válidos con los que el usuario puede conversar
 * según su rol activo (?rol=Docente|Apoderado).
 */
const obtenerContactos = async (req, res) => {
  const rol = resolverRol(req.user, req.query.rol);

  if (!rol) {
    return res.status(403).json({
      mensaje: 'Solo docentes y apoderados pueden acceder a los mensajes'
    });
  }

  try {
    const contactos = await buscarContactos(req.user.id, rol);

    return res.json(contactos);

  } catch (error) {
    console.error('Error al obtener contactos:', error);

    return res.status(500).json({
      mensaje: 'Error interno al obtener los contactos'
    });
  }
};


/**
 * CU73 Excepción 1: si no existe historial con el contacto, se inicia una
 * nueva conversación. Si ya existe una conversación abierta, se reutiliza.
 *
 * Body: { contactoId, rol }
 */
const iniciarConversacion = async (req, res) => {
  const usuarioId = req.user.id;
  const rol = resolverRol(req.user, req.body?.rol);
  const contactoId = Number(req.body?.contactoId);

  if (!rol) {
    return res.status(403).json({
      mensaje: 'Solo docentes y apoderados pueden iniciar conversaciones'
    });
  }

  if (!Number.isInteger(contactoId) || contactoId <= 0) {
    return res.status(400).json({
      mensaje: 'Debes seleccionar un contacto válido'
    });
  }

  try {
    // Precondición: debe existir una relación válida entre docente y apoderado
    const contactos = await buscarContactos(usuarioId, rol, contactoId);

    if (contactos.length === 0) {
      return res.status(403).json({
        mensaje: 'No existe una relación válida entre docente y apoderado con este contacto'
      });
    }

    const docenteId = rol === 'Docente' ? usuarioId : contactoId;
    const apoderadoId = rol === 'Docente' ? contactoId : usuarioId;

    const [existentes] = await pool.query(
      `
      SELECT Conversacion_Id
      FROM conversacion
      WHERE Docente_Usuario_Id = ?
        AND Apoderado_Usuario_Id = ?
        AND Conversacion_Estado = 1
      ORDER BY Conversacion_Id DESC
      LIMIT 1
      `,
      [docenteId, apoderadoId]
    );

    if (existentes.length > 0) {
      return res.json({
        mensaje: 'Ya existe una conversación con este contacto',
        conversacionId: existentes[0].Conversacion_Id,
        nueva: false
      });
    }

    // RF54: un apoderado no puede abrir una conversación nueva si el docente no recibe mensajes
    if (rol === 'Apoderado') {
      const [[docente]] = await pool.query(
        'SELECT Docente_Recepcion_Mensajes FROM usuario WHERE Usuario_Id = ?',
        [docenteId]
      );
      if (docente && Number(docente.Docente_Recepcion_Mensajes) !== 1) {
        return res.status(403).json({
          mensaje: 'El docente no está recibiendo mensajes de apoderados en este momento.',
          sinRecepcion: true
        });
      }
    }

    const [resultado] = await pool.query(
      `
      INSERT INTO conversacion (
        Conversacion_Fecha_Inicio,
        Conversacion_Estado,
        Docente_Usuario_Id,
        Apoderado_Usuario_Id
      )
      VALUES (CURDATE(), 1, ?, ?)
      `,
      [docenteId, apoderadoId]
    );

    return res.status(201).json({
      mensaje: 'Conversación iniciada correctamente',
      conversacionId: resultado.insertId,
      nueva: true
    });

  } catch (error) {
    console.error('Error al iniciar conversación:', error);

    return res.status(500).json({
      mensaje: 'Error interno al iniciar la conversación'
    });
  }
};


// ── RF54 / CU85: recepción general de mensajes de apoderados (docente) ──
// GET /api/mensajes/recepcion
const obtenerRecepcion = async (req, res) => {
  if (!(req.user?.roles || []).includes('Docente')) {
    return res.status(403).json({ mensaje: 'Solo un docente configura la recepción de mensajes' });
  }
  try {
    const [[fila]] = await pool.query(
      `SELECT u.Docente_Recepcion_Mensajes AS recepcion,
              (SELECT COUNT(*) FROM conversacion c
                WHERE c.Docente_Usuario_Id = u.Usuario_Id AND c.Conversacion_Habilitada_Hasta > NOW()) AS habilitadas
         FROM usuario u WHERE u.Usuario_Id = ?`,
      [req.user.id]
    );
    return res.json({ recepcion: Number(fila?.recepcion) === 1, conversacionesHabilitadas: Number(fila?.habilitadas) || 0 });
  } catch (error) {
    console.error('Error al obtener la recepción de mensajes:', error);
    return res.status(500).json({ mensaje: 'No fue posible obtener la configuración de recepción' });
  }
};

// PUT /api/mensajes/recepcion   Body: { habilitada: true|false }
const actualizarRecepcion = async (req, res) => {
  if (!(req.user?.roles || []).includes('Docente')) {
    return res.status(403).json({ mensaje: 'Solo un docente configura la recepción de mensajes' });
  }
  const habilitada = req.body?.habilitada;
  if (typeof habilitada !== 'boolean') {
    return res.status(400).json({ mensaje: 'Indica si la recepción queda habilitada (true) o deshabilitada (false)' });
  }
  try {
    await pool.query('UPDATE usuario SET Docente_Recepcion_Mensajes = ? WHERE Usuario_Id = ? AND Es_Docente = 1', [habilitada ? 1 : 0, req.user.id]);
    return res.json({
      recepcion: habilitada,
      mensaje: habilitada
        ? 'Recepción de mensajes habilitada: tus apoderados pueden responderte.'
        : 'Recepción de mensajes deshabilitada: tus apoderados pueden leer, pero no responder, salvo en conversaciones que habilites por un período.',
    });
  } catch (error) {
    // CU85 Excepción 1: error al guardar; se mantiene el estado anterior
    console.error('Error al actualizar la recepción de mensajes:', error);
    return res.status(500).json({ mensaje: 'No fue posible guardar la configuración. Se mantiene el estado anterior.' });
  }
};

// ── RF54 / CU86: habilitar respuestas en una conversación hasta una fecha y hora ──
// PUT /api/mensajes/conversaciones/:id/habilitacion   Body: { hasta: "YYYY-MM-DDTHH:MM" | null }
const habilitarConversacion = async (req, res) => {
  const conversacionId = Number(req.params.id);
  if (!Number.isInteger(conversacionId) || conversacionId <= 0) {
    return res.status(400).json({ mensaje: 'ID de conversación inválido' });
  }
  const hasta = req.body?.hasta ?? null;
  if (hasta !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(hasta))) {
    return res.status(400).json({ mensaje: 'La fecha de término debe tener el formato AAAA-MM-DDTHH:MM' });
  }
  try {
    const acceso = await buscarConversacionDelUsuario(conversacionId, req.user);
    if (!acceso) return res.status(404).json({ mensaje: 'Conversación no encontrada o no tienes acceso' });
    if (acceso.rol !== 'Docente') {
      return res.status(403).json({ mensaje: 'Solo el docente de la conversación puede habilitar las respuestas' });
    }
    if (hasta === null) {
      await pool.query(
        `UPDATE conversacion SET Conversacion_Habilitada_Hasta = NULL, Conversacion_Habilitada_Citacion_Id = NULL
          WHERE Conversacion_Id = ?`,
        [conversacionId]
      );
      return res.json({ mensaje: 'Se cerró la recepción de respuestas en esta conversación', Habilitada_Hasta: null });
    }
    const valor = `${String(hasta).replace('T', ' ')}:00`;
    // CU86 Excepción 1: la fecha de término es anterior a la actual
    const [[{ futuro, limite }]] = await pool.query(
      'SELECT ? > NOW() AS futuro, ? <= DATE_ADD(NOW(), INTERVAL 1 YEAR) AS limite',
      [valor, valor]
    );
    if (!Number(futuro)) return res.status(400).json({ mensaje: 'La fecha de término debe ser posterior a la fecha y hora actual' });
    if (!Number(limite)) return res.status(400).json({ mensaje: 'El período puede durar como máximo un año' });
    await pool.query(
      `UPDATE conversacion SET Conversacion_Habilitada_Hasta = ?, Conversacion_Habilitada_Citacion_Id = NULL
        WHERE Conversacion_Id = ?`,
      [valor, conversacionId]
    );
    return res.json({ mensaje: 'Respuestas del apoderado habilitadas hasta la fecha indicada', Habilitada_Hasta: hasta });
  } catch (error) {
    console.error('Error al habilitar la conversación:', error);
    return res.status(500).json({ mensaje: 'No fue posible habilitar las respuestas en la conversación' });
  }
};

module.exports = {
  obtenerRecepcion,
  actualizarRecepcion,
  habilitarConversacion,
  obtenerConversaciones,
  obtenerMensajes,
  enviarMensaje,
  marcarMensajesLeidos,
  obtenerContactos,
  iniciarConversacion,
  obtenerDetalleContacto
};
