const pool = require('../config/db');

const MSG_ELECTIVA_EN_PLAN = (nombre) =>
  `${nombre} es una asignatura electiva: solo puede incluirse en el plan de electivos de 3° y 4° medio`;
const { claseVigente } = require('../utils/clasesEliminadas');
const { normalizarColor, colorAleatorioAsignatura, MENSAJE_COLOR_INVALIDO } = require('../utils/colores');

// ── GET /api/planes  ─────────────────────────────────────────────
const getPlanes = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        pe.Plan_Educativo_Id,
        pe.Plan_Educativo_Periodo_Lectivo,
        pe.Nivel_Educativo_Id,
        ne.Nivel_Educativo_Nombre,
        COUNT(ia.IncluyeAsig_Id) AS total_asignaturas,
        SUM(CASE WHEN ia.Tipo = 'Obligatorio'    THEN 1 ELSE 0 END) AS total_obligatorias,
        SUM(CASE WHEN ia.Tipo = 'Complementario' THEN 1 ELSE 0 END) AS total_complementarias,
        COALESCE(SUM(ia.Horas_Semanales_Requeridas), 0)             AS total_horas_semanales
      FROM plan_educativo pe
      JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = pe.Nivel_Educativo_Id
      LEFT JOIN incluyeasig ia ON ia.Plan_Educativo_Id = pe.Plan_Educativo_Id
      GROUP BY pe.Plan_Educativo_Id, pe.Plan_Educativo_Periodo_Lectivo,
               pe.Nivel_Educativo_Id, ne.Nivel_Educativo_Nombre
      ORDER BY pe.Plan_Educativo_Periodo_Lectivo DESC, ne.Nivel_Educativo_Nombre
    `);
    res.json(rows);
  } catch (err) {
    console.error('getPlanes:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/planes/:id  ─────────────────────────────────────────
const getPlanById = async (req, res) => {
  const { id } = req.params;
  try {
    const [planes] = await pool.execute(`
      SELECT pe.Plan_Educativo_Id, pe.Plan_Educativo_Periodo_Lectivo,
             pe.Nivel_Educativo_Id, ne.Nivel_Educativo_Nombre
      FROM plan_educativo pe
      JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = pe.Nivel_Educativo_Id
      WHERE pe.Plan_Educativo_Id = ?
    `, [id]);

    if (planes.length === 0) {
      return res.status(404).json({ error: 'Plan educativo no encontrado' });
    }

    const [asignaturas] = await pool.execute(`
      SELECT ia.IncluyeAsig_Id, ia.Horas_Semanales_Requeridas, ia.Tipo,
             a.Asignatura_Id, a.Asignatura_Nombre, a.Asignatura_Prioridad_Academica
      FROM incluyeasig ia
      JOIN asignatura a ON a.Asignatura_Id = ia.Asignatura_Id
      WHERE ia.Plan_Educativo_Id = ?
      ORDER BY ia.Tipo, a.Asignatura_Nombre
    `, [id]);

    res.json({ ...planes[0], asignaturas });
  } catch (err) {
    console.error('getPlanById:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/planes  ── CU46
const crearPlan = async (req, res) => {
  const { nivel_educativo_id, periodo_lectivo, asignaturas } = req.body;

  if (!nivel_educativo_id || !periodo_lectivo) {
    return res.status(400).json({ error: 'El nivel educativo y el periodo lectivo son obligatorios' });
  }
  if (!Array.isArray(asignaturas) || asignaturas.length === 0) {
    return res.status(400).json({ error: 'El plan debe incluir al menos una asignatura' });
  }

  const periodo = periodo_lectivo.toString().trim();

  for (const a of asignaturas) {
    if (!a.asignatura_id || !a.tipo || !a.horas_semanales) {
      return res.status(400).json({ error: 'Cada asignatura requiere asignatura_id, tipo y horas_semanales' });
    }
    const horas = Number(a.horas_semanales);
    if (!Number.isInteger(horas) || horas < 1) {
      return res.status(400).json({ error: 'Las horas semanales deben ser un número entero mayor a 0' });
    }
    if (!['Obligatorio', 'Complementario'].includes(a.tipo)) {
      return res.status(400).json({ error: 'El tipo debe ser "Obligatorio" o "Complementario"' });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [niveles] = await conn.execute(
      'SELECT Nivel_Educativo_Nombre FROM nivel_educativo WHERE Nivel_Educativo_Id = ?',
      [nivel_educativo_id]
    );
    if (niveles.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Nivel educativo no encontrado' });
    }

    const [planExistente] = await conn.execute(`
      SELECT pe.Plan_Educativo_Id,
             COUNT(ia.IncluyeAsig_Id) AS total_asig
      FROM plan_educativo pe
      LEFT JOIN incluyeasig ia ON ia.Plan_Educativo_Id = pe.Plan_Educativo_Id
      WHERE pe.Nivel_Educativo_Id = ? AND pe.Plan_Educativo_Periodo_Lectivo = ?
      GROUP BY pe.Plan_Educativo_Id
    `, [nivel_educativo_id, periodo]);

    if (planExistente.length > 0) {
      if (Number(planExistente[0].total_asig) > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: `Ya existe un plan educativo para ${niveles[0].Nivel_Educativo_Nombre} en el periodo ${periodo}`
        });
      }
      await conn.execute(
        'DELETE FROM plan_educativo WHERE Plan_Educativo_Id = ?',
        [planExistente[0].Plan_Educativo_Id]
      );
    }

    const idsAsig = asignaturas.map(a => a.asignatura_id);
    const placeholders = idsAsig.map(() => '?').join(',');
    const [asigExistentes] = await conn.execute(
      `SELECT Asignatura_Id, Asignatura_Nombre, Asignatura_Es_Electiva FROM asignatura WHERE Asignatura_Id IN (${placeholders})`,
      idsAsig
    );
    if (asigExistentes.length !== idsAsig.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Una o más asignaturas seleccionadas no existen en el sistema' });
    }
    // RF27: una asignatura electiva solo va en el plan de electivos de 3° y 4° medio
    const electiva = asigExistentes.find(a => Number(a.Asignatura_Es_Electiva) === 1);
    if (electiva) {
      await conn.rollback();
      return res.status(422).json({ error: MSG_ELECTIVA_EN_PLAN(electiva.Asignatura_Nombre) });
    }

    const idSet = new Set(idsAsig);
    if (idSet.size !== idsAsig.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'No puede incluir la misma asignatura más de una vez en el plan' });
    }

    const [resultPlan] = await conn.execute(
      'INSERT INTO plan_educativo (Plan_Educativo_Periodo_Lectivo, Nivel_Educativo_Id) VALUES (?, ?)',
      [periodo, nivel_educativo_id]
    );
    const planId = resultPlan.insertId;

    for (const a of asignaturas) {
      await conn.execute(
        'INSERT INTO incluyeasig (Horas_Semanales_Requeridas, Tipo, Asignatura_Id, Plan_Educativo_Id) VALUES (?, ?, ?, ?)',
        [Number(a.horas_semanales), a.tipo, a.asignatura_id, planId]
      );
    }

    await conn.commit();
    res.status(201).json({
      mensaje: `Plan educativo para ${niveles[0].Nivel_Educativo_Nombre} – ${periodo} creado correctamente`,
      plan_id: planId
    });
  } catch (err) {
    await conn.rollback();
    console.error('crearPlan:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};

// ── POST /api/planes/clonar  ── CU47
const clonarPlan = async (req, res) => {
  const { plan_origen_id, nuevo_periodo_lectivo, nivel_educativo_id, asignaturas } = req.body;

  if (!plan_origen_id || !nuevo_periodo_lectivo || !nivel_educativo_id) {
    return res.status(400).json({ error: 'plan_origen_id, nuevo_periodo_lectivo y nivel_educativo_id son obligatorios' });
  }

  const periodo = nuevo_periodo_lectivo.toString().trim();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [planOrigen] = await conn.execute(`
      SELECT pe.Plan_Educativo_Id, pe.Plan_Educativo_Periodo_Lectivo,
             ne.Nivel_Educativo_Nombre
      FROM plan_educativo pe
      JOIN nivel_educativo ne ON ne.Nivel_Educativo_Id = pe.Nivel_Educativo_Id
      WHERE pe.Plan_Educativo_Id = ?
    `, [plan_origen_id]);

    if (planOrigen.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'El plan origen seleccionado no existe' });
    }

    const [nivelDestino] = await conn.execute(
      'SELECT Nivel_Educativo_Nombre FROM nivel_educativo WHERE Nivel_Educativo_Id = ?',
      [nivel_educativo_id]
    );
    if (nivelDestino.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Nivel educativo de destino no encontrado' });
    }

    const [planExistente] = await conn.execute(`
      SELECT pe.Plan_Educativo_Id,
             COUNT(ia.IncluyeAsig_Id) AS total_asig
      FROM plan_educativo pe
      LEFT JOIN incluyeasig ia ON ia.Plan_Educativo_Id = pe.Plan_Educativo_Id
      WHERE pe.Nivel_Educativo_Id = ? AND pe.Plan_Educativo_Periodo_Lectivo = ?
      GROUP BY pe.Plan_Educativo_Id
    `, [nivel_educativo_id, periodo]);

    if (planExistente.length > 0) {
      if (Number(planExistente[0].total_asig) > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: `Ya existe un plan educativo para ${nivelDestino[0].Nivel_Educativo_Nombre} en el periodo ${periodo}`
        });
      }
      await conn.execute(
        'DELETE FROM plan_educativo WHERE Plan_Educativo_Id = ?',
        [planExistente[0].Plan_Educativo_Id]
      );
    }

    let asignaturasFinales = asignaturas;
    if (!Array.isArray(asignaturasFinales) || asignaturasFinales.length === 0) {
      // RF27: las asignaturas que hoy son electivas no se copian a un plan regular
      const [asigOrigen] = await conn.execute(
        `SELECT ia.Asignatura_Id, ia.Tipo, ia.Horas_Semanales_Requeridas
           FROM incluyeasig ia JOIN asignatura a ON a.Asignatura_Id = ia.Asignatura_Id
          WHERE ia.Plan_Educativo_Id = ? AND a.Asignatura_Es_Electiva = 0`,
        [plan_origen_id]
      );
      asignaturasFinales = asigOrigen.map(a => ({
        asignatura_id   : a.Asignatura_Id,
        tipo            : a.Tipo,
        horas_semanales : a.Horas_Semanales_Requeridas,
      }));
    }

    if (asignaturasFinales.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'El plan clonado debe contener al menos una asignatura' });
    }

    for (const a of asignaturasFinales) {
      const horas = Number(a.horas_semanales);
      if (!a.asignatura_id || !a.tipo || !a.horas_semanales) {
        await conn.rollback();
        return res.status(400).json({ error: 'Cada asignatura requiere asignatura_id, tipo y horas_semanales' });
      }
      if (!Number.isInteger(horas) || horas < 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'Las horas semanales deben ser un número entero mayor a 0' });
      }
      if (!['Obligatorio', 'Complementario'].includes(a.tipo)) {
        await conn.rollback();
        return res.status(400).json({ error: 'El tipo debe ser "Obligatorio" o "Complementario"' });
      }
    }

    if (Array.isArray(asignaturas) && asignaturas.length > 0) {
      const [electivas] = await conn.query(
        'SELECT Asignatura_Nombre FROM asignatura WHERE Asignatura_Id IN (?) AND Asignatura_Es_Electiva = 1',
        [asignaturasFinales.map(a => a.asignatura_id)]
      );
      if (electivas.length > 0) {
        await conn.rollback();
        return res.status(422).json({ error: MSG_ELECTIVA_EN_PLAN(electivas[0].Asignatura_Nombre) });
      }
    }

    const [resultPlan] = await conn.execute(
      'INSERT INTO plan_educativo (Plan_Educativo_Periodo_Lectivo, Nivel_Educativo_Id) VALUES (?, ?)',
      [periodo, nivel_educativo_id]
    );
    const nuevoPlanId = resultPlan.insertId;

    for (const a of asignaturasFinales) {
      await conn.execute(
        'INSERT INTO incluyeasig (Horas_Semanales_Requeridas, Tipo, Asignatura_Id, Plan_Educativo_Id) VALUES (?, ?, ?, ?)',
        [Number(a.horas_semanales), a.tipo, a.asignatura_id, nuevoPlanId]
      );
    }

    // ── Excepción 3: Verificar docentes habilitados en el horario del plan origen ──
    const [docentesInhabilitados] = await conn.execute(
      `SELECT DISTINCT u.Usuario_Nombre_Completo AS docente, a.Asignatura_Nombre AS asignatura
       FROM horario_asignatura ha
       JOIN usuario    u  ON u.Usuario_Id    = ha.Usuario_Id
       JOIN asignatura a  ON a.Asignatura_Id = ha.Asignatura_Id
       JOIN curso      c  ON c.Curso_Id      = ha.Curso_Id
       JOIN incluyeasig ia ON ia.Asignatura_Id = ha.Asignatura_Id AND ia.Plan_Educativo_Id = ?
       WHERE (u.Es_Docente = 0 OR u.Usuario_Estado_Cuenta = 0) AND ${claseVigente('ha')}`,
      [plan_origen_id]
    );

    await conn.commit();

    const respuesta = {
      mensaje: `Plan educativo clonado correctamente para ${nivelDestino[0].Nivel_Educativo_Nombre} – ${periodo}`,
      plan_id: nuevoPlanId,
      origen : planOrigen[0].Plan_Educativo_Periodo_Lectivo,
    };

    if (docentesInhabilitados.length > 0) {
      respuesta.advertencias = docentesInhabilitados.map(d =>
        `El docente "${d.docente}" no está habilitado para la asignatura "${d.asignatura}" del período de origen`
      );
    }

    res.status(201).json(respuesta);
  } catch (err) {
    await conn.rollback();
    console.error('clonarPlan:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};

// ── PUT /api/planes/:id  ── editar un plan existente
// Permite cambiar nivel, periodo y asignaturas (tipo y horas). Las asignaturas
// que se mantienen conservan su registro en incluyeasig; las quitadas se borran.
const editarPlan = async (req, res) => {
  const { id } = req.params;
  const { nivel_educativo_id, periodo_lectivo, asignaturas } = req.body;

  if (!nivel_educativo_id || !periodo_lectivo?.toString().trim()) {
    return res.status(400).json({ error: 'El nivel educativo y el periodo lectivo son obligatorios' });
  }
  if (!Array.isArray(asignaturas) || asignaturas.length === 0) {
    return res.status(400).json({ error: 'El plan debe incluir al menos una asignatura' });
  }
  for (const a of asignaturas) {
    if (!a.asignatura_id || !a.tipo || !a.horas_semanales) {
      return res.status(400).json({ error: 'Cada asignatura requiere asignatura_id, tipo y horas_semanales' });
    }
    const horas = Number(a.horas_semanales);
    if (!Number.isInteger(horas) || horas < 1) {
      return res.status(400).json({ error: 'Las horas semanales deben ser un número entero mayor a 0' });
    }
    if (!['Obligatorio', 'Complementario'].includes(a.tipo)) {
      return res.status(400).json({ error: 'El tipo debe ser "Obligatorio" o "Complementario"' });
    }
  }
  const idsAsig = asignaturas.map(a => Number(a.asignatura_id));
  if (new Set(idsAsig).size !== idsAsig.length) {
    return res.status(400).json({ error: 'No puede incluir la misma asignatura más de una vez en el plan' });
  }

  const periodo = periodo_lectivo.toString().trim();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[plan]] = await conn.execute(
      'SELECT Plan_Educativo_Id FROM plan_educativo WHERE Plan_Educativo_Id = ? FOR UPDATE',
      [id]
    );
    if (!plan) {
      await conn.rollback();
      return res.status(404).json({ error: 'Plan educativo no encontrado' });
    }

    const [[nivel]] = await conn.execute(
      'SELECT Nivel_Educativo_Nombre FROM nivel_educativo WHERE Nivel_Educativo_Id = ?',
      [nivel_educativo_id]
    );
    if (!nivel) {
      await conn.rollback();
      return res.status(404).json({ error: 'Nivel educativo no encontrado' });
    }

    // Otro plan con asignaturas para el mismo nivel y periodo
    const [duplicado] = await conn.execute(`
      SELECT pe.Plan_Educativo_Id
      FROM plan_educativo pe
      WHERE pe.Nivel_Educativo_Id = ? AND pe.Plan_Educativo_Periodo_Lectivo = ?
        AND pe.Plan_Educativo_Id <> ?
        AND EXISTS (SELECT 1 FROM incluyeasig ia WHERE ia.Plan_Educativo_Id = pe.Plan_Educativo_Id)
    `, [nivel_educativo_id, periodo, id]);
    if (duplicado.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        error: `Ya existe un plan educativo para ${nivel.Nivel_Educativo_Nombre} en el periodo ${periodo}`
      });
    }

    const placeholders = idsAsig.map(() => '?').join(',');
    const [asigExistentes] = await conn.execute(
      `SELECT Asignatura_Id, Asignatura_Nombre, Asignatura_Es_Electiva FROM asignatura WHERE Asignatura_Id IN (${placeholders})`,
      idsAsig
    );
    if (asigExistentes.length !== idsAsig.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Una o más asignaturas seleccionadas no existen en el sistema' });
    }
    // RF27: una asignatura electiva solo va en el plan de electivos de 3° y 4° medio
    const electiva = asigExistentes.find(a => Number(a.Asignatura_Es_Electiva) === 1);
    if (electiva) {
      await conn.rollback();
      return res.status(422).json({ error: MSG_ELECTIVA_EN_PLAN(electiva.Asignatura_Nombre) });
    }

    await conn.execute(
      'UPDATE plan_educativo SET Plan_Educativo_Periodo_Lectivo = ?, Nivel_Educativo_Id = ? WHERE Plan_Educativo_Id = ?',
      [periodo, nivel_educativo_id, id]
    );

    const [actuales] = await conn.execute(
      `SELECT ia.IncluyeAsig_Id, ia.Asignatura_Id, a.Asignatura_Nombre
       FROM incluyeasig ia
       JOIN asignatura a ON a.Asignatura_Id = ia.Asignatura_Id
       WHERE ia.Plan_Educativo_Id = ?`,
      [id]
    );
    const actualPorAsig = new Map(actuales.map(r => [Number(r.Asignatura_Id), r]));

    for (const a of asignaturas) {
      const existente = actualPorAsig.get(Number(a.asignatura_id));
      if (existente) {
        await conn.execute(
          'UPDATE incluyeasig SET Horas_Semanales_Requeridas = ?, Tipo = ? WHERE IncluyeAsig_Id = ?',
          [Number(a.horas_semanales), a.tipo, existente.IncluyeAsig_Id]
        );
      } else {
        await conn.execute(
          'INSERT INTO incluyeasig (Horas_Semanales_Requeridas, Tipo, Asignatura_Id, Plan_Educativo_Id) VALUES (?, ?, ?, ?)',
          [Number(a.horas_semanales), a.tipo, a.asignatura_id, id]
        );
      }
    }

    const quitadas = actuales.filter(r => !idsAsig.includes(Number(r.Asignatura_Id)));
    if (quitadas.length > 0) {
      await conn.execute(
        `DELETE FROM incluyeasig WHERE IncluyeAsig_Id IN (${quitadas.map(() => '?').join(',')})`,
        quitadas.map(r => r.IncluyeAsig_Id)
      );
    }

    // Asignaturas quitadas que aún tienen clases programadas en cursos del nivel
    let advertencias = [];
    if (quitadas.length > 0) {
      const [conClases] = await conn.execute(
        `SELECT DISTINCT a.Asignatura_Nombre
         FROM horario_asignatura ha
         JOIN curso      c ON c.Curso_Id      = ha.Curso_Id
         JOIN asignatura a ON a.Asignatura_Id = ha.Asignatura_Id
         WHERE c.Nivel_Educativo_Id = ? AND ${claseVigente('ha')}
           AND ha.Asignatura_Id IN (${quitadas.map(() => '?').join(',')})
         ORDER BY a.Asignatura_Nombre`,
        [nivel_educativo_id, ...quitadas.map(r => r.Asignatura_Id)]
      );
      advertencias = conClases.map(r =>
        `"${r.Asignatura_Nombre}" ya no está en el plan, pero aún tiene clases programadas en el horario`
      );
    }

    await conn.commit();
    res.json({
      mensaje: `Plan educativo de ${nivel.Nivel_Educativo_Nombre} – ${periodo} actualizado correctamente`,
      ...(advertencias.length > 0 && { advertencias }),
    });
  } catch (err) {
    await conn.rollback();
    console.error('editarPlan:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    conn.release();
  }
};

// ── GET /api/planes/niveles-sin-plan  ────────────────────────────
const getNivelesSinPlan = async (req, res) => {
  const { periodo } = req.query;
  if (!periodo) {
    return res.status(400).json({ error: 'El parámetro periodo es obligatorio' });
  }
  try {
    const [rows] = await pool.execute(`
      SELECT ne.Nivel_Educativo_Id, ne.Nivel_Educativo_Nombre
      FROM nivel_educativo ne
      WHERE ne.Nivel_Educativo_Id NOT IN (
        SELECT pe.Nivel_Educativo_Id
        FROM plan_educativo pe
        WHERE pe.Plan_Educativo_Periodo_Lectivo = ?
          AND EXISTS (
            SELECT 1 FROM incluyeasig ia
            WHERE ia.Plan_Educativo_Id = pe.Plan_Educativo_Id
          )
      )
      ORDER BY ne.Nivel_Educativo_Nombre
    `, [periodo]);
    res.json(rows);
  } catch (err) {
    console.error('getNivelesSinPlan:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── GET /api/planes/asignaturas  ─────────────────────────────────
const getAsignaturas = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT Asignatura_Id, Asignatura_Nombre, Asignatura_Prioridad_Academica, Asignatura_Es_Electiva,
              Asignatura_Color
       FROM asignatura ORDER BY Asignatura_Nombre`
    );
    res.json(rows);
  } catch (err) {
    console.error('getAsignaturas:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── POST /api/planes/asignaturas  ── CU 47
const crearAsignatura = async (req, res) => {
  const { nombre, prioridad } = req.body;
  // CU47 / RF28: la asignatura puede marcarse como electiva de 3° y 4° medio
  const electiva = req.body.electiva === true || req.body.electiva === 1 || req.body.electiva === '1';

  if (!nombre?.trim() || !prioridad) {
    return res.status(400).json({ error: 'El nombre y la prioridad académica son obligatorios' });
  }
  if (!['Alta', 'Media', 'Baja'].includes(prioridad)) {
    return res.status(400).json({ error: 'La prioridad debe ser Alta, Media o Baja' });
  }

  // Color que la identifica en los horarios: el elegido o uno aleatorio de la paleta
  const colorElegido = req.body.color === undefined || req.body.color === null || req.body.color === ''
    ? null : normalizarColor(req.body.color);
  if (colorElegido === null && req.body.color) {
    return res.status(400).json({ error: MENSAJE_COLOR_INVALIDO });
  }

  const nombreTrim = nombre.trim();

  try {
    const [dup] = await pool.execute(
      'SELECT Asignatura_Id FROM asignatura WHERE LOWER(Asignatura_Nombre) = LOWER(?)',
      [nombreTrim]
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: `Ya existe una asignatura con el nombre "${nombreTrim}"` });
    }

    const color = colorElegido || await colorAleatorioAsignatura(pool);
    const [result] = await pool.execute(
      `INSERT INTO asignatura (Asignatura_Nombre, Asignatura_Prioridad_Academica, Asignatura_Es_Electiva, Asignatura_Color)
       VALUES (?, ?, ?, ?)`,
      [nombreTrim, prioridad, electiva ? 1 : 0, color]
    );

    res.status(201).json({
      mensaje: `Asignatura${electiva ? ' electiva' : ''} "${nombreTrim}" registrada correctamente`,
      asignatura_id: result.insertId,
      color,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Ya existe una asignatura con el nombre "${nombreTrim}"` });
    }
    console.error('crearAsignatura:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── PUT /api/planes/asignaturas/:id  ── CU 47
const editarAsignatura = async (req, res) => {
  const { id } = req.params;
  const { nombre, prioridad } = req.body;
  // CU47: la marca electiva es opcional al editar; si no llega, se mantiene
  const cambiaElectiva = req.body.electiva !== undefined;
  const electiva = req.body.electiva === true || req.body.electiva === 1 || req.body.electiva === '1';

  if (!nombre?.trim() || !prioridad) {
    return res.status(400).json({ error: 'El nombre y la prioridad académica son obligatorios' });
  }
  if (!['Alta', 'Media', 'Baja'].includes(prioridad)) {
    return res.status(400).json({ error: 'La prioridad debe ser Alta, Media o Baja' });
  }

  // El color es opcional al editar; si no llega, se mantiene
  const cambiaColor = req.body.color !== undefined;
  const color = cambiaColor ? normalizarColor(req.body.color) : null;
  if (cambiaColor && !color) {
    return res.status(400).json({ error: MENSAJE_COLOR_INVALIDO });
  }

  const nombreTrim = nombre.trim();

  try {
    const [asig] = await pool.execute(
      'SELECT Asignatura_Id, Asignatura_Es_Electiva FROM asignatura WHERE Asignatura_Id = ?',
      [id]
    );
    if (asig.length === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    // CU47: no se cambia la marca mientras la asignatura se use con su tipo actual
    const eraElectiva = Number(asig[0].Asignatura_Es_Electiva) === 1;
    if (cambiaElectiva && electiva !== eraElectiva) {
      const [[uso]] = await pool.query(
        eraElectiva
          ? `SELECT (SELECT COUNT(*) FROM plan_electivos_asignatura WHERE Asignatura_Id = ?)
                  + (SELECT COUNT(*) FROM clase_electivo WHERE Asignatura_Id = ?) AS n`
          : `SELECT (SELECT COUNT(*) FROM incluyeasig WHERE Asignatura_Id = ?)
                  + (SELECT COUNT(*) FROM tieneasig WHERE Asignatura_Id = ? AND Estado_Asignacion = 'Activa') AS n`,
        [id, id]
      );
      if (Number(uso?.n) > 0) {
        return res.status(409).json({
          error: eraElectiva
            ? 'La asignatura está en un plan de electivos: quítala del plan antes de desmarcarla como electiva'
            : 'La asignatura está en planes educativos o asociada a cursos: quítala de ellos antes de marcarla como electiva',
        });
      }
    }

    const [dup] = await pool.execute(
      'SELECT Asignatura_Id FROM asignatura WHERE LOWER(Asignatura_Nombre) = LOWER(?) AND Asignatura_Id != ?',
      [nombreTrim, id]
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: `Ya existe una asignatura con el nombre "${nombreTrim}"` });
    }

    await pool.execute(
      `UPDATE asignatura
       SET Asignatura_Nombre = ?, Asignatura_Prioridad_Academica = ?, Asignatura_Es_Electiva = ?${cambiaColor ? ', Asignatura_Color = ?' : ''}
       WHERE Asignatura_Id = ?`,
      [nombreTrim, prioridad, (cambiaElectiva ? electiva : eraElectiva) ? 1 : 0, ...(cambiaColor ? [color] : []), id]
    );

    res.json({ mensaje: `Asignatura "${nombreTrim}" actualizada correctamente` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Ya existe una asignatura con el nombre "${nombreTrim}"` });
    }
    console.error('editarAsignatura:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  getPlanes, getPlanById, crearPlan, editarPlan, clonarPlan, getNivelesSinPlan,
  getAsignaturas, crearAsignatura, editarAsignatura,
};
