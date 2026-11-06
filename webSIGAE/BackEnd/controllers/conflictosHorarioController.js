// Clases pendientes de reubicar tras redefinir la jornada o los bloques
// horarios. El administrador decide, por clase, si migrarla a un bloque
// vigente o eliminarla ("decidir más tarde" es solo una preferencia del
// navegador y no pasa por aquí).
//
// También cubre el caso de quitar un bloque que aún tiene clases: con
// ?bloque=ID (o "bloque" en el body) esas clases se tratan como pendientes
// hasta que el administrador las resuelva y elimine el bloque.
const pool = require('../config/db');
const { mismoPeriodoQueCurso } = require('../utils/periodos');
const { condicionDesajustado, motivoDesajuste } = require('../utils/bloquesDesajustados');
const { claseVigente, purgarClasesEliminadas } = require('../utils/clasesEliminadas');
const { periodoDelCurso, validarDisponibilidad } = require('../utils/disponibilidadLaboral');

const ORDEN_DIAS = `FIELD(ha.Horario_Asignatura_Dia_Semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes')`;

const aMinutos = (hora) => {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + (m || 0);
};

const idValido = (valor) => {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Bloque vigente sugerido para una clase: primero el que contiene su hora de
 * inicio, luego el que más se solapa con su horario original y, a igualdad,
 * el de inicio más cercano (preferentemente en la misma jornada).
 */
function sugerirDestino(clase, destinos) {
  const ini = aMinutos(clase.Hora_Inicio);
  const fin = aMinutos(clase.Hora_Fin);
  let mejor = null;
  let mejorPuntaje = -Infinity;

  for (const d of destinos) {
    if (d.Bloque_Horario_Id === clase.Bloque_Horario_Id) continue;
    const dIni = aMinutos(d.Bloque_Horario_Hora_Inicio);
    const dFin = aMinutos(d.Bloque_Horario_Hora_Fin);
    const contiene = dIni <= ini && ini < dFin ? 1e6 : 0;
    const solape = Math.max(0, Math.min(fin, dFin) - Math.max(ini, dIni));
    const mismaJornada = d.Bloque_Horario_Jornada === clase.Jornada ? 500 : 0;
    const puntaje = contiene + solape * 1000 + mismaJornada - Math.abs(dIni - ini);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = d.Bloque_Horario_Id;
    }
  }

  return mejor;
}

// ── GET /api/bloques/conflictos[?bloque=ID] ──────────────────────────────
const getConflictos = async (req, res) => {
  const bloqueAEliminar = idValido(req.query.bloque);

  try {
    const [clases] = await pool.query(
      `SELECT ha.Horario_Asignatura_Id,
              ha.Horario_Asignatura_Dia_Semana AS Dia,
              ha.Horario_Asignatura_Estado     AS Estado,
              ha.Curso_Id, c.Curso_Nombre,
              ha.Asignatura_Id, a.Asignatura_Nombre,
              ha.Usuario_Id, u.Usuario_Nombre_Completo AS Docente_Nombre,
              bh.Bloque_Horario_Id,
              bh.Bloque_Horario_Hora_Inicio AS Hora_Inicio,
              bh.Bloque_Horario_Hora_Fin    AS Hora_Fin,
              bh.Bloque_Horario_Jornada     AS Jornada,
              CASE WHEN bh.Bloque_Horario_Id = ? THEN 'Bloque por eliminar'
                   ELSE ${motivoDesajuste('bh')} END AS Motivo
         FROM horario_asignatura ha
         JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
         JOIN curso c           ON c.Curso_Id           = ha.Curso_Id
         JOIN asignatura a      ON a.Asignatura_Id      = ha.Asignatura_Id
         LEFT JOIN usuario u    ON u.Usuario_Id         = ha.Usuario_Id
        WHERE (${condicionDesajustado('bh')} OR bh.Bloque_Horario_Id = ?)
          AND ${claseVigente('ha')}
        ORDER BY bh.Bloque_Horario_Hora_Inicio, ${ORDEN_DIAS}, c.Curso_Nombre`,
      [bloqueAEliminar || 0, bloqueAEliminar || 0]
    );

    const [destinos] = await pool.query(
      `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Hora_Inicio,
              bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Jornada
         FROM bloque_horario bh
        WHERE bh.Bloque_Horario_Tipo = 'Clase'
          AND NOT ${condicionDesajustado('bh')}
          AND bh.Bloque_Horario_Id <> ?
        ORDER BY bh.Bloque_Horario_Hora_Inicio`,
      [bloqueAEliminar || 0]
    );

    return res.json({
      clases: clases.map((c) => ({ ...c, Sugerido_Id: sugerirDestino(c, destinos) })),
      destinos,
    });
  } catch (err) {
    console.error('getConflictos:', err);
    return res.status(500).json({ error: 'No fue posible cargar las clases pendientes de reubicar' });
  }
};

/**
 * Bloquea la fila de la clase y comprueba que siga pendiente. Si otro
 * administrador ya la resolvió, responde 409 para que el panel se refresque.
 */
async function obtenerClasePendiente(conn, horarioId, bloqueAEliminar, res) {
  const [[clase]] = await conn.query(
    `SELECT ha.Horario_Asignatura_Id, ha.Curso_Id, ha.Usuario_Id,
            ha.Horario_Asignatura_Dia_Semana AS Dia,
            bh.Bloque_Horario_Id,
            ${condicionDesajustado('bh')} AS Desajustado
       FROM horario_asignatura ha
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      WHERE ha.Horario_Asignatura_Id = ? AND ${claseVigente('ha')}
      FOR UPDATE`,
    [horarioId]
  );

  if (!clase) {
    res.status(404).json({ error: 'La clase ya no existe. Otro administrador pudo haberla eliminado.', codigo: 'YA_RESUELTA' });
    return null;
  }

  const pendiente = Number(clase.Desajustado) === 1 || clase.Bloque_Horario_Id === bloqueAEliminar;
  if (!pendiente) {
    res.status(409).json({ error: 'Esta clase ya no está pendiente de reubicar. Otro administrador pudo haberla resuelto.', codigo: 'YA_RESUELTA' });
    return null;
  }

  return clase;
}

/**
 * Si el bloque de origen quedó desajustado y sin clases, se elimina: ya fue
 * reemplazado o quedó fuera de la jornada. Se conserva si un evento lo usa.
 */
async function limpiarBloqueVacio(conn, bloqueId) {
  const [[bloque]] = await conn.query(
    `SELECT ${condicionDesajustado('bh')} AS Desajustado,
            (SELECT COUNT(*) FROM horario_asignatura x
              WHERE x.Bloque_Horario_Id = bh.Bloque_Horario_Id AND ${claseVigente('x')}) AS Clases,
            (SELECT COUNT(*) FROM afecta af WHERE af.Bloque_Horario_Id = bh.Bloque_Horario_Id) AS Eventos
       FROM bloque_horario bh
      WHERE bh.Bloque_Horario_Id = ?`,
    [bloqueId]
  );

  if (!bloque || Number(bloque.Desajustado) !== 1 || Number(bloque.Clases) > 0 || Number(bloque.Eventos) > 0) {
    return false;
  }

  await purgarClasesEliminadas(conn, bloqueId);
  await conn.query('DELETE FROM bloque_horario WHERE Bloque_Horario_Id = ?', [bloqueId]);
  return true;
}

// ── PUT /api/bloques/conflictos/:horarioId/migrar ────────────────────────
// Body: { bloqueDestinoId, bloque? }
const migrarClase = async (req, res) => {
  const horarioId = idValido(req.params.horarioId);
  const destinoId = idValido(req.body?.bloqueDestinoId);
  const bloqueAEliminar = idValido(req.body?.bloque);

  if (!horarioId) return res.status(400).json({ error: 'ID de clase inválido' });
  if (!destinoId) return res.status(400).json({ error: 'Debes elegir el bloque de destino' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const clase = await obtenerClasePendiente(conn, horarioId, bloqueAEliminar, res);
    if (!clase) {
      await conn.rollback();
      return;
    }

    const [[destino]] = await conn.query(
      `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Tipo,
              bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin,
              ${condicionDesajustado('bh')} AS Desajustado
         FROM bloque_horario bh
        WHERE bh.Bloque_Horario_Id = ?`,
      [destinoId]
    );

    if (!destino || destino.Bloque_Horario_Tipo !== 'Clase' || Number(destino.Desajustado) === 1 ||
        destinoId === clase.Bloque_Horario_Id || destinoId === bloqueAEliminar) {
      await conn.rollback();
      return res.status(422).json({ error: 'El bloque de destino no es válido: debe ser un bloque de clase vigente' });
    }

    // El curso no puede tener otra clase que se cruce con el destino ese día
    const [[choqueCurso]] = await conn.query(
      `SELECT a.Asignatura_Nombre
         FROM horario_asignatura ha
         JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
         JOIN asignatura a      ON a.Asignatura_Id      = ha.Asignatura_Id
        WHERE ha.Curso_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
          AND ${claseVigente('ha')}
          AND ha.Horario_Asignatura_Id <> ?
          AND bh.Bloque_Horario_Hora_Inicio < ? AND bh.Bloque_Horario_Hora_Fin > ?
        LIMIT 1`,
      [clase.Curso_Id, clase.Dia, horarioId, destino.Bloque_Horario_Hora_Fin, destino.Bloque_Horario_Hora_Inicio]
    );
    if (choqueCurso) {
      await conn.rollback();
      return res.status(409).json({ error: `El curso ya tiene ${choqueCurso.Asignatura_Nombre} en ese horario el ${clase.Dia}` });
    }

    // Ni el docente otra clase activa al mismo tiempo
    if (clase.Usuario_Id) {
      const [[choqueDocente]] = await conn.query(
        `SELECT c.Curso_Nombre
           FROM horario_asignatura ha
           JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
           JOIN curso c           ON c.Curso_Id           = ha.Curso_Id
          WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
            AND ha.Horario_Asignatura_Estado = 'Activo'
            AND ha.Horario_Asignatura_Id <> ?
            AND bh.Bloque_Horario_Hora_Inicio < ? AND bh.Bloque_Horario_Hora_Fin > ?
            AND ${mismoPeriodoQueCurso('ha')}
          LIMIT 1`,
        [clase.Usuario_Id, clase.Dia, horarioId, destino.Bloque_Horario_Hora_Fin, destino.Bloque_Horario_Hora_Inicio, clase.Curso_Id]
      );
      if (choqueDocente) {
        await conn.rollback();
        return res.status(409).json({ error: `El docente ya tiene clase con ${choqueDocente.Curso_Nombre} en ese horario el ${clase.Dia}` });
      }

      // CU107: el bloque de destino debe estar en la disponibilidad laboral del docente.
      // Si los bloques se redefinieron, hay que actualizar también su disponibilidad.
      const fueraDisponibilidad = await validarDisponibilidad(conn, {
        docenteId: clase.Usuario_Id, periodo: await periodoDelCurso(conn, clase.Curso_Id),
        dia: clase.Dia, bloqueId: destinoId,
      });
      if (fueraDisponibilidad) {
        await conn.rollback();
        return res.status(422).json({ error: fueraDisponibilidad });
      }
    }

    await conn.query(
      'UPDATE horario_asignatura SET Bloque_Horario_Id = ? WHERE Horario_Asignatura_Id = ?',
      [destinoId, horarioId]
    );
    const bloqueEliminado = await limpiarBloqueVacio(conn, clase.Bloque_Horario_Id);

    await conn.commit();
    return res.json({ mensaje: 'Clase migrada al nuevo bloque', bloqueEliminado });
  } catch (err) {
    await conn.rollback();
    console.error('migrarClase:', err);
    return res.status(500).json({ error: 'No fue posible migrar la clase' });
  } finally {
    conn.release();
  }
};

// ── DELETE /api/bloques/conflictos/:horarioId[?bloque=ID] ─────────────────
const eliminarClase = async (req, res) => {
  const horarioId = idValido(req.params.horarioId);
  const bloqueAEliminar = idValido(req.query.bloque);

  if (!horarioId) return res.status(400).json({ error: 'ID de clase inválido' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const clase = await obtenerClasePendiente(conn, horarioId, bloqueAEliminar, res);
    if (!clase) {
      await conn.rollback();
      return;
    }

    await conn.query('DELETE FROM horario_asignatura WHERE Horario_Asignatura_Id = ?', [horarioId]);
    const bloqueEliminado = await limpiarBloqueVacio(conn, clase.Bloque_Horario_Id);

    await conn.commit();
    return res.json({ mensaje: 'Clase eliminada del horario', bloqueEliminado });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'No se puede eliminar: la clase tiene registros asociados en el historial' });
    }
    console.error('eliminarClase:', err);
    return res.status(500).json({ error: 'No fue posible eliminar la clase' });
  } finally {
    conn.release();
  }
};

// ── POST /api/bloques/parametros/impacto ─────────────────────────────────
// Antes de guardar una nueva jornada: qué bloques con clases quedarían fuera.
const getImpactoParametros = async (req, res) => {
  const inicio = req.body?.Parametro_Institucional_Inicio_Jornada;
  const fin = req.body?.Parametro_Institucional_Fin_Jornada;

  if (!inicio || !fin || inicio >= fin) {
    return res.status(400).json({ error: 'El inicio de jornada debe ser anterior al fin' });
  }

  try {
    const [bloques] = await pool.query(
      `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Hora_Inicio, bh.Bloque_Horario_Hora_Fin,
              bh.Bloque_Horario_Jornada, bh.Bloque_Horario_Tipo,
              (SELECT COUNT(*) FROM horario_asignatura x
                WHERE x.Bloque_Horario_Id = bh.Bloque_Horario_Id AND ${claseVigente('x')}) AS Clases
         FROM bloque_horario bh
        WHERE (bh.Bloque_Horario_Hora_Inicio < ? OR bh.Bloque_Horario_Hora_Fin > ?)
          AND NOT ${condicionDesajustado('bh')}
        ORDER BY bh.Bloque_Horario_Hora_Inicio`,
      [inicio, fin]
    );

    const lista = bloques.map((b) => ({ ...b, Clases: Number(b.Clases) }));
    return res.json({
      clases: lista.reduce((total, b) => total + b.Clases, 0),
      bloques: lista,
    });
  } catch (err) {
    console.error('getImpactoParametros:', err);
    return res.status(500).json({ error: 'No fue posible calcular el impacto del cambio' });
  }
};

module.exports = {
  getConflictos,
  migrarClase,
  eliminarClase,
  getImpactoParametros,
  sugerirDestino,
};
