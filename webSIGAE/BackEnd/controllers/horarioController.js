const pool = require('../config/db');
const { condicionDesajustado, motivoDesajuste } = require('../utils/bloquesDesajustados');
const { ESTADO_ELIMINADO, claseVigente } = require('../utils/clasesEliminadas');
const { mismoPeriodoQueCurso, enPeriodoVigente, cursoNoArchivado, obtenerPeriodos } = require('../utils/periodos');
const {
  periodoDelCurso, mapaDisponibilidad, estaDisponible, validarDisponibilidad,
  resumenSemanal, advertenciaHorasAdeudadas,
} = require('../utils/disponibilidadLaboral');
const { esApoderadoDelEstudiante } = require('../utils/apoderadosEstudiante');

// ── GET /api/horarios?curso_id=X  (admin ve todo, docente solo el suyo) ──
// Las clases eliminadas solo se incluyen con ?incluir_eliminadas=1 y para
// administradores: el creador de horarios las muestra en su listado.
const getHorarios = async (req, res) => {
  try {
    const { curso_id, incluir_eliminadas } = req.query;
    const { id: userId, roles } = req.user;
    const esDocente = roles.includes('Docente') && !roles.includes('Administrador');
    const conEliminadas = ['1', 'true'].includes(String(incluir_eliminadas)) && roles.includes('Administrador');

    let query = `
      SELECT
        ha.Horario_Asignatura_Id,
        ha.Horario_Asignatura_Dia_Semana  AS dia,
        ha.Horario_Asignatura_Estado      AS estado,
        ha.Curso_Id,
        c.Curso_Nombre                    AS curso,
        ha.Bloque_Horario_Id,
        bh.Bloque_Horario_Hora_Inicio     AS hora_inicio,
        bh.Bloque_Horario_Hora_Fin        AS hora_fin,
        bh.Bloque_Horario_Jornada         AS jornada,
        bh.Bloque_Horario_Tipo            AS tipo_bloque,
        ha.Asignatura_Id,
        a.Asignatura_Nombre               AS asignatura,
        ha.Usuario_Id,
        u.Usuario_Nombre_Completo         AS docente,
        -- RF42 (CU65/CU66): próxima fecha en que el bloque queda suspendido por un
        -- evento institucional (tabla afecta) que cae en el mismo día de la semana
        (
          SELECT CONCAT(DATE_FORMAT(ei.Evento_Institucional_Fecha, '%Y-%m-%d'), '|', ei.Evento_Institucional_Nombre)
          FROM afecta af
          JOIN evento_institucional ei ON ei.Evento_Institucional_Id = af.Evento_Institucional_Id
          WHERE af.Bloque_Horario_Id = ha.Bloque_Horario_Id
            AND ei.Evento_Institucional_Fecha >= CURDATE()
            AND ELT(DAYOFWEEK(ei.Evento_Institucional_Fecha),
                    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado') = ha.Horario_Asignatura_Dia_Semana
          ORDER BY ei.Evento_Institucional_Fecha
          LIMIT 1
        )                                 AS suspension_evento
      FROM horario_asignatura ha
      JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
      JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
      LEFT JOIN usuario   u  ON u.Usuario_Id         = ha.Usuario_Id
      WHERE 1=1
    `;
    const params = [];

    if (!conEliminadas) {
      query += ` AND ${claseVigente('ha')}`;
    }

    if (esDocente) {
      // El docente ve su horario del período vigente (durante el cierre no se mezcla con el siguiente)
      query += ` AND ha.Usuario_Id = ? AND ${enPeriodoVigente('ha')}`;
      params.push(userId);
    }

    if (curso_id) {
      query += ' AND ha.Curso_Id = ?';
      params.push(curso_id);
    }

    query += ' ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana, "Lunes","Martes","Miércoles","Jueves","Viernes"), bh.Bloque_Horario_Hora_Inicio';

    const [rows] = await pool.execute(query, params);
    res.json(rows.map(({ suspension_evento, ...fila }) => {
      if (!suspension_evento) return { ...fila, suspension_evento: null };
      const [fecha, ...nombre] = String(suspension_evento).split('|');
      return { ...fila, suspension_evento: { fecha, nombre: nombre.join('|') } };
    }));
  } catch (error) {
    console.error('Error en getHorarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/horarios/cursos  (lista para el selector) ──
const getCursos = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.Curso_Id, c.Curso_Nombre, ne.Nivel_Educativo_Nombre, c.Curso_Periodo_Lectivo
       FROM curso c
       JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = c.Nivel_Educativo_Id
       WHERE ${cursoNoArchivado('c')}
       ORDER BY c.Curso_Periodo_Lectivo, ne.Nivel_Educativo_Orden, c.Curso_Seccion`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error en getCursos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/horarios/bloques  ──
const getBloques = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT bh.Bloque_Horario_Id, bh.Bloque_Horario_Hora_Inicio,
              bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Jornada, bh.Bloque_Horario_Tipo,
              ${condicionDesajustado('bh')} AS desajustado,
              ${motivoDesajuste('bh')} AS motivo_desajuste
       FROM bloque_horario bh
       ORDER BY bh.Bloque_Horario_Hora_Inicio`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error en getBloques:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/horarios/asignaturas  ──
const getAsignaturas = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT Asignatura_Id, Asignatura_Nombre, Asignatura_Prioridad_Academica
       FROM asignatura ORDER BY Asignatura_Nombre`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error en getAsignaturas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/horarios/asignaturas-curso?curso_id=X  ──
// Returns asignaturas from the active plan for a course, with hours required and programmed
const getAsignaturasCurso = async (req, res) => {
  const { curso_id } = req.query;
  if (!curso_id) return res.status(400).json({ error: 'curso_id requerido' });

  try {
    const [[curso]] = await pool.execute(
      'SELECT Nivel_Educativo_Id FROM curso WHERE Curso_Id = ?',
      [curso_id]
    );
    if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

    const [[plan]] = await pool.execute(
      `SELECT Plan_Educativo_Id FROM plan_educativo
       WHERE Nivel_Educativo_Id = ?
       ORDER BY Plan_Educativo_Periodo_Lectivo DESC LIMIT 1`,
      [curso.Nivel_Educativo_Id]
    );

    if (!plan) return res.json([]);

    const [rows] = await pool.execute(
      `SELECT
        ia.Asignatura_Id,
        a.Asignatura_Nombre,
        ia.Horas_Semanales_Requeridas,
        COALESCE(prog.Horas_Programadas, 0) AS Horas_Programadas
       FROM incluyeasig ia
       JOIN asignatura a  ON a.Asignatura_Id  = ia.Asignatura_Id
       JOIN tieneasig  ta ON ta.Asignatura_Id = ia.Asignatura_Id
                         AND ta.Curso_Id       = ?
                         AND ta.Estado_Asignacion = 'Activa'
       LEFT JOIN (
         SELECT ha.Asignatura_Id,
           SUM(TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600) AS Horas_Programadas
         FROM horario_asignatura ha
         JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
         WHERE ha.Curso_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'
         GROUP BY ha.Asignatura_Id
       ) prog ON prog.Asignatura_Id = ia.Asignatura_Id
       WHERE ia.Plan_Educativo_Id = ?
       ORDER BY a.Asignatura_Nombre`,
      [curso_id, curso_id, plan.Plan_Educativo_Id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error en getAsignaturasCurso:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/horarios/docentes  ──
const getDocentes = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Especialidad,
              Docente_Carga_Horaria_Maxima
       FROM usuario
       WHERE Es_Docente = 1 AND Usuario_Estado_Cuenta = 1
       ORDER BY Usuario_Nombre_Completo`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error en getDocentes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/horarios/docentes-disponibles  ── CU 56, CU107
// Devuelve todos los docentes activos enriquecidos con:
//   conflicto_horario, excede_carga, fuera_disponibilidad, carga_actual, carga_nueva,
//   horas_disponibles, horas_adeudadas, disponible
// curso_id (opcional) fija el período: conflictos, carga y disponibilidad se miden
// en el período de ese curso (sin curso, el vigente).
// El frontend calcula coincide_especialidad comparando las etiquetas con la asignatura.
const getDocentesDisponibles = async (req, res) => {
  const { asignatura_id, bloque_id, dia, horario_id, curso_id } = req.query;

  if (!bloque_id || !dia) {
    return res.status(400).json({ error: 'bloque_id y dia son obligatorios' });
  }

  try {
    const [docentes] = await pool.execute(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Especialidad,
              Docente_Carga_Horaria_Maxima
       FROM usuario
       WHERE Es_Docente = 1 AND Usuario_Estado_Cuenta = 1
       ORDER BY Usuario_Nombre_Completo`
    );

    if (docentes.length === 0) return res.json([]);

    // Duración y horario del bloque nuevo (en horas)
    const [bloqueInfo] = await pool.execute(
      `SELECT TIME_TO_SEC(TIMEDIFF(Bloque_Horario_Hora_Fin, Bloque_Horario_Hora_Inicio)) / 3600
         AS duracion_horas, Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin
       FROM bloque_horario WHERE Bloque_Horario_Id = ?`,
      [bloque_id]
    );
    const duracionNueva = bloqueInfo.length > 0 ? Number(bloqueInfo[0].duracion_horas) : 0;

    const userIds    = docentes.map(d => d.Usuario_Id);
    const phList     = userIds.map(() => '?').join(',');
    const excludeId  = horario_id ? parseInt(horario_id, 10) : null;
    const periodo    = (curso_id && await periodoDelCurso(pool, curso_id)) || (await obtenerPeriodos(pool)).vigente;

    // Docentes con conflicto en ese día+bloque (mismo período)
    let conflictoQuery =
      `SELECT DISTINCT ha.Usuario_Id
       FROM horario_asignatura ha
       JOIN curso c ON c.Curso_Id = ha.Curso_Id
       WHERE ha.Usuario_Id IN (${phList})
         AND ha.Bloque_Horario_Id = ?
         AND ha.Horario_Asignatura_Dia_Semana = ?
         AND ha.Horario_Asignatura_Estado = 'Activo'
         AND c.Curso_Periodo_Lectivo = ?`;
    const conflictoParams = [...userIds, bloque_id, dia, periodo];
    if (excludeId) { conflictoQuery += ' AND ha.Horario_Asignatura_Id != ?'; conflictoParams.push(excludeId); }

    const [conflictos] = await pool.execute(conflictoQuery, conflictoParams);
    const conflictoSet = new Set(conflictos.map(c => c.Usuario_Id));

    // Carga horaria semanal actual de cada docente
    let cargaQuery =
      `SELECT ha.Usuario_Id,
              COALESCE(SUM(
                TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600
              ), 0) AS horas_actuales
       FROM horario_asignatura ha
       JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
       JOIN curso c ON c.Curso_Id = ha.Curso_Id
       WHERE ha.Usuario_Id IN (${phList})
         AND ha.Horario_Asignatura_Estado = 'Activo'
         AND c.Curso_Periodo_Lectivo = ?`;
    const cargaParams = [...userIds, periodo];
    if (excludeId) { cargaQuery += ' AND ha.Horario_Asignatura_Id != ?'; cargaParams.push(excludeId); }
    cargaQuery += ' GROUP BY ha.Usuario_Id';

    const [cargas] = await pool.execute(cargaQuery, cargaParams);
    const cargaMap = Object.fromEntries(cargas.map(c => [c.Usuario_Id, Number(c.horas_actuales)]));

    // CU107: disponibilidad laboral semanal (tramos y horas disponibles por docente en el período)
    const mapaDisp = await mapaDisponibilidad(pool, userIds, [periodo]);
    const [horasDisp] = await pool.query(
      `SELECT Docente_Usuario_Id,
              SUM(TIME_TO_SEC(TIMEDIFF(Disponibilidad_Docente_Hora_Fin, Disponibilidad_Docente_Hora_Inicio))) / 3600 AS horas
       FROM disponibilidad_docente
       WHERE Docente_Usuario_Id IN (?) AND Disponibilidad_Docente_Periodo_Lectivo = ?
       GROUP BY Docente_Usuario_Id`,
      [userIds, periodo]
    );
    const horasDispMap = Object.fromEntries(horasDisp.map(h => [h.Docente_Usuario_Id, Math.round(Number(h.horas) * 100) / 100]));

    const resultado = docentes.map(d => {
      const cargaActual   = Math.round((cargaMap[d.Usuario_Id] || 0) * 100) / 100;
      const cargaMaxima   = d.Docente_Carga_Horaria_Maxima ?? null;
      const conflicto     = conflictoSet.has(d.Usuario_Id);
      const excedeCarga   = cargaMaxima !== null && (cargaActual + duracionNueva) > cargaMaxima;
      const fueraDisp     = bloqueInfo.length > 0 && !estaDisponible(mapaDisp, {
        docenteId: d.Usuario_Id, periodo, dia,
        horaInicio: bloqueInfo[0].Bloque_Horario_Hora_Inicio, horaFin: bloqueInfo[0].Bloque_Horario_Hora_Fin,
      });
      const horasDisponibles = horasDispMap[d.Usuario_Id] ?? null;
      const horasAdeudadas = horasDisponibles !== null && cargaMaxima !== null
        ? Math.max(0, Math.round((cargaMaxima - horasDisponibles) * 100) / 100)
        : 0;

      return {
        Usuario_Id:              d.Usuario_Id,
        Usuario_Nombre_Completo: d.Usuario_Nombre_Completo,
        Docente_Especialidad:    d.Docente_Especialidad,
        Docente_Carga_Horaria_Maxima: cargaMaxima,
        carga_actual:   cargaActual,
        carga_nueva:    Math.round((cargaActual + duracionNueva) * 100) / 100,
        conflicto_horario: conflicto,
        excede_carga:      excedeCarga,
        fuera_disponibilidad: fueraDisp,
        horas_disponibles: horasDisponibles,
        horas_adeudadas:   horasAdeudadas,
        periodo,
        disponible:        !conflicto && !excedeCarga && !fueraDisp,
      };
    });

    res.json(resultado);
  } catch (error) {
    console.error('Error en getDocentesDisponibles:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// CU107: advertencia de horas adeudadas del docente en el período del curso (no bloquea)
async function advertenciaDocente(docenteId, cursoId) {
  if (!docenteId) return null;
  try {
    const periodo = await periodoDelCurso(pool, cursoId);
    if (!periodo) return null;
    return advertenciaHorasAdeudadas(await resumenSemanal(pool, docenteId, periodo));
  } catch (error) {
    console.error('advertenciaDocente:', error);
    return null;
  }
}

// ── POST /api/horarios  (crear entrada) ──
const createHorario = async (req, res) => {
  const {
    Horario_Asignatura_Dia_Semana,
    Horario_Asignatura_Estado,
    Curso_Id,
    Bloque_Horario_Id,
    Asignatura_Id,
    Usuario_Id,   // opcional — CU independiente, puede llegar null
  } = req.body;

  if (!Horario_Asignatura_Dia_Semana || !Curso_Id || !Bloque_Horario_Id || !Asignatura_Id) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {

    // ================================================================
    //  CU 53 — VERIFICAR ASOCIACIÓN ASIGNATURA-CURSO  (prerequisito)
    //  La asignatura debe haber sido asociada al curso previamente
    //  (registro en tieneasig) antes de poder programar un bloque.
    //  Esta asociación se realiza UNA SOLA VEZ desde el módulo Cursos;
    //  aquí solo se valida que exista y esté activa.
    // ================================================================

    const [[cursoNivel]] = await pool.execute(
      'SELECT Nivel_Educativo_Id FROM curso WHERE Curso_Id = ?',
      [Curso_Id]
    );
    if (!cursoNivel) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const [[asigEnCurso]] = await pool.execute(
      `SELECT tieneasig_Id FROM tieneasig
       WHERE Curso_Id = ? AND Asignatura_Id = ? AND Estado_Asignacion = 'Activa'`,
      [Curso_Id, Asignatura_Id]
    );
    if (!asigEnCurso) {
      return res.status(422).json({
        error: 'La asignatura no está asociada a este curso. Primero debe asociarla desde el módulo de Cursos'
      });
    }

    const [[asigEnPlan]] = await pool.execute(
      `SELECT ia.Asignatura_Id, ia.Horas_Semanales_Requeridas
       FROM incluyeasig ia
       JOIN plan_educativo pe ON pe.Plan_Educativo_Id = ia.Plan_Educativo_Id
       WHERE pe.Nivel_Educativo_Id = ? AND ia.Asignatura_Id = ?
       ORDER BY pe.Plan_Educativo_Periodo_Lectivo DESC LIMIT 1`,
      [cursoNivel.Nivel_Educativo_Id, Asignatura_Id]
    );
    if (!asigEnPlan) {
      return res.status(422).json({
        error: 'La asignatura no pertenece al plan educativo del nivel del curso seleccionado'
      });
    }

    // ================================================================
    //  CU 54 — PROGRAMAR BLOQUE HORARIO
    //  Cada llamada a este endpoint registra UN bloque (un día + una
    //  hora) para la asignatura indicada. Para poner Matemáticas tres
    //  veces a la semana se invocan tres llamadas independientes; la
    //  asociación del CU 53 no se repite, solo se reutiliza.
    //
    //  Validaciones:
    //   - Excepción 4: conflicto de bloque en el mismo curso/día/hora
    //   - Excepción 5: restricciones institucionales (recreo, límite diario)
    //   - Excepción 3: no superar horas semanales requeridas
    // ================================================================

    // Excepción 4 — conflicto de bloque (mismo curso, día y horario)
    const [existe] = await pool.execute(
      `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
       WHERE ha.Curso_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
         AND ${claseVigente('ha')}`,
      [Curso_Id, Bloque_Horario_Id, Horario_Asignatura_Dia_Semana]
    );
    if (existe.length > 0) {
      return res.status(409).json({ error: 'Ya existe un bloque asignado en ese día y horario para este curso' });
    }

    // Excepción 5 — restricciones institucionales (tipo de bloque y límite diario)
    const [[bloqueRestriccion]] = await pool.execute(
      `SELECT bh.Bloque_Horario_Tipo,
              ${condicionDesajustado('bh')} AS desajustado,
              pi.Parametro_Institucional_Bloques_Maximos_Diarios,
              TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600 AS duracion_horas
       FROM bloque_horario bh
       JOIN parametro_institucional pi ON pi.Parametro_Institucional_Id = bh.Parametro_Institucional_Id
       WHERE bh.Bloque_Horario_Id = ?`,
      [Bloque_Horario_Id]
    );
    if (!bloqueRestriccion) {
      return res.status(404).json({ error: 'Bloque horario no encontrado' });
    }
    if (bloqueRestriccion.Bloque_Horario_Tipo === 'Recreo') {
      return res.status(422).json({ error: 'No se pueden programar clases en bloques de recreo' });
    }
    if (Number(bloqueRestriccion.desajustado) === 1) {
      return res.status(422).json({ error: 'El bloque fue reemplazado o quedó fuera de la jornada; elige un bloque vigente' });
    }
    const [[{ total_dia }]] = await pool.execute(
      `SELECT COUNT(*) AS total_dia FROM horario_asignatura
       WHERE Curso_Id = ? AND Horario_Asignatura_Dia_Semana = ? AND Horario_Asignatura_Estado = 'Activo'`,
      [Curso_Id, Horario_Asignatura_Dia_Semana]
    );
    if (total_dia >= bloqueRestriccion.Parametro_Institucional_Bloques_Maximos_Diarios) {
      return res.status(422).json({
        error: `El curso ya alcanzó el máximo de ${bloqueRestriccion.Parametro_Institucional_Bloques_Maximos_Diarios} bloque(s) diarios establecido por la institución`
      });
    }

    // Excepción 3 — no superar horas semanales requeridas por el plan
    {
      const [[{ horas_ya_programadas }]] = await pool.execute(
        `SELECT COALESCE(SUM(
           TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600
         ), 0) AS horas_ya_programadas
         FROM horario_asignatura ha
         JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
         WHERE ha.Curso_Id = ? AND ha.Asignatura_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'`,
        [Curso_Id, Asignatura_Id]
      );
      const nuevaDuracion = Number(bloqueRestriccion.duracion_horas);
      const totalConNuevo = Number(horas_ya_programadas) + nuevaDuracion;
      if (totalConNuevo > asigEnPlan.Horas_Semanales_Requeridas) {
        return res.status(422).json({
          error: `La asignatura requiere ${asigEnPlan.Horas_Semanales_Requeridas}h semanales según el plan educativo. ` +
                 `Ya tiene ${Number(horas_ya_programadas).toFixed(1)}h programadas; ` +
                 `agregar este bloque (${nuevaDuracion.toFixed(1)}h) excedería el límite`
        });
      }
    }

    // ================================================================
    //  ASIGNACIÓN DE DOCENTE  (proceso independiente y opcional)
    //  El docente puede quedar sin asignar (Usuario_Id = null) y
    //  definirse en cualquier momento posterior mediante PUT /:id.
    //  Cuando se envía, se validan disponibilidad y carga máxima.
    // ================================================================

    if (Usuario_Id) {
      const [conflictoDocente] = await pool.execute(
        `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
         WHERE ha.Usuario_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
           AND ${claseVigente('ha')} AND ${mismoPeriodoQueCurso('ha')}`,
        [Usuario_Id, Bloque_Horario_Id, Horario_Asignatura_Dia_Semana, Curso_Id]
      );
      if (conflictoDocente.length > 0) {
        return res.status(409).json({ error: 'El docente ya tiene una clase asignada en ese día y bloque horario' });
      }

      // CU107: el bloque debe estar dentro de la disponibilidad laboral del docente
      const fueraDisponibilidad = await validarDisponibilidad(pool, {
        docenteId: Usuario_Id, periodo: await periodoDelCurso(pool, Curso_Id),
        dia: Horario_Asignatura_Dia_Semana, bloqueId: Bloque_Horario_Id,
      });
      if (fueraDisponibilidad) return res.status(422).json({ error: fueraDisponibilidad });

      const [[docente]] = await pool.execute(
        'SELECT Docente_Carga_Horaria_Maxima FROM usuario WHERE Usuario_Id = ? AND Es_Docente = 1',
        [Usuario_Id]
      );
      if (docente?.Docente_Carga_Horaria_Maxima != null) {
        const [[bloqueDur]] = await pool.execute(
          `SELECT TIME_TO_SEC(TIMEDIFF(Bloque_Horario_Hora_Fin, Bloque_Horario_Hora_Inicio)) / 3600
             AS duracion FROM bloque_horario WHERE Bloque_Horario_Id = ?`,
          [Bloque_Horario_Id]
        );
        const [[cargaRow]] = await pool.execute(
          `SELECT COALESCE(SUM(
             TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600
           ), 0) AS horas_actuales
           FROM horario_asignatura ha
           JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
           WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'
             AND ${mismoPeriodoQueCurso('ha')}`,
          [Usuario_Id, Curso_Id]
        );
        const horasActuales = Number(cargaRow.horas_actuales);
        const duracion      = Number(bloqueDur?.duracion || 0);
        const maxHoras      = Number(docente.Docente_Carga_Horaria_Maxima);
        if ((horasActuales + duracion) > maxHoras) {
          return res.status(422).json({
            error: `El docente excedería su carga horaria semanal de ${maxHoras}h semanales `
                 + `(actual: ${horasActuales.toFixed(1)}h, este bloque añade: ${duracion.toFixed(1)}h)`,
          });
        }
      }
    }

    // ── Registro final ───────────────────────────────────────────────
    // RNF17: los chequeos de conflicto anteriores corren en conexiones
    // separadas y no bloquean filas, por lo que dos solicitudes simultáneas
    // podrían pasarlos ambas antes de insertar. Se repite el chequeo de
    // conflicto (curso/bloque/día y, si aplica, docente/bloque/día) dentro
    // de una transacción con bloqueo de filas justo antes del INSERT, de
    // forma atómica, para impedir el doble booking bajo concurrencia.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existeFinal] = await conn.execute(
        `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
         WHERE ha.Curso_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
           AND ${claseVigente('ha')}
         FOR UPDATE`,
        [Curso_Id, Bloque_Horario_Id, Horario_Asignatura_Dia_Semana]
      );
      if (existeFinal.length > 0) {
        await conn.rollback();
        return res.status(409).json({ error: 'Ya existe un bloque asignado en ese día y horario para este curso' });
      }

      if (Usuario_Id) {
        const [conflictoDocenteFinal] = await conn.execute(
          `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
           WHERE ha.Usuario_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
             AND ${claseVigente('ha')} AND ${mismoPeriodoQueCurso('ha')}
           FOR UPDATE`,
          [Usuario_Id, Bloque_Horario_Id, Horario_Asignatura_Dia_Semana, Curso_Id]
        );
        if (conflictoDocenteFinal.length > 0) {
          await conn.rollback();
          return res.status(409).json({ error: 'El docente ya tiene una clase asignada en ese día y bloque horario' });
        }
      }

      const [result] = await conn.execute(
        `INSERT INTO horario_asignatura
         (Horario_Asignatura_Dia_Semana, Horario_Asignatura_Estado,
          Curso_Id, Bloque_Horario_Id, Asignatura_Id, Usuario_Id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          Horario_Asignatura_Dia_Semana,
          Horario_Asignatura_Estado || 'Activo',
          Curso_Id,
          Bloque_Horario_Id,
          Asignatura_Id,
          Usuario_Id || null,
        ]
      );

      await conn.commit();
      res.status(201).json({
        mensaje: 'Horario creado correctamente',
        id: result.insertId,
        advertencia: await advertenciaDocente(Usuario_Id, Curso_Id),
      });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Error en createHorario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/horarios/:id  (editar entrada) ──
const updateHorario = async (req, res) => {
  const { id } = req.params;
  const {
    Horario_Asignatura_Dia_Semana,
    Horario_Asignatura_Estado,
    Curso_Id,
    Bloque_Horario_Id,
    Asignatura_Id,
    Usuario_Id,
  } = req.body;

  if (Horario_Asignatura_Estado === ESTADO_ELIMINADO) {
    return res.status(400).json({ error: 'Para eliminar una clase usa la opción Eliminar' });
  }

  try {
    const [existe] = await pool.execute(
      `SELECT Horario_Asignatura_Id, Bloque_Horario_Id, Horario_Asignatura_Estado,
              Horario_Asignatura_Dia_Semana, Usuario_Id, Curso_Id
       FROM horario_asignatura WHERE Horario_Asignatura_Id = ?`,
      [id]
    );
    if (existe.length === 0) {
      return res.status(404).json({ error: 'Entrada de horario no encontrada' });
    }
    if (existe[0].Horario_Asignatura_Estado === ESTADO_ELIMINADO) {
      return res.status(409).json({ error: 'La clase fue eliminada; restáurala desde el listado antes de editarla' });
    }

    // Verificar conflicto de bloque (excluyendo el registro actual)
    const [conflictoCurso] = await pool.execute(
      `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
       WHERE ha.Curso_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
         AND ${claseVigente('ha')} AND ha.Horario_Asignatura_Id != ?`,
      [Curso_Id, Bloque_Horario_Id, Horario_Asignatura_Dia_Semana, id]
    );
    if (conflictoCurso.length > 0) {
      return res.status(409).json({ error: 'Ya existe un bloque asignado en ese día y horario para este curso' });
    }

    // ================================================================
    //  CU 53 — VERIFICAR ASOCIACIÓN ASIGNATURA-CURSO  (prerequisito)
    //  Misma validación que en POST: la asignatura debe existir en
    //  tieneasig para este curso antes de poder editar el bloque.
    // ================================================================

    const [[cursoNivelU]] = await pool.execute(
      'SELECT Nivel_Educativo_Id FROM curso WHERE Curso_Id = ?',
      [Curso_Id]
    );
    if (!cursoNivelU) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const [[asigEnCursoU]] = await pool.execute(
      `SELECT tieneasig_Id FROM tieneasig
       WHERE Curso_Id = ? AND Asignatura_Id = ? AND Estado_Asignacion = 'Activa'`,
      [Curso_Id, Asignatura_Id]
    );
    if (!asigEnCursoU) {
      return res.status(422).json({
        error: 'La asignatura no está asociada a este curso. Primero debe asociarla desde el módulo de Cursos'
      });
    }

    const [[asigEnPlanU]] = await pool.execute(
      `SELECT ia.Asignatura_Id, ia.Horas_Semanales_Requeridas
       FROM incluyeasig ia
       JOIN plan_educativo pe ON pe.Plan_Educativo_Id = ia.Plan_Educativo_Id
       WHERE pe.Nivel_Educativo_Id = ? AND ia.Asignatura_Id = ?
       ORDER BY pe.Plan_Educativo_Periodo_Lectivo DESC LIMIT 1`,
      [cursoNivelU.Nivel_Educativo_Id, Asignatura_Id]
    );
    if (!asigEnPlanU) {
      return res.status(422).json({
        error: 'La asignatura no pertenece al plan educativo del nivel del curso seleccionado'
      });
    }

    // ================================================================
    //  CU 54 — PROGRAMAR BLOQUE HORARIO  (edición)
    //  Excepción 4: conflicto de bloque (excluyendo el registro actual)
    //  Excepción 5: restricciones institucionales
    //  Excepción 3: no superar horas semanales requeridas
    // ================================================================

    // Excepción 5 — restricciones institucionales
    const [[bloqueRestriccionU]] = await pool.execute(
      `SELECT bh.Bloque_Horario_Tipo,
              ${condicionDesajustado('bh')} AS desajustado,
              pi.Parametro_Institucional_Bloques_Maximos_Diarios,
              TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600 AS duracion_horas
       FROM bloque_horario bh
       JOIN parametro_institucional pi ON pi.Parametro_Institucional_Id = bh.Parametro_Institucional_Id
       WHERE bh.Bloque_Horario_Id = ?`,
      [Bloque_Horario_Id]
    );
    if (!bloqueRestriccionU) {
      return res.status(404).json({ error: 'Bloque horario no encontrado' });
    }
    if (bloqueRestriccionU.Bloque_Horario_Tipo === 'Recreo') {
      return res.status(422).json({ error: 'No se pueden programar clases en bloques de recreo' });
    }
    // Una clase pendiente puede editarse sin moverla, pero no trasladarse a otro bloque desajustado
    if (Number(bloqueRestriccionU.desajustado) === 1 &&
        Number(Bloque_Horario_Id) !== Number(existe[0].Bloque_Horario_Id)) {
      return res.status(422).json({ error: 'El bloque fue reemplazado o quedó fuera de la jornada; elige un bloque vigente' });
    }
    const [[{ total_dia_u }]] = await pool.execute(
      `SELECT COUNT(*) AS total_dia_u FROM horario_asignatura
       WHERE Curso_Id = ? AND Horario_Asignatura_Dia_Semana = ?
         AND Horario_Asignatura_Estado = 'Activo' AND Horario_Asignatura_Id != ?`,
      [Curso_Id, Horario_Asignatura_Dia_Semana, id]
    );
    if (total_dia_u >= bloqueRestriccionU.Parametro_Institucional_Bloques_Maximos_Diarios) {
      return res.status(422).json({
        error: `El curso ya alcanzó el máximo de ${bloqueRestriccionU.Parametro_Institucional_Bloques_Maximos_Diarios} bloque(s) diarios establecido por la institución`
      });
    }

    // Excepción 3 — no superar horas semanales (excluye el registro editado)
    {
      const [[{ horas_ya_programadas_u }]] = await pool.execute(
        `SELECT COALESCE(SUM(
           TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600
         ), 0) AS horas_ya_programadas_u
         FROM horario_asignatura ha
         JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
         WHERE ha.Curso_Id = ? AND ha.Asignatura_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'
           AND ha.Horario_Asignatura_Id != ?`,
        [Curso_Id, Asignatura_Id, id]
      );
      const nuevaDuracionU = Number(bloqueRestriccionU.duracion_horas);
      const totalConNuevoU = Number(horas_ya_programadas_u) + nuevaDuracionU;
      if (totalConNuevoU > asigEnPlanU.Horas_Semanales_Requeridas) {
        return res.status(422).json({
          error: `La asignatura requiere ${asigEnPlanU.Horas_Semanales_Requeridas}h semanales según el plan educativo. ` +
                 `Ya tiene ${Number(horas_ya_programadas_u).toFixed(1)}h programadas; ` +
                 `agregar este bloque (${nuevaDuracionU.toFixed(1)}h) excedería el límite`
        });
      }
    }

    // ================================================================
    //  ASIGNACIÓN DE DOCENTE  (proceso independiente y opcional)
    //  El docente puede quedar en null y asignarse después.
    //  Validaciones excluyen el registro que se está editando.
    // ================================================================

    if (Usuario_Id) {
      const [conflictoDocente] = await pool.execute(
        `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
         WHERE ha.Usuario_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
           AND ${claseVigente('ha')} AND ha.Horario_Asignatura_Id != ? AND ${mismoPeriodoQueCurso('ha')}`,
        [Usuario_Id, Bloque_Horario_Id, Horario_Asignatura_Dia_Semana, id, Curso_Id]
      );
      if (conflictoDocente.length > 0) {
        return res.status(409).json({ error: 'El docente ya tiene una clase asignada en ese día y bloque horario' });
      }

      // CU107: solo se valida si cambia el docente, el día, el bloque o el curso. Una clase
      // que ya estaba fuera de la disponibilidad se mantiene (con advertencia) al editar otros datos.
      const original = existe[0];
      const cambiaUbicacion = Number(original.Usuario_Id) !== Number(Usuario_Id)
        || original.Horario_Asignatura_Dia_Semana !== Horario_Asignatura_Dia_Semana
        || Number(original.Bloque_Horario_Id) !== Number(Bloque_Horario_Id)
        || Number(original.Curso_Id) !== Number(Curso_Id);
      if (cambiaUbicacion) {
        const fueraDisponibilidad = await validarDisponibilidad(pool, {
          docenteId: Usuario_Id, periodo: await periodoDelCurso(pool, Curso_Id),
          dia: Horario_Asignatura_Dia_Semana, bloqueId: Bloque_Horario_Id,
        });
        if (fueraDisponibilidad) return res.status(422).json({ error: fueraDisponibilidad });
      }

      const [[docente]] = await pool.execute(
        'SELECT Docente_Carga_Horaria_Maxima FROM usuario WHERE Usuario_Id = ? AND Es_Docente = 1',
        [Usuario_Id]
      );
      if (docente?.Docente_Carga_Horaria_Maxima != null) {
        const [[bloqueDur]] = await pool.execute(
          `SELECT TIME_TO_SEC(TIMEDIFF(Bloque_Horario_Hora_Fin, Bloque_Horario_Hora_Inicio)) / 3600
             AS duracion FROM bloque_horario WHERE Bloque_Horario_Id = ?`,
          [Bloque_Horario_Id]
        );
        const [[cargaRow]] = await pool.execute(
          `SELECT COALESCE(SUM(
             TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600
           ), 0) AS horas_actuales
           FROM horario_asignatura ha
           JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
           WHERE ha.Usuario_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'
             AND ha.Horario_Asignatura_Id != ? AND ${mismoPeriodoQueCurso('ha')}`,
          [Usuario_Id, id, Curso_Id]
        );
        const horasActuales = Number(cargaRow.horas_actuales);
        const duracion      = Number(bloqueDur?.duracion || 0);
        const maxHoras      = Number(docente.Docente_Carga_Horaria_Maxima);
        if ((horasActuales + duracion) > maxHoras) {
          return res.status(422).json({
            error: `El docente excedería su carga horaria semanal de ${maxHoras}h semanales `
                 + `(actual: ${horasActuales.toFixed(1)}h, este bloque añade: ${duracion.toFixed(1)}h)`,
          });
        }
      }
    }

    await pool.execute(
      `UPDATE horario_asignatura SET
         Horario_Asignatura_Dia_Semana = ?,
         Horario_Asignatura_Estado     = ?,
         Curso_Id                      = ?,
         Bloque_Horario_Id             = ?,
         Asignatura_Id                 = ?,
         Usuario_Id                    = ?
       WHERE Horario_Asignatura_Id = ?`,
      [
        Horario_Asignatura_Dia_Semana,
        Horario_Asignatura_Estado,
        Curso_Id,
        Bloque_Horario_Id,
        Asignatura_Id,
        Usuario_Id || null,
        id,
      ]
    );

    res.json({
      mensaje: 'Horario actualizado correctamente',
      advertencia: await advertenciaDocente(Usuario_Id, Curso_Id),
    });
  } catch (error) {
    console.error('Error en updateHorario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PATCH /api/horarios/:id/estado  (cambiar estado) ──
const cambiarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const estadosValidos = ['Activo', 'Suspendido'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido. Use: Activo o Suspendido' });
  }

  try {
    const [existe] = await pool.execute(
      `SELECT Horario_Asignatura_Id, Horario_Asignatura_Estado FROM horario_asignatura WHERE Horario_Asignatura_Id = ?`,
      [id]
    );
    if (existe.length === 0) {
      return res.status(404).json({ error: 'Entrada de horario no encontrada' });
    }
    if (existe[0].Horario_Asignatura_Estado === ESTADO_ELIMINADO) {
      return res.status(409).json({ error: 'La clase fue eliminada; restáurala desde el listado' });
    }

    await pool.execute(
      `UPDATE horario_asignatura SET Horario_Asignatura_Estado = ? WHERE Horario_Asignatura_Id = ?`,
      [estado, id]
    );

    res.json({ mensaje: `Estado cambiado a ${estado}` });
  } catch (error) {
    console.error('Error en cambiarEstado:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DELETE /api/horarios/:id  (eliminar clase desde el creador de horarios) ──
// No borra la fila: la marca como eliminada para que libere su bloque y siga
// figurando en el listado de clases del curso (ver utils/clasesEliminadas).
const eliminarHorario = async (req, res) => {
  const { id } = req.params;
  try {
    const [[clase]] = await pool.execute(
      `SELECT Horario_Asignatura_Estado FROM horario_asignatura WHERE Horario_Asignatura_Id = ?`,
      [id]
    );
    if (!clase) {
      return res.status(404).json({ error: 'Entrada de horario no encontrada' });
    }
    if (clase.Horario_Asignatura_Estado === ESTADO_ELIMINADO) {
      return res.status(409).json({ error: 'La clase ya fue eliminada' });
    }

    await pool.execute(
      `UPDATE horario_asignatura SET Horario_Asignatura_Estado = ? WHERE Horario_Asignatura_Id = ?`,
      [ESTADO_ELIMINADO, id]
    );
    res.json({ mensaje: 'Clase eliminada del horario. Sigue disponible en el listado de clases eliminadas.' });
  } catch (error) {
    console.error('Error en eliminarHorario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PATCH /api/horarios/:id/restaurar  (devolver una clase eliminada al horario) ──
// Vuelve como 'Activo' si su bloque sigue libre para el curso y el docente, y
// sin superar las horas semanales del plan ni el máximo de bloques diarios.
const restaurarHorario = async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[clase]] = await conn.execute(
      `SELECT ha.Horario_Asignatura_Estado AS estado, ha.Curso_Id, ha.Usuario_Id, ha.Asignatura_Id,
              ha.Bloque_Horario_Id, ha.Horario_Asignatura_Dia_Semana AS dia,
              c.Nivel_Educativo_Id,
              pi.Parametro_Institucional_Bloques_Maximos_Diarios AS maximo_diario,
              TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600 AS duracion
       FROM horario_asignatura ha
       JOIN curso                   c  ON c.Curso_Id           = ha.Curso_Id
       JOIN bloque_horario          bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
       JOIN parametro_institucional pi ON pi.Parametro_Institucional_Id = bh.Parametro_Institucional_Id
       WHERE ha.Horario_Asignatura_Id = ?
       FOR UPDATE`,
      [id]
    );
    if (!clase) {
      await conn.rollback();
      return res.status(404).json({ error: 'Entrada de horario no encontrada' });
    }
    if (clase.estado !== ESTADO_ELIMINADO) {
      await conn.rollback();
      return res.status(409).json({ error: 'La clase no está eliminada' });
    }

    const [ocupadoCurso] = await conn.execute(
      `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
       WHERE ha.Curso_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
         AND ${claseVigente('ha')}
       FOR UPDATE`,
      [clase.Curso_Id, clase.Bloque_Horario_Id, clase.dia]
    );
    if (ocupadoCurso.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'El curso ya tiene otra clase en ese día y bloque horario' });
    }

    if (clase.Usuario_Id) {
      const [ocupadoDocente] = await conn.execute(
        `SELECT Horario_Asignatura_Id FROM horario_asignatura ha
         WHERE ha.Usuario_Id = ? AND ha.Bloque_Horario_Id = ? AND ha.Horario_Asignatura_Dia_Semana = ?
           AND ${claseVigente('ha')} AND ${mismoPeriodoQueCurso('ha')}
         FOR UPDATE`,
        [clase.Usuario_Id, clase.Bloque_Horario_Id, clase.dia, clase.Curso_Id]
      );
      if (ocupadoDocente.length > 0) {
        await conn.rollback();
        return res.status(409).json({ error: 'El docente ya tiene otra clase en ese día y bloque horario' });
      }
    }

    const [[{ total_dia }]] = await conn.execute(
      `SELECT COUNT(*) AS total_dia FROM horario_asignatura
       WHERE Curso_Id = ? AND Horario_Asignatura_Dia_Semana = ? AND Horario_Asignatura_Estado = 'Activo'`,
      [clase.Curso_Id, clase.dia]
    );
    if (Number(total_dia) >= Number(clase.maximo_diario)) {
      await conn.rollback();
      return res.status(422).json({
        error: `El curso ya alcanzó el máximo de ${clase.maximo_diario} bloque(s) diarios establecido por la institución`
      });
    }

    const [[plan]] = await conn.execute(
      `SELECT ia.Horas_Semanales_Requeridas
       FROM incluyeasig ia
       JOIN plan_educativo pe ON pe.Plan_Educativo_Id = ia.Plan_Educativo_Id
       WHERE pe.Nivel_Educativo_Id = ? AND ia.Asignatura_Id = ?
       ORDER BY pe.Plan_Educativo_Periodo_Lectivo DESC LIMIT 1`,
      [clase.Nivel_Educativo_Id, clase.Asignatura_Id]
    );
    if (plan) {
      const [[{ horas }]] = await conn.execute(
        `SELECT COALESCE(SUM(
           TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600
         ), 0) AS horas
         FROM horario_asignatura ha
         JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
         WHERE ha.Curso_Id = ? AND ha.Asignatura_Id = ? AND ha.Horario_Asignatura_Estado = 'Activo'`,
        [clase.Curso_Id, clase.Asignatura_Id]
      );
      if (Number(horas) + Number(clase.duracion) > Number(plan.Horas_Semanales_Requeridas)) {
        await conn.rollback();
        return res.status(422).json({
          error: `La asignatura ya tiene ${Number(horas).toFixed(1)}h de las ${plan.Horas_Semanales_Requeridas}h ` +
                 'semanales del plan educativo; restaurar esta clase excedería el límite',
        });
      }
    }

    await conn.execute(
      `UPDATE horario_asignatura SET Horario_Asignatura_Estado = 'Activo' WHERE Horario_Asignatura_Id = ?`,
      [id]
    );
    await conn.commit();
    res.json({ mensaje: 'Clase restaurada en el horario' });
  } catch (error) {
    await conn.rollback();
    console.error('Error en restaurarHorario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};

// ── GET /api/horarios/resumen-cursos  ── resumen de horas por curso para el listado
const getResumenCursos = async (req, res) => {
  try {
    const [cursosBase] = await pool.execute(`
      SELECT c.Curso_Id, c.Curso_Nombre, ne.Nivel_Educativo_Nombre, c.Curso_Periodo_Lectivo
      FROM curso c
      JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = c.Nivel_Educativo_Id
      WHERE ${cursoNoArchivado('c')}
      ORDER BY c.Curso_Periodo_Lectivo, ne.Nivel_Educativo_Orden, c.Curso_Nombre
    `);
    if (cursosBase.length === 0) return res.json([]);

    const [requeridas] = await pool.execute(`
      SELECT c.Curso_Id,
             COALESCE(SUM(CASE WHEN ta.Curso_Id IS NOT NULL THEN ia.Horas_Semanales_Requeridas ELSE 0 END), 0)
               AS total_horas_requeridas
      FROM curso c
      LEFT JOIN plan_educativo pe
             ON pe.Nivel_Educativo_Id = c.Nivel_Educativo_Id
            AND pe.Plan_Educativo_Periodo_Lectivo = (
                  SELECT MAX(pe2.Plan_Educativo_Periodo_Lectivo)
                  FROM plan_educativo pe2
                  WHERE pe2.Nivel_Educativo_Id = c.Nivel_Educativo_Id
                )
      LEFT JOIN incluyeasig ia ON ia.Plan_Educativo_Id = pe.Plan_Educativo_Id
      LEFT JOIN tieneasig ta ON ta.Asignatura_Id = ia.Asignatura_Id
                             AND ta.Curso_Id = c.Curso_Id
                             AND ta.Estado_Asignacion = 'Activa'
      GROUP BY c.Curso_Id
    `);

    const [programadas] = await pool.execute(`
      SELECT ha.Curso_Id,
             COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600), 0)
               AS total_horas_programadas
      FROM horario_asignatura ha
      JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      WHERE ha.Horario_Asignatura_Estado = 'Activo'
      GROUP BY ha.Curso_Id
    `);

    const reqMap = {};
    for (const r of requeridas) reqMap[r.Curso_Id] = Number(r.total_horas_requeridas);
    const progMap = {};
    for (const r of programadas) progMap[r.Curso_Id] = Number(r.total_horas_programadas);

    const result = cursosBase.map(c => ({
      Curso_Id              : c.Curso_Id,
      Curso_Nombre          : c.Curso_Nombre,
      Nivel_Educativo_Nombre: c.Nivel_Educativo_Nombre,
      Curso_Periodo_Lectivo : c.Curso_Periodo_Lectivo,
      total_horas_requeridas : reqMap[c.Curso_Id]  ?? 0,
      total_horas_programadas: progMap[c.Curso_Id] ?? 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('getResumenCursos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// CU42: Visualizar cursos y asignaturas asignadas a un docente
// GET /api/horarios/docente/:docenteId/asignaciones
const getAsignacionesDocente = async (req, res) => {
  try {
    const { roles, id: userId } = req.user;
    const esAdmin = roles.includes('Administrador');
    const esDocenteSinAdmin = roles.includes('Docente') && !esAdmin;

    // Solo el propio Docente o un Administrador/SuperAdmin pueden consultar esta información
    if (!esDocenteSinAdmin && !esAdmin) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    // Si el actor es Docente (y no Admin), solo puede ver sus propias asignaciones
    const docenteId = esDocenteSinAdmin ? userId : Number(req.params.docenteId);

    // Excepción 2: el docente destino no existe (solo relevante cuando lo busca un Admin/SuperAdmin)
    if (!esDocenteSinAdmin) {
      const [[docente]] = await pool.execute(
        'SELECT Usuario_Id FROM usuario WHERE Usuario_Id = ? AND Es_Docente = 1',
        [docenteId]
      );
      if (!docente) {
        return res.status(404).json({ mensaje: 'El docente no fue encontrado' });
      }
    }

    const [filas] = await pool.execute(
      `SELECT
        ne.Nivel_Educativo_Nombre        AS nivelEducativo,
        c.Curso_Id                       AS cursoId,
        c.Curso_Nombre                   AS curso,
        a.Asignatura_Id                  AS asignaturaId,
        a.Asignatura_Nombre              AS asignatura,
        ha.Horario_Asignatura_Dia_Semana AS dia,
        bh.Bloque_Horario_Hora_Inicio    AS horaInicio,
        bh.Bloque_Horario_Hora_Fin       AS horaFin,
        ha.Horario_Asignatura_Estado     AS estado
      FROM horario_asignatura ha
      JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
      JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = c.Nivel_Educativo_Id
      JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
      JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      WHERE ha.Usuario_Id = ? AND ${claseVigente('ha')} AND ${enPeriodoVigente('ha')}
      ORDER BY c.Curso_Nombre, a.Asignatura_Nombre`,
      [docenteId]
    );

    // Excepción 1: el docente no posee cursos, asignaturas o programaciones asociadas
    if (filas.length === 0) {
      return res.status(200).json({
        mensaje: 'No existen asignaciones registradas',
        asignaciones: [],
      });
    }

    // Agrupar por curso + asignatura (una fila por bloque horario programado)
    const agrupado = new Map();
    for (const f of filas) {
      const clave = `${f.cursoId}-${f.asignaturaId}`;
      if (!agrupado.has(clave)) {
        agrupado.set(clave, {
          nivelEducativo: f.nivelEducativo,
          cursoId: f.cursoId,
          curso: f.curso,
          asignaturaId: f.asignaturaId,
          asignatura: f.asignatura,
          bloques: [],
          horasSemanales: 0,
          estadoVigencia: 'Suspendido',
        });
      }
      const grupo = agrupado.get(clave);
      grupo.bloques.push({ dia: f.dia, horaInicio: f.horaInicio, horaFin: f.horaFin, estado: f.estado });

      const [hI, mI] = f.horaInicio.split(':').map(Number);
      const [hF, mF] = f.horaFin.split(':').map(Number);
      grupo.horasSemanales += (hF * 60 + mF - (hI * 60 + mI)) / 60;

      if (f.estado === 'Activo') grupo.estadoVigencia = 'Activo';
    }

    return res.json(Array.from(agrupado.values()));
  } catch (error) {
    console.error('getAsignacionesDocente:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar las asignaciones académicas, reintente más tarde' });
  }
};

// CU43: Visualizar horario semanal de un docente a partir de sus cursos asociados
// GET /api/horarios/docente/:docenteId/horario
const getHorarioDocente = async (req, res) => {
  try {
    const { roles, id: userId } = req.user;
    const esAdmin = roles.includes('Administrador');
    const esDocenteSinAdmin = roles.includes('Docente') && !esAdmin;

    // Solo el propio Docente o un Administrador/SuperAdmin pueden consultar esta información
    if (!esDocenteSinAdmin && !esAdmin) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    // Si el actor es Docente (y no Admin), solo puede ver su propio horario
    const docenteId = esDocenteSinAdmin ? userId : Number(req.params.docenteId);

    // Excepción "Docente no existe" (solo relevante cuando lo busca un Admin/SuperAdmin)
    if (!esDocenteSinAdmin) {
      const [[docente]] = await pool.execute(
        'SELECT Usuario_Id FROM usuario WHERE Usuario_Id = ? AND Es_Docente = 1',
        [docenteId]
      );
      if (!docente) {
        return res.status(404).json({ mensaje: 'El docente no fue encontrado' });
      }
    }

    const [filas] = await pool.execute(
      `SELECT
        ha.Horario_Asignatura_Id         AS id,
        ha.Curso_Id                      AS cursoId,
        ha.Asignatura_Id                 AS asignaturaId,
        c.Curso_Nombre                   AS curso,
        a.Asignatura_Nombre              AS asignatura,
        ha.Horario_Asignatura_Dia_Semana AS dia,
        bh.Bloque_Horario_Hora_Inicio    AS horaInicio,
        bh.Bloque_Horario_Hora_Fin       AS horaFin,
        ha.Horario_Asignatura_Estado     AS estado,
        ${condicionDesajustado('bh')}    AS pendiente
      FROM horario_asignatura ha
      JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
      JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
      JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      WHERE ha.Usuario_Id = ? AND ${claseVigente('ha')} AND ${enPeriodoVigente('ha')}
      ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'),
               bh.Bloque_Horario_Hora_Inicio`,
      [docenteId]
    );

    // CU43/CU58 - Excepción "Horario sin planificar" / "Sin asignaciones horarias"
    if (filas.length === 0) {
      return res.status(200).json({
        mensaje: 'No hay horario disponible para mostrar',
        horario: [],
      });
    }

    return res.json(filas);
  } catch (error) {
    console.error('getHorarioDocente:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar el horario, reintente más tarde' });
  }
};

// ── GET /api/horarios/estudiante/:estudianteId/horario ──
// Horario semanal del curso de un estudiante. El apoderado solo puede consultar
// a sus propios estudiantes; un Administrador/SuperAdmin puede consultar cualquiera.
const getHorarioEstudiante = async (req, res) => {
  try {
    const { roles, id: userId } = req.user;
    const esAdmin = roles.includes('Administrador');
    const esApoderado = roles.includes('Apoderado');

    if (!esAdmin && !esApoderado) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    const estudianteId = Number(req.params.estudianteId);
    if (!Number.isInteger(estudianteId) || estudianteId <= 0) {
      return res.status(400).json({ mensaje: 'ID de estudiante inválido' });
    }

    const [[estudiante]] = await pool.execute(
      `SELECT e.Estudiante_Id, e.Estudiante_Nombre_Completo, e.Curso_Id,
              e.Apoderado_Usuario_Id, c.Curso_Nombre
         FROM estudiante e
         JOIN curso c ON c.Curso_Id = e.Curso_Id
        WHERE e.Estudiante_Id = ? AND e.Estudiante_Fecha_Eliminacion IS NULL`,
      [estudianteId]
    );

    // Un apoderado que no es Admin no distingue "no existe" de "no es suyo"
    // RF57: el titular y los suplentes son apoderados asociados del estudiante
    const esSuyo = estudiante && (esAdmin || Number(estudiante.Apoderado_Usuario_Id) === Number(userId)
      || await esApoderadoDelEstudiante(pool, userId, estudianteId));
    if (!estudiante || !esSuyo) {
      return res.status(404).json({ mensaje: 'El estudiante no fue encontrado' });
    }

    const [horario] = await pool.execute(
      `SELECT
        ha.Horario_Asignatura_Id         AS id,
        ha.Asignatura_Id                 AS asignaturaId,
        a.Asignatura_Nombre              AS asignatura,
        u.Usuario_Nombre_Completo        AS docente,
        ha.Horario_Asignatura_Dia_Semana AS dia,
        bh.Bloque_Horario_Hora_Inicio    AS horaInicio,
        bh.Bloque_Horario_Hora_Fin       AS horaFin,
        ha.Horario_Asignatura_Estado     AS estado,
        ${condicionDesajustado('bh')}    AS pendiente
      FROM horario_asignatura ha
      JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
      JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      LEFT JOIN usuario   u  ON u.Usuario_Id         = ha.Usuario_Id
      WHERE ha.Curso_Id = ? AND ${claseVigente('ha')}
      ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'),
               bh.Bloque_Horario_Hora_Inicio`,
      [estudiante.Curso_Id]
    );

    return res.json({
      estudiante: {
        id: estudiante.Estudiante_Id,
        nombre: estudiante.Estudiante_Nombre_Completo,
        curso: estudiante.Curso_Nombre,
      },
      horario,
      ...(horario.length === 0 && { mensaje: 'El curso del estudiante aún no tiene horario planificado' }),
    });
  } catch (error) {
    console.error('getHorarioEstudiante:', error);
    return res.status(500).json({ mensaje: 'No fue posible cargar el horario, reintente más tarde' });
  }
};

// ── GET /api/horarios/maestro — CU57: vista consolidada del horario de toda la institución ──
const getHorarioMaestro = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        ha.Horario_Asignatura_Id,
        ha.Horario_Asignatura_Dia_Semana  AS dia,
        ha.Curso_Id,
        c.Curso_Nombre                    AS curso,
        c.Curso_Seccion                   AS seccion,
        ha.Bloque_Horario_Id,
        bh.Bloque_Horario_Hora_Inicio     AS hora_inicio,
        bh.Bloque_Horario_Hora_Fin        AS hora_fin,
        bh.Bloque_Horario_Jornada         AS jornada,
        ha.Asignatura_Id,
        a.Asignatura_Nombre               AS asignatura,
        ha.Usuario_Id,
        u.Usuario_Nombre_Completo         AS docente
      FROM horario_asignatura ha
      JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
      JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
      LEFT JOIN usuario   u  ON u.Usuario_Id         = ha.Usuario_Id
      WHERE ha.Horario_Asignatura_Estado = 'Activo'
      ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana, "Lunes","Martes","Miércoles","Jueves","Viernes"),
               bh.Bloque_Horario_Hora_Inicio, c.Curso_Nombre
    `);

    // CU57 - Excepción "No existen datos suficientes"
    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'No es posible generar el horario maestro' });
    }

    return res.json(rows);
  } catch (error) {
    console.error('getHorarioMaestro:', error);
    return res.status(500).json({ mensaje: 'No fue posible generar el horario maestro, reintente más tarde' });
  }
};

// ── GET /api/horarios/filtrar ── CU68 / RF44: Filtrar horarios reactivamente
const filtrarHorarios = async (req, res) => {
  try {
    const {
      docente_id,
      curso_id,
      nivel_educativo_id,
      asignatura_id,
      jornada,
      dia_semana,
      estado = 'Activo'
    } = req.query;

    let query = `
      SELECT
        ha.Horario_Asignatura_Id,
        ha.Horario_Asignatura_Dia_Semana  AS dia,
        ha.Horario_Asignatura_Estado      AS estado,
        ha.Curso_Id                       AS cursoId,
        c.Curso_Nombre                    AS curso,
        c.Curso_Seccion                   AS seccion,
        ne.Nivel_Educativo_Id             AS nivelEducativoId,
        ne.Nivel_Educativo_Nombre         AS nivelEducativo,
        ha.Bloque_Horario_Id              AS bloqueId,
        bh.Bloque_Horario_Hora_Inicio     AS horaInicio,
        bh.Bloque_Horario_Hora_Fin        AS horaFin,
        bh.Bloque_Horario_Jornada         AS jornada,
        bh.Bloque_Horario_Tipo            AS tipoBloque,
        ha.Asignatura_Id                  AS asignaturaId,
        a.Asignatura_Nombre               AS asignatura,
        ha.Usuario_Id                     AS docenteId,
        COALESCE(u.Usuario_Nombre_Completo, 'Sin asignar') AS docente
      FROM horario_asignatura ha
      JOIN curso           c  ON c.Curso_Id           = ha.Curso_Id
      JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = c.Nivel_Educativo_Id
      JOIN bloque_horario  bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      JOIN asignatura      a  ON a.Asignatura_Id      = ha.Asignatura_Id
      LEFT JOIN usuario    u  ON u.Usuario_Id         = ha.Usuario_Id
      WHERE 1=1
    `;
    const params = [];

    if (estado && estado !== 'Todos') {
      query += ' AND ha.Horario_Asignatura_Estado = ?';
      params.push(estado);
    } else {
      query += ` AND ${claseVigente('ha')}`;
    }
    if (docente_id) {
      query += ` AND ha.Usuario_Id = ? AND ${enPeriodoVigente('ha')}`;
      params.push(docente_id);
    }
    if (curso_id) {
      query += ' AND ha.Curso_Id = ?';
      params.push(curso_id);
    }
    if (nivel_educativo_id) {
      query += ' AND c.Nivel_Educativo_Id = ?';
      params.push(nivel_educativo_id);
    }
    if (asignatura_id) {
      query += ' AND ha.Asignatura_Id = ?';
      params.push(asignatura_id);
    }
    if (jornada) {
      query += ' AND bh.Bloque_Horario_Jornada = ?';
      params.push(jornada);
    }
    if (dia_semana) {
      query += ' AND ha.Horario_Asignatura_Dia_Semana = ?';
      params.push(dia_semana);
    }

    query += ` ORDER BY FIELD(ha.Horario_Asignatura_Dia_Semana, 'Lunes','Martes','Miércoles','Jueves','Viernes'),
                        bh.Bloque_Horario_Hora_Inicio, c.Curso_Nombre`;

    const [rows] = await pool.execute(query, params);

    // CU68 - Excepción 2: Sin resultados coincidentes
    if (rows.length === 0) {
      return res.status(200).json({
        mensaje: 'No se encontraron horarios coincidentes con los filtros seleccionados',
        horarios: []
      });
    }

    return res.json(rows);
  } catch (error) {
    console.error('Error en filtrarHorarios:', error);
    return res.status(500).json({ mensaje: 'Error al filtrar horarios, intente nuevamente' });
  }
};

const DIAS_POR_INDICE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function fechaISO(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Fecha (YYYY-MM-DD) en que se evalúa cada día hábil para CU67: la fecha indicada
// por el actor o, por defecto, la próxima ocurrencia de cada día (hoy incluido).
// Devuelve { error } si la fecha es inválida o no es un día hábil.
function fechasAEvaluar(fecha, diaSemana) {
  if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Formato de fecha inválido (use AAAA-MM-DD)' };
    const [y, m, d] = fecha.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      return { error: 'Formato de fecha inválido (use AAAA-MM-DD)' };
    }
    const dia = DIAS_POR_INDICE[dt.getDay()];
    if (!DIAS_SEMANA.includes(dia)) return { error: 'La fecha debe corresponder a un día hábil (lunes a viernes)' };
    return { fechas: { [dia]: fecha } };
  }

  const fechas = {};
  const hoy = new Date();
  for (let i = 0; i < 7; i++) {
    const dt = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    const dia = DIAS_POR_INDICE[dt.getDay()];
    if (DIAS_SEMANA.includes(dia) && (!diaSemana || diaSemana === dia)) fechas[dia] = fechaISO(dt);
  }
  return { fechas };
}

// ── GET /api/horarios/bloques-libres ── CU67 / RF43: Disponibilidad de bloques libres
// Un bloque está libre si no tiene asignaciones activas de cursos o docentes en ese
// día de la semana, ni actividades institucionales (eventos registrados en `afecta`)
// en la fecha evaluada.
const getBloquesLibres = async (req, res) => {
  try {
    // curso_id y docente_id son opcionales: sin ellos se consideran libres los
    // bloques sin ninguna asignación activa en toda la institución.
    const { curso_id, docente_id, dia_semana, jornada, fecha } = req.query;

    const { fechas, error } = fechasAEvaluar(fecha, dia_semana);
    if (error) {
      return res.status(400).json({ mensaje: error });
    }

    let bloqueQuery = `
      SELECT
        bh.Bloque_Horario_Id          AS bloqueId,
        bh.Bloque_Horario_Hora_Inicio AS horaInicio,
        bh.Bloque_Horario_Hora_Fin    AS horaFin,
        bh.Bloque_Horario_Jornada     AS jornada,
        bh.Bloque_Horario_Tipo        AS tipo
      FROM bloque_horario bh
      WHERE bh.Bloque_Horario_Tipo != 'Recreo'
    `;
    const bloqueParams = [];

    if (jornada) {
      bloqueQuery += ' AND bh.Bloque_Horario_Jornada = ?';
      bloqueParams.push(jornada);
    }
    bloqueQuery += ' ORDER BY bh.Bloque_Horario_Hora_Inicio';

    const [todosLosBloques] = await pool.execute(bloqueQuery, bloqueParams);

    // Días a evaluar, en orden de lunes a viernes
    const dias = DIAS_SEMANA.filter((d) => fechas[d]);

    // Consultar bloques ocupados
    let ocupadosQuery = `
      SELECT Bloque_Horario_Id, Horario_Asignatura_Dia_Semana
      FROM horario_asignatura
      WHERE Horario_Asignatura_Estado = 'Activo'
    `;
    const ocupadosParams = [];

    // Con curso y docente a la vez, el bloque está ocupado si lo usa cualquiera de los dos
    const condiciones = [];
    if (curso_id) {
      condiciones.push('Curso_Id = ?');
      ocupadosParams.push(curso_id);
    }
    if (docente_id) {
      // Durante el cierre, el docente puede tener clases en dos períodos: cuentan solo las del
      // período del curso consultado (o, sin curso, las del período vigente).
      if (curso_id) {
        condiciones.push(`(Usuario_Id = ? AND ${mismoPeriodoQueCurso('horario_asignatura')})`);
        ocupadosParams.push(docente_id, curso_id);
      } else {
        condiciones.push(`(Usuario_Id = ? AND ${enPeriodoVigente('horario_asignatura')})`);
        ocupadosParams.push(docente_id);
      }
    }
    if (condiciones.length > 0) {
      ocupadosQuery += ` AND (${condiciones.join(' OR ')})`;
    }

    const [ocupados] = await pool.execute(ocupadosQuery, ocupadosParams);
    const ocupadosSet = new Set(
      ocupados.map(o => `${o.Horario_Asignatura_Dia_Semana}-${o.Bloque_Horario_Id}`)
    );

    // Actividades institucionales: bloques afectados por eventos en las fechas evaluadas
    const fechasEvaluadas = dias.map((d) => fechas[d]);
    const eventosPorClave = new Map();
    if (fechasEvaluadas.length > 0) {
      const [afectados] = await pool.execute(
        `SELECT af.Bloque_Horario_Id,
                DATE_FORMAT(ei.Evento_Institucional_Fecha, '%Y-%m-%d') AS fecha,
                ei.Evento_Institucional_Nombre AS evento
         FROM afecta af
         JOIN evento_institucional ei ON ei.Evento_Institucional_Id = af.Evento_Institucional_Id
         WHERE ei.Evento_Institucional_Fecha IN (${fechasEvaluadas.map(() => '?').join(', ')})`,
        fechasEvaluadas
      );
      afectados.forEach((a) => eventosPorClave.set(`${a.fecha}-${a.Bloque_Horario_Id}`, a.evento));
    }

    const bloquesLibres = [];
    for (const dia of dias) {
      for (const bloque of todosLosBloques) {
        const key = `${dia}-${bloque.bloqueId}`;
        if (!ocupadosSet.has(key) && !eventosPorClave.has(`${fechas[dia]}-${bloque.bloqueId}`)) {
          bloquesLibres.push({
            dia,
            fecha: fechas[dia],
            ...bloque
          });
        }
      }
    }

    // CU67 - Excepción 1: No existen bloques libres disponibles
    if (bloquesLibres.length === 0) {
      return res.status(200).json({
        mensaje: 'No existen bloques libres disponibles para los criterios indicados',
        bloquesLibres: []
      });
    }

    return res.json(bloquesLibres);
  } catch (error) {
    console.error('Error en getBloquesLibres:', error);
    return res.status(500).json({ mensaje: 'Error al consultar disponibilidad de bloques libres' });
  }
};

// ── GET /api/horarios/bloque-detalle/:id ── CU69 / CU71 / RF45: Detalle de bloque horario
const getDetalleBloqueHorario = async (req, res) => {
  try {
    const roles = req.user?.roles || [];
    const esAdmin = roles.includes('Administrador');

    // Solo Admin, o un docente sobre sus propias clases (se valida tras la consulta)
    if (!esAdmin && !roles.includes('Docente')) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    const id = Number(req.params.id);

    // CU69 - Excepción 1: identificador inválido equivale a bloque inexistente
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ mensaje: 'El bloque horario seleccionado no existe o fue eliminado' });
    }

    const [rows] = await pool.execute(`
      SELECT
        ha.Horario_Asignatura_Id          AS horarioId,
        ha.Horario_Asignatura_Dia_Semana  AS dia,
        ha.Horario_Asignatura_Estado      AS estado,
        c.Curso_Id                        AS cursoId,
        c.Curso_Nombre                    AS curso,
        ne.Nivel_Educativo_Nombre         AS nivelEducativo,
        bh.Bloque_Horario_Id              AS bloqueId,
        bh.Bloque_Horario_Hora_Inicio     AS horaInicio,
        bh.Bloque_Horario_Hora_Fin        AS horaFin,
        bh.Bloque_Horario_Jornada         AS jornada,
        bh.Bloque_Horario_Tipo            AS tipoBloque,
        a.Asignatura_Id                   AS asignaturaId,
        a.Asignatura_Nombre               AS asignatura,
        a.Asignatura_Prioridad_Academica  AS prioridadAcademica,
        u.Usuario_Id                      AS docenteId,
        COALESCE(u.Usuario_Nombre_Completo, 'Sin docente asignado') AS docente,
        u.Docente_Especialidad            AS especialidadDocente
      FROM horario_asignatura ha
      JOIN curso           c  ON c.Curso_Id           = ha.Curso_Id
      JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = c.Nivel_Educativo_Id
      JOIN bloque_horario  bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
      JOIN asignatura      a  ON a.Asignatura_Id      = ha.Asignatura_Id
      LEFT JOIN usuario    u  ON u.Usuario_Id         = ha.Usuario_Id
      WHERE ha.Horario_Asignatura_Id = ?
    `, [id]);

    // CU69 - Excepción 1: Bloque horario no existe
    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'El bloque horario seleccionado no existe o fue eliminado' });
    }

    const detalle = rows[0];

    if (!esAdmin && Number(detalle.docenteId) !== Number(req.user.id)) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta información' });
    }

    // RF42/RF45: próximos eventos institucionales que suspenden este bloque
    // (tabla afecta) en una fecha que cae el mismo día de la semana.
    const [eventos] = await pool.execute(`
      SELECT
        ei.Evento_Institucional_Id                              AS eventoId,
        ei.Evento_Institucional_Nombre                          AS nombre,
        DATE_FORMAT(ei.Evento_Institucional_Fecha, '%Y-%m-%d')  AS fecha,
        ei.Evento_Institucional_Impacto_Clases                  AS impacto,
        af.Estado_Bloque                                        AS estadoBloque
      FROM afecta af
      JOIN evento_institucional ei ON ei.Evento_Institucional_Id = af.Evento_Institucional_Id
      WHERE af.Bloque_Horario_Id = ?
        AND ei.Evento_Institucional_Fecha >= CURDATE()
        AND ELT(DAYOFWEEK(ei.Evento_Institucional_Fecha),
                'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado') = ?
      ORDER BY ei.Evento_Institucional_Fecha
    `, [detalle.bloqueId, detalle.dia]);

    const observaciones = [];
    if (detalle.estado === 'Suspendido') {
      observaciones.push('El bloque se encuentra suspendido en el horario semanal del curso.');
    }
    if (!detalle.docenteId) {
      observaciones.push('El bloque no tiene un docente asignado.');
    }
    eventos.forEach((ev) => {
      observaciones.push(
        `${ev.estadoBloque || 'Suspendido'} el ${ev.fecha} por el evento institucional "${ev.nombre}" (${ev.impacto}).`
      );
    });

    return res.json({ ...detalle, eventos, observaciones });
  } catch (error) {
    console.error('Error en getDetalleBloqueHorario:', error);
    return res.status(500).json({ mensaje: 'Error al recuperar el detalle del bloque horario' });
  }
};
// ══════════════════════════════════════════════════════════════════
//  CU63 Reasignando docente en múltiples bloques
//  CU64 Modificando múltiples bloques horarios
//
//  Ambos casos de uso siguen el mismo patrón de sus diagramas de
//  secuencia: (1) validar los cambios propuestos sobre los bloques
//  seleccionados y devolver un resumen, (2) tras la confirmación del
//  actor, aplicar el UPDATE sobre horario_asignatura WHERE
//  Horario_Asignatura_Id IN (Horario_Ids). CU63 es el caso particular
//  en que el único campo modificado es el docente.
// ══════════════════════════════════════════════════════════════════

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const MENSAJES_CU63 = {
  datosInvalidos: 'Seleccione bloques y un docente válido',
  conflicto:      'El docente presenta conflicto horario',
  exito:          'Docente reasignado en los bloques seleccionados',
};

const MENSAJES_CU64 = {
  datosInvalidos: 'Seleccione bloques y campos válidos a modificar',
  conflicto:      'Los cambios generan conflicto de horario',
  exito:          'Bloques horarios actualizados correctamente',
};

function hhmm(t) {
  return t ? String(t).slice(0, 5) : '';
}

// Ids de horario_asignatura seleccionados: arreglo no vacío de enteros positivos
function normalizarIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const unicos = [...new Set(ids.map(Number))];
  if (unicos.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return unicos;
}

// Deja solo los campos que el actor eligió modificar (día, hora/bloque,
// asignatura, docente). Devuelve null si no hay ninguno o alguno es inválido.
function normalizarCambios(cambios) {
  if (!cambios || typeof cambios !== 'object') return null;
  const out = {};

  const dia = cambios.Horario_Asignatura_Dia_Semana;
  if (dia != null && dia !== '') {
    if (!DIAS_SEMANA.includes(dia)) return null;
    out.Horario_Asignatura_Dia_Semana = dia;
  }

  for (const campo of ['Bloque_Horario_Id', 'Asignatura_Id', 'Usuario_Id']) {
    const valor = cambios[campo];
    if (valor == null || valor === '') continue;
    const n = Number(valor);
    if (!Number.isInteger(n) || n <= 0) return null;
    out[campo] = n;
  }

  return Object.keys(out).length > 0 ? out : null;
}

// Analiza los cambios propuestos sobre los bloques seleccionados.
// `db` puede ser el pool (validación) o una conexión con transacción
// abierta (aplicación); con `bloquear` se usan SELECT ... FOR UPDATE
// para impedir que otra solicitud genere un conflicto entre la
// validación y el UPDATE (RNF17).
// Retorna { invalido: true } si algún bloque/campo no existe, o
// { conflictos: string[], resumen: [...] }.
async function analizarCambiosHorario(db, ids, cambios, { bloquear = false } = {}) {
  const forUpdate = bloquear ? ' FOR UPDATE' : '';

  const [seleccionados] = await db.query(
    `SELECT ha.Horario_Asignatura_Id,
            ha.Horario_Asignatura_Dia_Semana AS dia,
            ha.Horario_Asignatura_Estado     AS estado,
            ha.Curso_Id,
            c.Curso_Nombre                   AS curso,
            c.Curso_Periodo_Lectivo          AS periodo,
            ha.Bloque_Horario_Id,
            bh.Bloque_Horario_Hora_Inicio    AS hora_inicio,
            bh.Bloque_Horario_Hora_Fin       AS hora_fin,
            TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600 AS duracion,
            ha.Asignatura_Id,
            a.Asignatura_Nombre              AS asignatura,
            ha.Usuario_Id,
            u.Usuario_Nombre_Completo        AS docente
     FROM horario_asignatura ha
     JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
     JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
     JOIN asignatura     a  ON a.Asignatura_Id      = ha.Asignatura_Id
     LEFT JOIN usuario   u  ON u.Usuario_Id         = ha.Usuario_Id
     WHERE ha.Horario_Asignatura_Id IN (?) AND ${claseVigente('ha')}${forUpdate}`,
    [ids]
  );
  if (seleccionados.length !== ids.length) return { invalido: true };

  const cambiaDia    = 'Horario_Asignatura_Dia_Semana' in cambios;
  const cambiaBloque = 'Bloque_Horario_Id' in cambios;
  const cambiaAsig   = 'Asignatura_Id' in cambios;
  const cambiaDoc    = 'Usuario_Id' in cambios;
  const cambiaPosicion = cambiaDia || cambiaBloque;

  // ── Valores nuevos: deben existir ──────────────────────────────
  let nuevoBloque = null;
  if (cambiaBloque) {
    const [rows] = await db.query(
      `SELECT Bloque_Horario_Id, Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin, Bloque_Horario_Tipo,
              TIME_TO_SEC(TIMEDIFF(Bloque_Horario_Hora_Fin, Bloque_Horario_Hora_Inicio)) / 3600 AS duracion
       FROM bloque_horario WHERE Bloque_Horario_Id = ?`,
      [cambios.Bloque_Horario_Id]
    );
    if (rows.length === 0) return { invalido: true };
    nuevoBloque = rows[0];
  }

  let nuevaAsignatura = null;
  if (cambiaAsig) {
    const [rows] = await db.query(
      `SELECT Asignatura_Id, Asignatura_Nombre FROM asignatura WHERE Asignatura_Id = ?`,
      [cambios.Asignatura_Id]
    );
    if (rows.length === 0) return { invalido: true };
    nuevaAsignatura = rows[0];
  }

  let nuevoDocente = null;
  if (cambiaDoc) {
    const [rows] = await db.query(
      `SELECT Usuario_Id, Usuario_Nombre_Completo FROM usuario
       WHERE Usuario_Id = ? AND Es_Docente = 1 AND Usuario_Estado_Cuenta = 1`,
      [cambios.Usuario_Id]
    );
    if (rows.length === 0) return { invalido: true };
    nuevoDocente = rows[0];
  }

  // ── Estado propuesto de cada bloque seleccionado ───────────────
  const propuestas = seleccionados.map((r) => ({
    Horario_Asignatura_Id: r.Horario_Asignatura_Id,
    estado:            r.estado,
    Curso_Id:          r.Curso_Id,
    curso:             r.curso,
    periodo:           r.periodo,
    dia:               cambiaDia ? cambios.Horario_Asignatura_Dia_Semana : r.dia,
    Bloque_Horario_Id: cambiaBloque ? nuevoBloque.Bloque_Horario_Id : r.Bloque_Horario_Id,
    hora_inicio:       cambiaBloque ? nuevoBloque.Bloque_Horario_Hora_Inicio : r.hora_inicio,
    hora_fin:          cambiaBloque ? nuevoBloque.Bloque_Horario_Hora_Fin : r.hora_fin,
    duracion:          Number(cambiaBloque ? nuevoBloque.duracion : r.duracion),
    Asignatura_Id:     cambiaAsig ? nuevaAsignatura.Asignatura_Id : r.Asignatura_Id,
    asignatura:        cambiaAsig ? nuevaAsignatura.Asignatura_Nombre : r.asignatura,
    Usuario_Id:        cambiaDoc ? nuevoDocente.Usuario_Id : r.Usuario_Id,
    docente:           cambiaDoc ? nuevoDocente.Usuario_Nombre_Completo : r.docente,
  }));

  const conflictos = [];

  if (cambiaBloque && nuevoBloque.Bloque_Horario_Tipo === 'Recreo') {
    conflictos.push('No se pueden programar clases en bloques de recreo');
  }

  // ── Resto de la programación de los cursos y docentes involucrados ─
  const cursoIds   = [...new Set(propuestas.map((p) => p.Curso_Id))];
  const docenteIds = [...new Set(propuestas.map((p) => p.Usuario_Id).filter(Boolean))];

  const [otros] = await db.query(
    `SELECT ha.Horario_Asignatura_Id,
            ha.Horario_Asignatura_Dia_Semana AS dia,
            ha.Horario_Asignatura_Estado     AS estado,
            ha.Curso_Id,
            c.Curso_Nombre                   AS curso,
            c.Curso_Periodo_Lectivo          AS periodo,
            ha.Bloque_Horario_Id,
            ha.Asignatura_Id,
            ha.Usuario_Id,
            TIME_TO_SEC(TIMEDIFF(bh.Bloque_Horario_Hora_Fin, bh.Bloque_Horario_Hora_Inicio)) / 3600 AS duracion
     FROM horario_asignatura ha
     JOIN curso          c  ON c.Curso_Id          = ha.Curso_Id
     JOIN bloque_horario bh ON bh.Bloque_Horario_Id = ha.Bloque_Horario_Id
     WHERE (ha.Curso_Id IN (?) OR ha.Usuario_Id IN (?))
       AND ${claseVigente('ha')}
       AND ha.Horario_Asignatura_Id NOT IN (?)${forUpdate}`,
    [cursoIds, docenteIds.length > 0 ? docenteIds : [0], ids]
  );

  const etiqueta = (p) => `${p.dia} ${hhmm(p.hora_inicio)}–${hhmm(p.hora_fin)}`;

  // Superposición dentro del mismo curso (mismo día y bloque)
  if (cambiaPosicion) {
    const vistos = new Map();
    for (const p of propuestas) {
      const clave = `${p.Curso_Id}|${p.Bloque_Horario_Id}|${p.dia}`;
      if (otros.some((o) => o.Curso_Id === p.Curso_Id && o.Bloque_Horario_Id === p.Bloque_Horario_Id && o.dia === p.dia)) {
        conflictos.push(`${p.curso} ya tiene una clase programada el ${etiqueta(p)}`);
      } else if (vistos.has(clave)) {
        conflictos.push(`Dos bloques seleccionados de ${p.curso} quedarían el ${etiqueta(p)}`);
      }
      vistos.set(clave, true);
    }
  }

  // Disponibilidad del docente (no puede estar en dos cursos a la vez)
  if (cambiaPosicion || cambiaDoc) {
    const vistos = new Map();
    for (const p of propuestas) {
      if (!p.Usuario_Id) continue;
      const clave = `${p.Usuario_Id}|${p.Bloque_Horario_Id}|${p.dia}|${p.periodo}`;
      // Solo choca con clases del mismo período (durante el cierre conviven dos)
      const choque = otros.find(
        (o) => o.Usuario_Id === p.Usuario_Id && o.Bloque_Horario_Id === p.Bloque_Horario_Id && o.dia === p.dia
          && (o.periodo === undefined || o.periodo === p.periodo)
      );
      if (choque) {
        conflictos.push(`${p.docente} ya tiene clase en ${choque.curso} el ${etiqueta(p)}`);
      } else if (vistos.has(clave)) {
        conflictos.push(`${p.docente} quedaría con dos clases simultáneas el ${etiqueta(p)}`);
      }
      vistos.set(clave, true);
    }
  }

  // CU107: disponibilidad laboral semanal del docente. Solo se revisan los bloques
  // que cambian de posición o de docente; una clase que ya estaba fuera se mantiene.
  if ((cambiaPosicion || cambiaDoc) && docenteIds.length > 0) {
    const mapa = await mapaDisponibilidad(db, docenteIds, propuestas.map((p) => p.periodo));
    const avisados = new Set();
    for (const p of propuestas) {
      if (!p.Usuario_Id) continue;
      if (estaDisponible(mapa, {
        docenteId: p.Usuario_Id, periodo: p.periodo, dia: p.dia, horaInicio: p.hora_inicio, horaFin: p.hora_fin,
      })) continue;
      const clave = `${p.Usuario_Id}|${p.dia}|${p.Bloque_Horario_Id}`;
      if (avisados.has(clave)) continue;
      avisados.add(clave);
      conflictos.push(`${p.docente} no está disponible el ${etiqueta(p)} según su disponibilidad laboral de ${p.periodo}`);
    }
  }

  // Límite diario de bloques por curso (parámetro institucional)
  if (cambiaDia) {
    const [param] = await db.query(
      `SELECT Parametro_Institucional_Bloques_Maximos_Diarios FROM parametro_institucional LIMIT 1`
    );
    const maxDiarios = param[0]?.Parametro_Institucional_Bloques_Maximos_Diarios;
    if (maxDiarios != null) {
      for (const cursoId of cursoIds) {
        const dia = cambios.Horario_Asignatura_Dia_Semana;
        const total =
          otros.filter((o) => o.Curso_Id === cursoId && o.dia === dia && o.estado === 'Activo').length +
          propuestas.filter((p) => p.Curso_Id === cursoId && p.dia === dia && p.estado === 'Activo').length;
        if (total > maxDiarios) {
          const curso = propuestas.find((p) => p.Curso_Id === cursoId).curso;
          conflictos.push(`${curso} superaría el máximo de ${maxDiarios} bloque(s) diarios el ${dia}`);
        }
      }
    }
  }

  // Asignatura asociada al curso y horas semanales del plan educativo
  if (cambiaAsig || cambiaBloque) {
    const pares = new Map();
    for (const p of propuestas) pares.set(`${p.Curso_Id}|${p.Asignatura_Id}`, p);

    for (const p of pares.values()) {
      const [plan] = await db.query(
        `SELECT ia.Horas_Semanales_Requeridas
         FROM curso c
         JOIN tieneasig ta      ON ta.Curso_Id = c.Curso_Id AND ta.Asignatura_Id = ?
                               AND ta.Estado_Asignacion = 'Activa'
         JOIN plan_educativo pe ON pe.Nivel_Educativo_Id = c.Nivel_Educativo_Id
         JOIN incluyeasig ia    ON ia.Plan_Educativo_Id = pe.Plan_Educativo_Id
                               AND ia.Asignatura_Id = ta.Asignatura_Id
         WHERE c.Curso_Id = ?
         ORDER BY pe.Plan_Educativo_Periodo_Lectivo DESC LIMIT 1`,
        [p.Asignatura_Id, p.Curso_Id]
      );

      if (plan.length === 0) {
        if (cambiaAsig) {
          conflictos.push(`${p.asignatura} no está asociada a ${p.curso} o no pertenece a su plan educativo`);
        }
        continue;
      }

      const requeridas = Number(plan[0].Horas_Semanales_Requeridas);
      const mismaAsig = (r) => r.Curso_Id === p.Curso_Id && r.Asignatura_Id === p.Asignatura_Id && r.estado === 'Activo';
      const horasOtros  = otros.filter(mismaAsig).reduce((acc, r) => acc + Number(r.duracion), 0);
      const horasNuevas = horasOtros + propuestas.filter(mismaAsig).reduce((acc, r) => acc + r.duracion, 0);
      const horasActuales = horasOtros + seleccionados.filter(mismaAsig).reduce((acc, r) => acc + Number(r.duracion), 0);
      if (horasNuevas > requeridas && horasNuevas > horasActuales) {
        conflictos.push(
          `${p.asignatura} en ${p.curso} excedería sus ${requeridas}h semanales del plan educativo ` +
          `(quedaría con ${horasNuevas.toFixed(1)}h)`
        );
      }
    }
  }

  // Carga horaria semanal de los docentes involucrados
  if ((cambiaDoc || cambiaBloque) && docenteIds.length > 0) {
    const [docentes] = await db.query(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Carga_Horaria_Maxima
       FROM usuario WHERE Usuario_Id IN (?)`,
      [docenteIds]
    );
    for (const d of docentes) {
      if (d.Docente_Carga_Horaria_Maxima == null) continue;
      const max = Number(d.Docente_Carga_Horaria_Maxima);
      const delDocente = (r) => r.Usuario_Id === d.Usuario_Id && r.estado === 'Activo';
      const cargaOtros   = otros.filter(delDocente).reduce((acc, r) => acc + Number(r.duracion), 0);
      const cargaNueva   = cargaOtros + propuestas.filter(delDocente).reduce((acc, r) => acc + r.duracion, 0);
      const cargaActual  = cargaOtros + seleccionados.filter(delDocente).reduce((acc, r) => acc + Number(r.duracion), 0);
      if (cargaNueva > max && cargaNueva > cargaActual) {
        conflictos.push(
          `${d.Usuario_Nombre_Completo} excedería su carga horaria semanal de ${max}h semanales ` +
          `(quedaría con ${cargaNueva.toFixed(1)}h)`
        );
      }
    }
  }

  const resumen = seleccionados.map((r, i) => {
    const p = propuestas[i];
    return {
      Horario_Asignatura_Id: r.Horario_Asignatura_Id,
      curso: r.curso,
      antes: {
        dia: r.dia, hora_inicio: r.hora_inicio, hora_fin: r.hora_fin,
        asignatura: r.asignatura, docente: r.docente || null,
      },
      despues: {
        dia: p.dia, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin,
        asignatura: p.asignatura, docente: p.docente || null,
      },
    };
  });

  return { invalido: false, conflictos, resumen };
}

// Columnas de horario_asignatura que la edición masiva puede modificar
const COLUMNAS_EDITABLES = ['Horario_Asignatura_Dia_Semana', 'Bloque_Horario_Id', 'Asignatura_Id', 'Usuario_Id'];

// Paso "validar": responde 400 (Excepción 1), 409 (Excepción 2) o el resumen
async function responderValidacion(res, ids, cambios, mensajes) {
  if (!ids || !cambios) return res.status(400).json({ error: mensajes.datosInvalidos });

  const analisis = await analizarCambiosHorario(pool, ids, cambios);
  if (analisis.invalido) return res.status(400).json({ error: mensajes.datosInvalidos });
  if (analisis.conflictos.length > 0) {
    return res.status(409).json({ error: mensajes.conflicto, conflictos: analisis.conflictos });
  }
  return res.json({ mensaje: 'Sin conflictos', resumen: analisis.resumen });
}

// Paso "confirmar": revalida dentro de una transacción con bloqueo de filas y aplica el UPDATE
async function aplicarCambios(res, ids, cambios, mensajes) {
  if (!ids || !cambios) return res.status(400).json({ error: mensajes.datosInvalidos });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const analisis = await analizarCambiosHorario(conn, ids, cambios, { bloquear: true });
    if (analisis.invalido) {
      await conn.rollback();
      return res.status(400).json({ error: mensajes.datosInvalidos });
    }
    if (analisis.conflictos.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: mensajes.conflicto, conflictos: analisis.conflictos });
    }

    const columnas = COLUMNAS_EDITABLES.filter((c) => c in cambios);
    await conn.query(
      `UPDATE horario_asignatura SET ${columnas.map((c) => `${c} = ?`).join(', ')}
       WHERE Horario_Asignatura_Id IN (?)`,
      [...columnas.map((c) => cambios[c]), ids]
    );

    await conn.commit();
    return res.json({ mensaje: mensajes.exito, actualizados: ids.length });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ── GET /api/horarios/opciones-edicion — CU64: datos del formulario de edición múltiple ──
const getOpcionesEdicion = async (req, res) => {
  try {
    const [bloques] = await pool.execute(
      `SELECT Bloque_Horario_Id, Bloque_Horario_Hora_Inicio, Bloque_Horario_Hora_Fin,
              Bloque_Horario_Jornada, Bloque_Horario_Tipo
       FROM bloque_horario
       ORDER BY Bloque_Horario_Hora_Inicio`
    );
    const [asignaturas] = await pool.execute(
      `SELECT Asignatura_Id, Asignatura_Nombre FROM asignatura ORDER BY Asignatura_Nombre`
    );
    const [docentes] = await pool.execute(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Docente_Especialidad
       FROM usuario
       WHERE Es_Docente = 1 AND Usuario_Estado_Cuenta = 1
       ORDER BY Usuario_Nombre_Completo`
    );
    res.json({ bloques, asignaturas, docentes });
  } catch (error) {
    console.error('Error en getOpcionesEdicion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/horarios/reasignar-docente/validar — CU63 validarReasignacion(Horario_Ids[], Usuario_Id) ──
const validarReasignacion = async (req, res) => {
  try {
    const ids = normalizarIds(req.body?.horario_ids);
    const cambios = normalizarCambios({ Usuario_Id: req.body?.Usuario_Id });
    await responderValidacion(res, ids, cambios, MENSAJES_CU63);
  } catch (error) {
    console.error('Error en validarReasignacion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/horarios/reasignar-docente — CU63 reasignarDocente(Horario_Ids[], Usuario_Id) ──
const reasignarDocente = async (req, res) => {
  try {
    const ids = normalizarIds(req.body?.horario_ids);
    const cambios = normalizarCambios({ Usuario_Id: req.body?.Usuario_Id });
    await aplicarCambios(res, ids, cambios, MENSAJES_CU63);
  } catch (error) {
    console.error('Error en reasignarDocente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/horarios/multiples/validar — CU64 validarCambiosMultiples(Horario_Ids[], cambios) ──
const validarCambiosMultiples = async (req, res) => {
  try {
    const ids = normalizarIds(req.body?.horario_ids);
    const cambios = normalizarCambios(req.body?.cambios);
    await responderValidacion(res, ids, cambios, MENSAJES_CU64);
  } catch (error) {
    console.error('Error en validarCambiosMultiples:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/horarios/multiples — CU64 modificarMultiplesBloques(Horario_Ids[], cambios) ──
const modificarMultiplesBloques = async (req, res) => {
  try {
    const ids = normalizarIds(req.body?.horario_ids);
    const cambios = normalizarCambios(req.body?.cambios);
    await aplicarCambios(res, ids, cambios, MENSAJES_CU64);
  } catch (error) {
    console.error('Error en modificarMultiplesBloques:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ══════════════════════════════════════════════════════════════════
// CU65 / CU66 — Suspensión de bloques por evento institucional
// ══════════════════════════════════════════════════════════════════
//
// La suspensión se registra en la tabla `afecta`, que vincula cada
// bloque horario con el evento institucional que lo suspende en la
// fecha de ese evento (bloque_horario no tiene columna de estado).
//
//   CU65 → el administrador elige bloques concretos y un evento
//          existente o nuevo. El evento queda con impacto
//          "Suspensión parcial" para que CU71 conserve la selección.
//   CU66 → el administrador define fecha y jornada; se crea el evento
//          y se suspenden todos los bloques 'Clase' de esa jornada.

const { registrarBloquesAfectados } = require('./bloquesController');

const MSG_CU65 = {
  incompletos: 'Seleccione bloques y un evento institucional',
  restriccion: 'Los bloques no existen o no pueden ser suspendidos',
  exito: 'Bloques suspendidos por evento institucional',
};
const MSG_CU66 = {
  incompletos: 'Complete la jornada y el evento institucional',
  restriccion: 'La jornada no existe o tiene restricciones críticas activas',
  exito: 'Jornada suspendida correctamente',
};

const IMPACTO_POR_JORNADA = {
  'Mañana': 'Suspensión jornada mañana',
  'Tarde': 'Salida anticipada',
  'Completa': 'Suspensión total',
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function eventoNuevoValido(ev) {
  return ev && typeof ev === 'object' &&
    String(ev.nombre || '').trim() && String(ev.descripcion || '').trim() &&
    FECHA_RE.test(String(ev.fecha || ''));
}

// POST /api/horarios/suspender-bloques — CU65
// body: { bloques_id: number[], evento_id?: number,
//         evento?: { nombre, fecha: 'YYYY-MM-DD', descripcion } }
const suspenderBloques = async (req, res) => {
  const { bloques_id, evento_id, evento } = req.body || {};
  const ids = Array.isArray(bloques_id)
    ? [...new Set(bloques_id.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  // Excepción 1: no se seleccionan bloques o no se especifica el evento
  if (ids.length === 0 || (!evento_id && !eventoNuevoValido(evento))) {
    return res.status(400).json({ error: MSG_CU65.incompletos });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Validación de bloques: deben existir y ser de tipo 'Clase'
    const marcas = ids.map(() => '?').join(', ');
    const [bloques] = await conn.execute(
      `SELECT Bloque_Horario_Id FROM bloque_horario
        WHERE Bloque_Horario_Id IN (${marcas}) AND Bloque_Horario_Tipo = 'Clase'`,
      ids
    );
    if (bloques.length !== ids.length) {
      await conn.rollback();
      return res.status(409).json({ error: MSG_CU65.restriccion, detalle: 'Hay bloques inexistentes o que no son de clase' });
    }

    // Evento: existente o nuevo
    let eventoId = evento_id ? Number(evento_id) : null;
    if (eventoId) {
      const [ev] = await conn.execute(
        `SELECT Evento_Institucional_Id FROM evento_institucional WHERE Evento_Institucional_Id = ?`,
        [eventoId]
      );
      if (ev.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: MSG_CU65.incompletos, detalle: 'El evento seleccionado no existe' });
      }
    } else {
      // Mismo criterio que CU70: un solo evento institucional por fecha
      const [mismaFecha] = await conn.execute(
        `SELECT Evento_Institucional_Id FROM evento_institucional WHERE Evento_Institucional_Fecha = ?`,
        [evento.fecha]
      );
      if (mismaFecha.length > 0) {
        await conn.rollback();
        return res.status(409).json({ error: MSG_CU65.restriccion, detalle: 'Ya existe un evento institucional en esa fecha; selecciónelo en lugar de crear uno nuevo' });
      }
      const [ins] = await conn.execute(
        `INSERT INTO evento_institucional
           (Evento_Institucional_Nombre, Evento_Institucional_Fecha,
            Evento_Institucional_Descripcion, Evento_Institucional_Impacto_Clases)
         VALUES (?, ?, ?, 'Suspensión parcial')`,
        [evento.nombre.trim(), evento.fecha, evento.descripcion.trim()]
      );
      eventoId = ins.insertId;
    }

    // Excepción 2: bloques con una suspensión vigente en la fecha del evento
    const [vigentes] = await conn.execute(
      `SELECT DISTINCT af.Bloque_Horario_Id
         FROM afecta af
         JOIN evento_institucional ei ON ei.Evento_Institucional_Id = af.Evento_Institucional_Id
        WHERE ei.Evento_Institucional_Fecha = (
                SELECT Evento_Institucional_Fecha FROM evento_institucional WHERE Evento_Institucional_Id = ?
              )
          AND af.Bloque_Horario_Id IN (${marcas})`,
      [eventoId, ...ids]
    );
    if (vigentes.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        error: MSG_CU65.restriccion,
        detalle: 'Algunos bloques ya tienen una suspensión vigente en la fecha del evento',
        bloques: vigentes.map((v) => v.Bloque_Horario_Id),
      });
    }

    const valores = ids.map(() => '(?, ?, ?)').join(', ');
    const params = [];
    ids.forEach((id) => params.push('Suspendido', id, eventoId));
    await conn.execute(
      `INSERT INTO afecta (Estado_Bloque, Bloque_Horario_Id, Evento_Institucional_Id) VALUES ${valores}`,
      params
    );

    // La selección pasa a ser manual: CU71 no debe recalcularla
    await conn.execute(
      `UPDATE evento_institucional SET Evento_Institucional_Impacto_Clases = 'Suspensión parcial'
        WHERE Evento_Institucional_Id = ?`,
      [eventoId]
    );

    await conn.commit();
    return res.status(201).json({ mensaje: MSG_CU65.exito, evento_id: eventoId, bloques_suspendidos: ids });
  } catch (err) {
    await conn.rollback();
    console.error('suspenderBloques:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};

// POST /api/horarios/suspender-jornada — CU66
// body: { fecha: 'YYYY-MM-DD', jornada: 'Mañana' | 'Tarde' | 'Completa', nombre, descripcion }
const suspenderJornadaCompleta = async (req, res) => {
  const { fecha, jornada, nombre, descripcion } = req.body || {};
  const impacto = IMPACTO_POR_JORNADA[jornada];

  // Excepción 1: falta la jornada o los datos del evento
  if (!impacto || !FECHA_RE.test(String(fecha || '')) ||
      !String(nombre || '').trim() || !String(descripcion || '').trim()) {
    return res.status(400).json({ error: MSG_CU66.incompletos });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Excepción 2a: la jornada no tiene bloques de clase configurados
    let qBloques = `SELECT Bloque_Horario_Id FROM bloque_horario WHERE Bloque_Horario_Tipo = 'Clase'`;
    const pBloques = [];
    if (jornada !== 'Completa') {
      qBloques += ' AND Bloque_Horario_Jornada = ?';
      pBloques.push(jornada);
    }
    const [bloques] = await conn.execute(qBloques, pBloques);
    if (bloques.length === 0) {
      await conn.rollback();
      return res.status(409).json({ error: MSG_CU66.restriccion, detalle: 'La jornada no tiene bloques de clase configurados' });
    }

    // Excepción 2b: restricción crítica, ya existe un evento en esa fecha
    const [mismaFecha] = await conn.execute(
      `SELECT Evento_Institucional_Id FROM evento_institucional WHERE Evento_Institucional_Fecha = ?`,
      [fecha]
    );
    if (mismaFecha.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: MSG_CU66.restriccion, detalle: 'Ya existe un evento institucional registrado en esa fecha' });
    }

    const [ins] = await conn.execute(
      `INSERT INTO evento_institucional
         (Evento_Institucional_Nombre, Evento_Institucional_Fecha,
          Evento_Institucional_Descripcion, Evento_Institucional_Impacto_Clases)
       VALUES (?, ?, ?, ?)`,
      [String(nombre).trim(), fecha, String(descripcion).trim(), impacto]
    );
    const eventoId = ins.insertId;
    const suspendidos = await registrarBloquesAfectados(conn, eventoId, impacto);

    await conn.commit();
    return res.status(201).json({ mensaje: MSG_CU66.exito, evento_id: eventoId, impacto, bloques_suspendidos: suspendidos });
  } catch (err) {
    await conn.rollback();
    console.error('suspenderJornadaCompleta:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};


module.exports = {
  getHorarios, getCursos, getBloques, getAsignaturas, getAsignaturasCurso,
  getDocentes, getDocentesDisponibles,
  createHorario, updateHorario, cambiarEstado, getResumenCursos,
  eliminarHorario, restaurarHorario,
  getAsignacionesDocente, // CU42
  getHorarioDocente, // CU43 / CU58
  getHorarioEstudiante,
  getHorarioMaestro, // CU57
  filtrarHorarios,
  getBloquesLibres,
  getDetalleBloqueHorario,
  getOpcionesEdicion, // CU64
  validarReasignacion, reasignarDocente, // CU63
  validarCambiosMultiples, modificarMultiplesBloques, // CU64
  suspenderBloques, // CU65
  suspenderJornadaCompleta, // CU66
};