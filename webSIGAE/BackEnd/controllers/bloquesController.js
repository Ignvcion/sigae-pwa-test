const pool = require('../config/db');
const { anioActual } = require('../utils/periodos');
const { condicionDesajustado, motivoDesajuste } = require('../utils/bloquesDesajustados');
const { claseVigente, purgarClasesEliminadas } = require('../utils/clasesEliminadas');

// Las horas llegan como "HH:MM" desde el formulario y MySQL las devuelve como
// "HH:MM:SS". Se normalizan antes de compararlas como texto: sin esto,
// "08:30" < "08:30:00" y un bloque que parte justo al inicio de la jornada
// se rechazaba como fuera de rango.
const horaCompleta = (hora) => {
  const [h = '00', m = '00', seg = '00'] = String(hora).split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${seg.padStart(2, '0')}`;
};

// ── PARÁMETROS INSTITUCIONALES ────────────────────────────────────

const getParametros = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM parametro_institucional LIMIT 1`
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No hay parámetros institucionales configurados' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('getParametros:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const updateParametros = async (req, res) => {
  const {
    Parametro_Institucional_Inicio_Jornada,
    Parametro_Institucional_Fin_Jornada,
    Parametro_Institucional_Duracion_Bloque,
    Parametro_Institucional_Duracion_Recreo,
    Parametro_Institucional_Bloques_Maximos_Diarios,
  } = req.body;

  if (
    !Parametro_Institucional_Inicio_Jornada ||
    !Parametro_Institucional_Fin_Jornada ||
    !Parametro_Institucional_Duracion_Bloque ||
    !Parametro_Institucional_Duracion_Recreo ||
    !Parametro_Institucional_Bloques_Maximos_Diarios
  ) {
    return res.status(400).json({ error: 'Todos los parámetros son obligatorios' });
  }

  const durBloque  = Number(Parametro_Institucional_Duracion_Bloque);
  const durRecreo  = Number(Parametro_Institucional_Duracion_Recreo);
  const maxBloques = Number(Parametro_Institucional_Bloques_Maximos_Diarios);

  if (durBloque < 1 || durRecreo < 0 || maxBloques < 1) {
    return res.status(400).json({ error: 'Valores numéricos inválidos' });
  }

  if (horaCompleta(Parametro_Institucional_Inicio_Jornada) >= horaCompleta(Parametro_Institucional_Fin_Jornada)) {
    return res.status(400).json({ error: 'El inicio de jornada debe ser anterior al fin' });
  }

  try {
    const [existing] = await pool.execute(`SELECT Parametro_Institucional_Id FROM parametro_institucional LIMIT 1`);
    if (existing.length === 0) {
      await pool.execute(
        `INSERT INTO parametro_institucional
         (Parametro_Institucional_Inicio_Jornada, Parametro_Institucional_Fin_Jornada,
          Parametro_Institucional_Duracion_Bloque, Parametro_Institucional_Duracion_Recreo,
          Parametro_Institucional_Bloques_Maximos_Diarios, Parametro_Institucional_Periodo_Vigente)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [Parametro_Institucional_Inicio_Jornada, Parametro_Institucional_Fin_Jornada,
         durBloque, durRecreo, maxBloques, anioActual()]
      );
    } else {
      await pool.execute(
        `UPDATE parametro_institucional SET
           Parametro_Institucional_Inicio_Jornada         = ?,
           Parametro_Institucional_Fin_Jornada            = ?,
           Parametro_Institucional_Duracion_Bloque        = ?,
           Parametro_Institucional_Duracion_Recreo        = ?,
           Parametro_Institucional_Bloques_Maximos_Diarios = ?
         WHERE Parametro_Institucional_Id = ?`,
        [Parametro_Institucional_Inicio_Jornada, Parametro_Institucional_Fin_Jornada,
         durBloque, durRecreo, maxBloques, existing[0].Parametro_Institucional_Id]
      );
    }
    res.json({ mensaje: 'Parámetros actualizados correctamente' });
  } catch (err) {
    console.error('updateParametros:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── BLOQUES HORARIOS ──────────────────────────────────────────────

const getBloques = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT bh.*,
              pi.Parametro_Institucional_Inicio_Jornada AS jornada_inicio,
              pi.Parametro_Institucional_Fin_Jornada    AS jornada_fin,
              ${condicionDesajustado('bh')} AS desajustado,
              ${motivoDesajuste('bh')} AS motivo_desajuste,
              (SELECT COUNT(*) FROM horario_asignatura x
                WHERE x.Bloque_Horario_Id = bh.Bloque_Horario_Id AND ${claseVigente('x')}) AS clases
       FROM bloque_horario bh
       JOIN parametro_institucional pi ON pi.Parametro_Institucional_Id = bh.Parametro_Institucional_Id
       ORDER BY bh.Bloque_Horario_Hora_Inicio`
    );
    res.json(rows);
  } catch (err) {
    console.error('getBloques:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const createBloque = async (req, res) => {
  const { Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin, Bloque_Horario_Jornada, Bloque_Horario_Tipo } = req.body;
  // Redefinir bloques: con reemplazar=true el nuevo bloque reemplaza a los que
  // se superponen; sus clases quedan pendientes de reubicar.
  const reemplazar = req.body.reemplazar === true;

  if (!Bloque_Horario_Hora_Inicio || !Bloque_Horario_Hora_Fin || !Bloque_Horario_Jornada || !Bloque_Horario_Tipo) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (horaCompleta(Bloque_Horario_Hora_Inicio) >= horaCompleta(Bloque_Horario_Hora_Fin)) {
    return res.status(400).json({ error: 'La hora de inicio debe ser anterior a la hora de fin' });
  }

  try {
    const [param] = await pool.execute(`SELECT * FROM parametro_institucional LIMIT 1`);
    if (param.length === 0) {
      return res.status(400).json({ error: 'Configure los parámetros institucionales antes de crear bloques' });
    }
    const p = param[0];

    // Validar rango institucional
    if (horaCompleta(Bloque_Horario_Hora_Inicio) < horaCompleta(p.Parametro_Institucional_Inicio_Jornada) ||
        horaCompleta(Bloque_Horario_Hora_Fin)    > horaCompleta(p.Parametro_Institucional_Fin_Jornada)) {
      return res.status(400).json({
        error: `El bloque debe estar dentro del rango institucional: ${p.Parametro_Institucional_Inicio_Jornada.slice(0,5)} – ${p.Parametro_Institucional_Fin_Jornada.slice(0,5)}`
      });
    }

    // Verificar conflicto con bloques vigentes (CU49: solo dentro de la misma jornada).
    // Los bloques ya desajustados no cuentan: están a la espera de reubicar sus clases.
    const [conflicto] = await pool.execute(
      `SELECT b.Bloque_Horario_Id, b.Bloque_Horario_Hora_Inicio, b.Bloque_Horario_Hora_Fin, b.Bloque_Horario_Tipo,
              (SELECT COUNT(*) FROM horario_asignatura x
                WHERE x.Bloque_Horario_Id = b.Bloque_Horario_Id AND ${claseVigente('x')}) AS clases,
              (SELECT COUNT(*) FROM afecta af WHERE af.Bloque_Horario_Id = b.Bloque_Horario_Id) AS eventos
       FROM bloque_horario b
       WHERE b.Bloque_Horario_Hora_Inicio < ? AND b.Bloque_Horario_Hora_Fin > ?
         AND b.Bloque_Horario_Jornada = ?
         AND NOT ${condicionDesajustado('b')}`,
      [Bloque_Horario_Hora_Fin, Bloque_Horario_Hora_Inicio, Bloque_Horario_Jornada]
    );
    if (conflicto.length > 0 && !reemplazar) {
      return res.status(409).json({
        error: 'El horario se superpone con un bloque existente',
        codigo: 'SUPERPOSICION',
        bloques: conflicto.map((b) => ({
          Bloque_Horario_Id: b.Bloque_Horario_Id,
          Bloque_Horario_Hora_Inicio: b.Bloque_Horario_Hora_Inicio,
          Bloque_Horario_Hora_Fin: b.Bloque_Horario_Hora_Fin,
          Bloque_Horario_Tipo: b.Bloque_Horario_Tipo,
          clases: Number(b.clases),
        })),
      });
    }

    const conn = await pool.getConnection();
    let nuevoId;
    let clasesPendientes = 0;
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute(
        `INSERT INTO bloque_horario
         (Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin, Bloque_Horario_Jornada,
          Bloque_Horario_Tipo, Parametro_Institucional_Id)
         VALUES (?, ?, ?, ?, ?)`,
        [Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin, Bloque_Horario_Jornada,
         Bloque_Horario_Tipo, p.Parametro_Institucional_Id]
      );
      nuevoId = result.insertId;

      // Los bloques reemplazados sin clases ni eventos se eliminan; los que tienen
      // clases quedan desajustados hasta que el administrador las reubique.
      for (const b of conflicto) {
        if (Number(b.clases) === 0 && Number(b.eventos) === 0) {
          await purgarClasesEliminadas(conn, b.Bloque_Horario_Id);
          await conn.execute('DELETE FROM bloque_horario WHERE Bloque_Horario_Id = ?', [b.Bloque_Horario_Id]);
        } else {
          clasesPendientes += Number(b.clases);
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.status(201).json({
      mensaje: clasesPendientes > 0
        ? `Bloque creado. ${clasesPendientes} clase(s) quedaron pendientes de reubicar.`
        : 'Bloque creado correctamente',
      id: nuevoId,
      clasesPendientes,
    });
  } catch (err) {
    console.error('createBloque:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const updateBloque = async (req, res) => {
  const { id } = req.params;
  const { Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin, Bloque_Horario_Jornada, Bloque_Horario_Tipo } = req.body;

  // CU49 - Excepción "Datos inválidos o fuera de rango"
  if (!Bloque_Horario_Hora_Inicio || !Bloque_Horario_Hora_Fin || !Bloque_Horario_Jornada || !Bloque_Horario_Tipo) {
    return res.status(400).json({ error: 'Datos inválidos o fuera de rango' });
  }
  if (horaCompleta(Bloque_Horario_Hora_Inicio) >= horaCompleta(Bloque_Horario_Hora_Fin)) {
    return res.status(400).json({ error: 'Datos inválidos o fuera de rango' });
  }

  try {
    const [existe] = await pool.execute(
      `SELECT Bloque_Horario_Id, Parametro_Institucional_Id FROM bloque_horario WHERE Bloque_Horario_Id = ?`, [id]
    );
    if (existe.length === 0) return res.status(404).json({ error: 'Bloque no encontrado' });

    const [param] = await pool.execute(`SELECT * FROM parametro_institucional LIMIT 1`);
    if (param.length === 0) {
      return res.status(400).json({ error: 'Configure los parámetros institucionales antes de modificar bloques' });
    }
    const p = param[0];

    if (horaCompleta(Bloque_Horario_Hora_Inicio) < horaCompleta(p.Parametro_Institucional_Inicio_Jornada) ||
        horaCompleta(Bloque_Horario_Hora_Fin)    > horaCompleta(p.Parametro_Institucional_Fin_Jornada)) {
      return res.status(400).json({ error: 'Datos inválidos o fuera de rango' });
    }

    // CU49 - Excepción "Conflicto con bloque existente" (solo dentro de la misma jornada)
    const [conflicto] = await pool.execute(
      `SELECT b.Bloque_Horario_Id FROM bloque_horario b
       WHERE b.Bloque_Horario_Hora_Inicio < ? AND b.Bloque_Horario_Hora_Fin > ?
         AND b.Bloque_Horario_Jornada = ? AND b.Bloque_Horario_Id != ?
         AND NOT ${condicionDesajustado('b')}`,
      [horaCompleta(Bloque_Horario_Hora_Fin), horaCompleta(Bloque_Horario_Hora_Inicio), Bloque_Horario_Jornada, Number(id)]
    );
    if (conflicto.length > 0) return res.status(409).json({ error: 'Conflicto con bloque existente' });

    await pool.execute(
      `UPDATE bloque_horario SET
         Bloque_Horario_Hora_Inicio = ?,
         Bloque_Horario_Hora_Fin    = ?,
         Bloque_Horario_Jornada     = ?,
         Bloque_Horario_Tipo        = ?
       WHERE Bloque_Horario_Id = ?`,
      [horaCompleta(Bloque_Horario_Hora_Inicio), horaCompleta(Bloque_Horario_Hora_Fin), Bloque_Horario_Jornada, Bloque_Horario_Tipo, Number(id)]
    );
    res.json({ mensaje: 'Bloque actualizado correctamente' });
  } catch (err) {
    console.error('updateBloque:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const deleteBloque = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identificador de bloque no válido' });
  try {
    // CU50 - Excepción "Bloque posee asignaciones": el panel de avisos permite
    // migrar o eliminar esas clases antes de quitar el bloque.
    const [enHorario] = await pool.execute(
      `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
       WHERE ha.Bloque_Horario_Id = ? AND ${claseVigente('ha')}`, [id]
    );
    if (enHorario.length > 0) {
      return res.status(409).json({
        error: 'El bloque posee asignaciones activas',
        codigo: 'TIENE_CLASES',
        clases: enHorario.length,
      });
    }

    const [enEvento] = await pool.execute(
      `SELECT Afecta_Id FROM afecta WHERE Bloque_Horario_Id = ? LIMIT 1`, [id]
    );
    if (enEvento.length > 0) {
      return res.status(409).json({ error: 'No se puede eliminar: el bloque está asociado a un evento institucional' });
    }

    await purgarClasesEliminadas(pool, id);

    // CU50 - Excepción "Bloque horario no existe"
    const [result] = await pool.execute(`DELETE FROM bloque_horario WHERE Bloque_Horario_Id = ?`, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'El bloque horario no existe' });
    res.json({ mensaje: 'Bloque eliminado exitosamente' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: el bloque está referenciado por otros registros' });
    }
    // CU50 - Excepción "Error durante la eliminación en BD"
    console.error('deleteBloque:', err);
    res.status(500).json({ error: 'Ocurrió un error al eliminar' });
  }
};

// CU51: elimina varios bloques horarios a la vez. Todo o nada — si uno
// solo de los bloques no existe o tiene asignaciones/restricciones
// activas, no se elimina ninguno.
const deleteMultiplesBloques = async (req, res) => {
  const { bloques_id } = req.body;

  if (!Array.isArray(bloques_id) || bloques_id.length === 0) {
    return res.status(400).json({ error: 'Debe seleccionar al menos un bloque horario' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // CU51 - Excepción "Uno o más bloques horarios no existen"
    const [existentes] = await conn.query(
      `SELECT Bloque_Horario_Id FROM bloque_horario WHERE Bloque_Horario_Id IN (?)`,
      [bloques_id]
    );
    if (existentes.length !== bloques_id.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Uno o más bloques horarios no existen' });
    }

    // CU51 - Excepción "Tienen asignaciones o restricciones"
    const [enHorario] = await conn.query(
      `SELECT Horario_Asignatura_Id FROM horario_asignatura
       WHERE Bloque_Horario_Id IN (?) AND ${claseVigente('horario_asignatura')} LIMIT 1`,
      [bloques_id]
    );
    if (enHorario.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Uno o más bloques poseen asignaciones activas o restricciones asociadas' });
    }

    const [enEvento] = await conn.query(
      `SELECT Afecta_Id FROM afecta WHERE Bloque_Horario_Id IN (?) LIMIT 1`,
      [bloques_id]
    );
    if (enEvento.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Uno o más bloques poseen asignaciones activas o restricciones asociadas' });
    }

    await purgarClasesEliminadas(conn, bloques_id);
    await conn.query(`DELETE FROM bloque_horario WHERE Bloque_Horario_Id IN (?)`, [bloques_id]);

    await conn.commit();
    res.json({ mensaje: 'Bloques eliminados exitosamente' });
  } catch (err) {
    await conn.rollback();
    console.error('deleteMultiplesBloques:', err);
    res.status(500).json({ error: 'Ocurrió un error al eliminar' });
  } finally {
    conn.release();
  }
};

// ── EVENTOS INSTITUCIONALES (CU70, CU71, CU72) ────────────────────
//
// Regla de negocio aplicada para calcular qué bloques horarios quedan
// "afectados" por un evento (tabla `afecta`). Los bloques (bloque_horario)
// son plantillas de horario genéricas — no están ligadas a una fecha ni
// a un día de la semana — por lo que NO se modifica el horario semanal
// recurrente (horario_asignatura). En su lugar, se deja constancia en
// `afecta` de qué bloques quedan suspendidos ese día puntual del evento:
//
//   - "Sin impacto"       → no se registra ningún bloque afectado.
//   - "Salida anticipada" → se afectan los bloques tipo 'Clase' de la
//                           jornada 'Tarde'.
//   - "Suspensión total"  → se afectan TODOS los bloques tipo 'Clase'.
//   - "Suspensión jornada mañana" → se afectan los bloques tipo 'Clase'
//                           de la jornada 'Mañana' (CU66).
//   - "Suspensión parcial" → los bloques se eligen manualmente (CU65),
//                           por lo que aquí no se calcula ninguno.
//
// Si tu equipo definió una regla distinta en el informe, ajusten la
// función registrarBloquesAfectados() más abajo — es el único lugar
// donde vive esta decisión.

// Impactos que el formulario de eventos (CU70/CU71) puede registrar directamente.
const IMPACTOS_EVENTO = ['Sin impacto', 'Salida anticipada', 'Suspensión total', 'Suspensión jornada mañana'];
// 'Suspensión parcial' solo nace desde CU65 (bloques elegidos a mano); CU71 puede conservarlo.
const IMPACTOS_EDITABLES = [...IMPACTOS_EVENTO, 'Suspensión parcial'];

async function registrarBloquesAfectados(conn, eventoId, impacto) {
  if (impacto === 'Sin impacto' || impacto === 'Suspensión parcial') return [];

  let query = `SELECT Bloque_Horario_Id FROM bloque_horario WHERE Bloque_Horario_Tipo = 'Clase'`;
  if (impacto === 'Salida anticipada') {
    query += ` AND Bloque_Horario_Jornada = 'Tarde'`;
  } else if (impacto === 'Suspensión jornada mañana') {
    query += ` AND Bloque_Horario_Jornada = 'Mañana'`;
  }
  // 'Suspensión total' → todos los bloques de tipo Clase, sin filtro adicional

  const [bloques] = await conn.execute(query);
  if (bloques.length === 0) return [];

  const placeholders = bloques.map(() => '(?, ?, ?)').join(', ');
  const params = [];
  bloques.forEach((b) => params.push('Suspendido', b.Bloque_Horario_Id, eventoId));

  await conn.execute(
    `INSERT INTO afecta (Estado_Bloque, Bloque_Horario_Id, Evento_Institucional_Id) VALUES ${placeholders}`,
    params
  );

  return bloques.map((b) => b.Bloque_Horario_Id);
}

// La fecha se entrega como texto 'YYYY-MM-DD': un DATE leído por mysql2 llega
// como Date y, serializado a JSON, como '2026-12-10T03:00:00.000Z', que el
// frontend no logra interpretar ("fecha inválida") y puede correrse un día.
const COLUMNAS_EVENTO = `ei.Evento_Institucional_Id,
              ei.Evento_Institucional_Nombre,
              DATE_FORMAT(ei.Evento_Institucional_Fecha, '%Y-%m-%d') AS Evento_Institucional_Fecha,
              ei.Evento_Institucional_Descripcion,
              ei.Evento_Institucional_Impacto_Clases`;

// GET /api/bloques/eventos — incluye el conteo de bloques afectados por evento
const getEventos = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ${COLUMNAS_EVENTO},
              COUNT(af.Afecta_Id) AS bloques_afectados_count
       FROM evento_institucional ei
       LEFT JOIN afecta af ON af.Evento_Institucional_Id = ei.Evento_Institucional_Id
       GROUP BY ei.Evento_Institucional_Id
       ORDER BY ei.Evento_Institucional_Fecha DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('getEventos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/bloques/eventos/:id/afectados — detalle de bloques afectados (CU70/71)
const getBloquesAfectadosPorEvento = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT af.Afecta_Id, af.Estado_Bloque, bh.Bloque_Horario_Id,
              bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Jornada
       FROM afecta af
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = af.Bloque_Horario_Id
       WHERE af.Evento_Institucional_Id = ?
       ORDER BY bh.Bloque_Horario_Hora_Inicio`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('getBloquesAfectadosPorEvento:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/bloques/eventos/:id — detalle de un evento: sus datos, los bloques
// afectados y las clases que se suspenden ese día (las del mismo día de la semana)
const getEventoDetalle = async (req, res) => {
  const { id } = req.params;
  try {
    const [[evento]] = await pool.execute(
      `SELECT ${COLUMNAS_EVENTO},
              ELT(DAYOFWEEK(ei.Evento_Institucional_Fecha),
                  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado') AS dia_semana
       FROM evento_institucional ei
       WHERE ei.Evento_Institucional_Id = ?`,
      [id]
    );
    if (!evento) return res.status(404).json({ error: 'El evento no existe o fue eliminado' });

    const [bloques] = await pool.execute(
      `SELECT af.Afecta_Id, af.Estado_Bloque, bh.Bloque_Horario_Id,
              bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Jornada
       FROM afecta af
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = af.Bloque_Horario_Id
       WHERE af.Evento_Institucional_Id = ?
       ORDER BY bh.Bloque_Horario_Hora_Inicio`,
      [id]
    );

    const [clases] = await pool.execute(
      `SELECT ha.Horario_Asignatura_Id, c.Curso_Nombre, a.Asignatura_Nombre,
              u.Usuario_Nombre_Completo AS Docente_Nombre,
              bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin
       FROM afecta af
       JOIN bloque_horario     bh ON bh.Bloque_Horario_Id = af.Bloque_Horario_Id
       JOIN horario_asignatura ha ON ha.Bloque_Horario_Id = af.Bloque_Horario_Id
       JOIN curso              c  ON c.Curso_Id           = ha.Curso_Id
       JOIN asignatura         a  ON a.Asignatura_Id      = ha.Asignatura_Id
       LEFT JOIN usuario       u  ON u.Usuario_Id         = ha.Usuario_Id
       WHERE af.Evento_Institucional_Id = ?
         AND ha.Horario_Asignatura_Dia_Semana = ?
         AND ${claseVigente('ha')}
       ORDER BY bh.Bloque_Horario_Hora_Inicio, c.Curso_Nombre`,
      [id, evento.dia_semana]
    );

    res.json({ ...evento, bloques, clases });
  } catch (err) {
    console.error('getEventoDetalle:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /api/bloques/eventos — CU70 Registrando eventos institucionales
const createEvento = async (req, res) => {
  const { Evento_Institucional_Nombre, Evento_Institucional_Fecha, Evento_Institucional_Descripcion, Evento_Institucional_Impacto_Clases } = req.body;

  const impactosValidos = IMPACTOS_EVENTO;

  // CU70 - Excepción "Datos incompletos o inválidos"
  if (!Evento_Institucional_Nombre || !Evento_Institucional_Fecha || !Evento_Institucional_Descripcion ||
      !Evento_Institucional_Impacto_Clases || !impactosValidos.includes(Evento_Institucional_Impacto_Clases)) {
    return res.status(400).json({ error: 'Datos incompletos o inválidos en el formulario' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // CU70 - Excepción "Conflicto con planificación o bloque inexistente":
    // no se permite más de un evento institucional registrado para la misma fecha
    const [conflictos] = await conn.execute(
      `SELECT Evento_Institucional_Id FROM evento_institucional WHERE Evento_Institucional_Fecha = ?`,
      [Evento_Institucional_Fecha]
    );
    if (conflictos.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'El evento genera conflictos con la planificación' });
    }

    const [result] = await conn.execute(
      `INSERT INTO evento_institucional
       (Evento_Institucional_Nombre, Evento_Institucional_Fecha,
        Evento_Institucional_Descripcion, Evento_Institucional_Impacto_Clases)
       VALUES (?, ?, ?, ?)`,
      [Evento_Institucional_Nombre, Evento_Institucional_Fecha, Evento_Institucional_Descripcion, Evento_Institucional_Impacto_Clases]
    );
    const eventoId = result.insertId;

    const bloquesAfectados = await registrarBloquesAfectados(conn, eventoId, Evento_Institucional_Impacto_Clases);

    await conn.commit();
    res.status(201).json({
      mensaje: 'Evento registrado correctamente',
      id: eventoId,
      bloques_afectados: bloquesAfectados,
    });
  } catch (err) {
    await conn.rollback();
    console.error('createEvento:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};

// PUT /api/bloques/eventos/:id — CU71 Modificando eventos institucionales
const updateEvento = async (req, res) => {
  const { id } = req.params;
  const { Evento_Institucional_Nombre, Evento_Institucional_Fecha, Evento_Institucional_Descripcion, Evento_Institucional_Impacto_Clases } = req.body;

  if (!Evento_Institucional_Nombre || !Evento_Institucional_Fecha || !Evento_Institucional_Descripcion || !Evento_Institucional_Impacto_Clases) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const impactosValidos = IMPACTOS_EDITABLES;
  if (!impactosValidos.includes(Evento_Institucional_Impacto_Clases)) {
    return res.status(400).json({ error: 'Impacto en clases inválido' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // CU71 - Excepción "Evento no existe"
    const [existe] = await conn.execute(
      `SELECT Evento_Institucional_Id FROM evento_institucional WHERE Evento_Institucional_Id = ?`, [id]
    );
    if (existe.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'El evento no existe o fue eliminado' });
    }

    // CU71 - Excepción "Cambios generan conflictos": otro evento ya registrado en la misma fecha
    const [conflictos] = await conn.execute(
      `SELECT Evento_Institucional_Id FROM evento_institucional WHERE Evento_Institucional_Fecha = ? AND Evento_Institucional_Id != ?`,
      [Evento_Institucional_Fecha, id]
    );
    if (conflictos.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'El evento genera conflictos con la planificación' });
    }

    await conn.execute(
      `UPDATE evento_institucional SET
         Evento_Institucional_Nombre        = ?,
         Evento_Institucional_Fecha         = ?,
         Evento_Institucional_Descripcion   = ?,
         Evento_Institucional_Impacto_Clases = ?
       WHERE Evento_Institucional_Id = ?`,
      [Evento_Institucional_Nombre, Evento_Institucional_Fecha, Evento_Institucional_Descripcion, Evento_Institucional_Impacto_Clases, id]
    );

    // Excepción (CU71): el impacto pudo haber cambiado → se recalculan
    // los bloques afectados desde cero (se descartan los previos).
    // Una "Suspensión parcial" (CU65) conserva los bloques elegidos a mano.
    let bloquesAfectados = [];
    if (Evento_Institucional_Impacto_Clases === 'Suspensión parcial') {
      const [actuales] = await conn.execute(
        `SELECT Bloque_Horario_Id FROM afecta WHERE Evento_Institucional_Id = ?`, [id]
      );
      bloquesAfectados = actuales.map((a) => a.Bloque_Horario_Id);
    } else {
      await conn.execute(`DELETE FROM afecta WHERE Evento_Institucional_Id = ?`, [id]);
      bloquesAfectados = await registrarBloquesAfectados(conn, id, Evento_Institucional_Impacto_Clases);
    }

    await conn.commit();
    res.json({ mensaje: 'Evento actualizado correctamente', bloques_afectados: bloquesAfectados });
  } catch (err) {
    await conn.rollback();
    console.error('updateEvento:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};

// DELETE /api/bloques/eventos/:id — CU72 Eliminando eventos institucionales
// Nota: la FK fk_Afecta_Evento_Institucional tiene ON DELETE CASCADE,
// por lo que al borrar el evento la BD elimina automáticamente sus
// registros en `afecta` (los bloques quedan liberados sin más acción).
const deleteEvento = async (req, res) => {
  const { id } = req.params;
  try {
    // CU72 - Excepción "Evento no existe"
    const [result] = await pool.execute(
      `DELETE FROM evento_institucional WHERE Evento_Institucional_Id = ?`, [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'El evento no existe o ya fue eliminado' });
    res.json({ mensaje: 'Evento eliminado correctamente. Los bloques afectados fueron liberados.' });
  } catch (err) {
    // CU72 - Excepción "Error actualizando planificación"
    console.error('deleteEvento:', err);
    res.status(500).json({ error: 'No fue posible completar la eliminación solicitada' });
  }
};

module.exports = {
  getParametros, updateParametros,
  getBloques, createBloque, updateBloque, deleteBloque, deleteMultiplesBloques,
  getEventos, createEvento, updateEvento, deleteEvento,
  getBloquesAfectadosPorEvento, getEventoDetalle,
  registrarBloquesAfectados, // reutilizado por CU66 (horarioController)
};