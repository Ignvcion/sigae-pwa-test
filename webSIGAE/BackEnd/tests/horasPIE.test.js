// Horas P.I.E. y regla 65/35 (utils/cargaLectiva.js, controllers/pieController.js).
const pool = require('../config/db');
const carga = require('../utils/cargaLectiva');
const { getPIE, guardarPIE } = require('../controllers/pieController');

jest.mock('../config/db');

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

// Responde según el SQL: [[regex, respuesta]]; lo demás, [[]]
const porPatron = (reglas) => jest.fn(async (sql) => {
  const regla = reglas.find(([re]) => re.test(sql));
  return regla ? regla[1] : [[]];
});

beforeEach(() => jest.resetAllMocks());

describe('Regla 65/35 con horas P.I.E. (horas pedagógicas)', () => {
  test('44 h con 3 h P.I.E. → 41 h: máximo 26 clases (65 %) y 15 h no lectivas', () => {
    expect(carga.calcularCargaLectiva(44, 3)).toEqual({
      carga: 44, horasPIE: 3, disponibles: 41, maxLectivas: 26, noLectivas: 15,
    });
    expect(carga.textoReparto(carga.calcularCargaLectiva(44, 3)))
      .toBe('44 h − 3 h P.I.E. = 41 h → 26 clases (65 %) y 15 h no lectivas (35 %)');
  });

  test.each([
    [44, 0, 28, 16],   // 28,6 → 28
    [20, 0, 13, 7],    // 13 exacto (sin perder uno por redondeo binario)
    [38, 2, 23, 13],   // 36 × 0,65 = 23,4
    [3, 3, 0, 0],      // todo P.I.E.: no puede tener clases
  ])('carga %p, P.I.E. %p → máximo %p clases y %p no lectivas', (c, pie, max, noLect) => {
    const r = carga.calcularCargaLectiva(c, pie);
    expect(r.maxLectivas).toBe(max);
    expect(r.noLectivas).toBe(noLect);
  });

  test('Sin carga registrada no hay límite', () => {
    expect(carga.calcularCargaLectiva(null, 3)).toBeNull();
    expect(carga.calcularCargaLectiva(undefined)).toBeNull();
  });

  test('Cuenta clases regulares activas y electivos del período (cada bloque = 1)', async () => {
    const db = { query: porPatron([
      [/COUNT\(\*\) AS n\s+FROM horario_asignatura/, [[{ id: 7, n: 25 }]]],
      [/COUNT\(\*\) AS n\s+FROM clase_electivo/, [[{ id: 7, n: 1 }]]],
      [/FROM usuario WHERE Usuario_Id IN/, [[{ Usuario_Id: 7, Usuario_Nombre_Completo: 'Ana', Docente_Carga_Horaria_Semanal: 44, Docente_Horas_PIE: 3 }]]],
    ]) };
    expect((await carga.clasesLectivas(db, [7], '2026')).get(7)).toBe(26);
    // 26 de 26: la siguiente se rechaza
    expect(await carga.verificarCargaLectiva(db, 7, '2026')).toBe(
      'Ana superaría su máximo semanal de 26 clases (44 h − 3 h P.I.E. = 41 h → 26 clases (65 %) y 15 h no lectivas (35 %)). '
      + 'Ya tiene 26 clases y quedaría con 27.'
    );
    // La clase que se edita no se cuenta dos veces
    await carga.verificarCargaLectiva(db, 7, '2026', { excluirHorarioId: 99 });
    expect(db.query.mock.calls.some(([sql, p]) => /Horario_Asignatura_Id <> \?/.test(sql) && p.includes(99))).toBe(true);
  });

  test('Con espacio disponible no hay mensaje', async () => {
    const db = { query: porPatron([
      [/COUNT\(\*\) AS n\s+FROM horario_asignatura/, [[{ id: 7, n: 10 }]]],
      [/FROM usuario WHERE Usuario_Id IN/, [[{ Usuario_Id: 7, Docente_Carga_Horaria_Semanal: 44, Docente_Horas_PIE: 3 }]]],
    ]) };
    expect(await carga.verificarCargaLectiva(db, 7, '2026')).toBeNull();
  });
});

describe('GET /api/usuarios/:id/pie', () => {
  test('Un docente no puede ver las horas P.I.E. de otro', async () => {
    const res = nuevoRes();
    await getPIE({ params: { id: '5' }, query: {}, user: { id: 3, roles: ['Docente'] } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('Entrega el reparto, las clases asignadas y los bloques P.I.E. del período vigente', async () => {
    pool.query = porPatron([
      [/FROM usuario WHERE Usuario_Id = \? AND Es_Docente = 1/, [[{ Usuario_Id: 3, Usuario_Nombre_Completo: 'María', Docente_Carga_Horaria_Semanal: 44, Docente_Horas_PIE: 3 }]]],
      [/FROM parametro_institucional/, [[{ Parametro_Institucional_Periodo_Vigente: '2026', Parametro_Institucional_Periodo_Siguiente: null }]]],
      [/FROM bloque_pie_docente bp/, [[{ dia: 'Lunes', bloqueId: 11, horaInicio: '08:00:00', horaFin: '08:45:00' }]]],
      [/COUNT\(\*\) AS n\s+FROM horario_asignatura/, [[{ id: 3, n: 20 }]]],
    ]);
    const res = nuevoRes();
    await getPIE({ params: { id: '3' }, query: {}, user: { id: 3, roles: ['Docente'] } }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({
      horasPIE: 3, clasesAsignadas: 20,
      reparto: { carga: 44, horasPIE: 3, disponibles: 41, maxLectivas: 26, noLectivas: 15 },
      bloques: [expect.objectContaining({ dia: 'Lunes', bloqueId: 11 })],
    }));
  });
});

describe('PUT /api/usuarios/:id/pie (administración)', () => {
  const admin = { id: 1, roles: ['Administrador'] };
  const DOCENTE = [[{ Usuario_Id: 3, Usuario_Nombre_Completo: 'María', Docente_Carga_Horaria_Semanal: 44, Docente_Horas_PIE: 0 }]];
  const PERIODOS = [[{ Parametro_Institucional_Periodo_Vigente: '2026', Parametro_Institucional_Periodo_Siguiente: null }]];
  const guardar = (body) => {
    const res = nuevoRes();
    return guardarPIE({ params: { id: '3' }, body, user: admin }, res).then(() => res);
  };

  test.each([
    [{ horasPIE: -1 }, 'Las horas P.I.E. deben ser un número entero igual o mayor a 0'],
    [{ horasPIE: 1.5 }, 'Las horas P.I.E. deben ser un número entero igual o mayor a 0'],
    [{ horasPIE: 1, bloques: [{ dia: 'Lunes', bloqueId: 11 }, { dia: 'Martes', bloqueId: 11 }] },
      'Marcaste 2 bloques P.I.E. pero el docente tiene 1 hora P.I.E.'],
    [{ horasPIE: 2, bloques: [{ dia: 'Sábado', bloqueId: 11 }] },
      'Cada bloque P.I.E. necesita un día (lunes a viernes) y un bloque horario'],
    [{ horasPIE: 2, bloques: [{ dia: 'Lunes', bloqueId: 11 }, { dia: 'Lunes', bloqueId: 11 }] }, 'Hay bloques P.I.E. repetidos'],
  ])('rechaza %p sin tocar la base', async (body, mensaje) => {
    const res = await guardar(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('Las horas P.I.E. no pueden superar la carga', async () => {
    pool.query = porPatron([[/FROM usuario WHERE Usuario_Id = \?/, DOCENTE]]);
    const res = await guardar({ horasPIE: 45 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain('no pueden superar la carga horaria semanal (44 h)');
  });

  test('Un bloque P.I.E. no puede ser un recreo ni coincidir con una clase del docente', async () => {
    pool.query = porPatron([
      [/FROM usuario WHERE Usuario_Id = \?/, DOCENTE],
      [/FROM parametro_institucional/, PERIODOS],
      [/FROM bloque_horario WHERE Bloque_Horario_Id IN/, [[]]], // no es bloque de clase
    ]);
    let res = await guardar({ horasPIE: 3, bloques: [{ dia: 'Lunes', bloqueId: 11 }] });
    expect(res.json.mock.calls[0][0].mensaje).toBe('Los bloques P.I.E. deben ser bloques de clase (no recreos)');

    pool.query = porPatron([
      [/FROM usuario WHERE Usuario_Id = \?/, DOCENTE],
      [/FROM parametro_institucional/, PERIODOS],
      [/FROM bloque_horario WHERE Bloque_Horario_Id IN/, [[{ Bloque_Horario_Id: 11 }]]],
      [/UNION ALL/, [[{ dia: 'Lunes', bloqueId: 11, descripcion: 'Matemática · 1ero Básico A' }]]],
    ]);
    res = await guardar({ horasPIE: 3, bloques: [{ dia: 'Lunes', bloqueId: 11 }] });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].mensaje).toBe('El Lunes el docente ya tiene clase en ese bloque (Matemática · 1ero Básico A)');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('Guarda horas y bloques del período en una transacción y avisa si ya supera el nuevo máximo', async () => {
    pool.query = porPatron([
      [/FROM usuario WHERE Usuario_Id = \?/, DOCENTE],
      [/FROM parametro_institucional/, PERIODOS],
      [/FROM bloque_horario WHERE Bloque_Horario_Id IN/, [[{ Bloque_Horario_Id: 11 }]]],
      [/COUNT\(\*\) AS n\s+FROM horario_asignatura/, [[{ id: 3, n: 28 }]]],
    ]);
    const conn = { query: jest.fn().mockResolvedValue([{}]), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
    pool.getConnection.mockResolvedValue(conn);

    const res = await guardar({ horasPIE: 3, bloques: [{ dia: 'Lunes', bloqueId: 11 }] });

    const sqls = conn.query.mock.calls.map(([sql, p]) => [sql.replace(/\s+/g, ' ').trim(), p]);
    expect(sqls[0]).toEqual(['UPDATE usuario SET Docente_Horas_PIE = ? WHERE Usuario_Id = ?', [3, 3]]);
    expect(sqls[1][0]).toMatch(/^DELETE FROM bloque_pie_docente/);
    expect(sqls[1][1]).toEqual([3, '2026']);
    expect(sqls[2][1]).toEqual([3, '2026', 'Lunes', 11]);
    expect(conn.commit).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.reparto.maxLectivas).toBe(26);
    expect(body.advertencia).toBe('María ya tiene 28 clases y su nuevo máximo es 26: reasigna 2 a otro docente.');
  });
});
