// Tramos de las asignaturas (Kinder, Básica, Media): reemplazan a la prioridad
// académica y bloquean cada asignatura a los niveles de su tramo.
const pool = require('../config/db');
const planController = require('../controllers/planController');
const { normalizarTramo, asignaturasFueraDeTramo, mensajeFueraDeTramo } = require('../utils/tramos');

jest.mock('../config/db');

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

// Responde según el SQL: [[regex, respuesta], ...]; lo demás, [[]]
const porPatron = (reglas) => jest.fn(async (sql) => {
  const regla = reglas.find(([re]) => re.test(sql));
  return regla ? (typeof regla[1] === 'function' ? regla[1](sql) : regla[1]) : [[]];
});

beforeEach(() => jest.resetAllMocks());

describe('utils/tramos', () => {
  test.each([
    ['Kinder', 'Kinder'], ['básica', 'Básica'], ['BASICA', 'Básica'], [' Media ', 'Media'],
    ['Alta', null], ['', null], [undefined, null],
  ])('normalizarTramo(%p) → %p', (entrada, salida) => {
    expect(normalizarTramo(entrada)).toBe(salida);
  });

  test('asignaturasFueraDeTramo compara con el tramo del nivel', async () => {
    const conn = { execute: porPatron([
      [/FROM nivel_educativo/, [[{ nombre: '7mo Básico', tramo: 'Media' }]]],
      [/Asignatura_Tramo <> \?/, [[{ id: 2222, nombre: 'Matemática', tramo: 'Básica' }]]],
    ]) };
    const r = await asignaturasFueraDeTramo(conn, 30, [2222, 2231, 2222]);

    expect(r.nivel).toEqual({ nombre: '7mo Básico', tramo: 'Media' });
    expect(r.fuera).toHaveLength(1);
    // Ids sin repetir y el tramo del nivel al final
    expect(conn.execute.mock.calls[1][1]).toEqual([2222, 2231, 'Media']);
    expect(mensajeFueraDeTramo(r.nivel, [...r.fuera, { nombre: 'Lenguaje', tramo: 'Básica' }])).toBe(
      '7mo Básico es del tramo Media: las asignaturas "Matemática" (Básica), "Lenguaje" (Básica) son de otro tramo y no se pueden incluir'
    );
  });

  test('Un nivel inexistente devuelve nivel null', async () => {
    const conn = { execute: porPatron([]) };
    expect(await asignaturasFueraDeTramo(conn, 999, [1])).toEqual({ nivel: null, fuera: [] });
  });
});

describe('Asignaturas: el tramo reemplaza a la prioridad', () => {
  test('Crear exige un tramo válido (ya no acepta la prioridad)', async () => {
    let res = nuevoRes();
    await planController.crearAsignatura({ body: { nombre: 'Química', prioridad: 'Alta' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('El nombre y el tramo son obligatorios');

    res = nuevoRes();
    await planController.crearAsignatura({ body: { nombre: 'Química', tramo: 'Alta' } }, res);
    expect(res.json.mock.calls[0][0].error).toBe('El tramo debe ser Kinder, Básica o Media');
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('Una electiva solo puede ser del tramo Media', async () => {
    const res = nuevoRes();
    await planController.crearAsignatura({ body: { nombre: 'Química', tramo: 'Básica', electiva: true } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('tramo Media');
  });

  test('El mismo nombre se puede registrar en otro tramo; en el mismo tramo, no', async () => {
    // "Matemática" ya existe en Básica
    pool.execute.mockImplementation(async (sql, params) => {
      if (/AND Asignatura_Tramo = \?/.test(sql)) return [params[1] === 'Básica' ? [{ Asignatura_Id: 2222 }] : []];
      if (/INSERT INTO asignatura/.test(sql)) return [{ insertId: 3000 }];
      return [[]];
    });
    pool.query.mockResolvedValue([[]]);

    let res = nuevoRes();
    await planController.crearAsignatura({ body: { nombre: 'Matemática', tramo: 'Media' } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const insert = pool.execute.mock.calls.find(([sql]) => /INSERT INTO asignatura/.test(sql));
    expect(insert[0]).toContain('Asignatura_Tramo');
    expect(insert[1].slice(0, 3)).toEqual(['Matemática', 'Media', 0]);

    res = nuevoRes();
    await planController.crearAsignatura({ body: { nombre: 'matemática', tramo: 'basica' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toBe('Ya existe una asignatura "matemática" en el tramo Básica');
  });

  test('No se cambia el tramo de una asignatura en uso', async () => {
    pool.execute = porPatron([[/SELECT Asignatura_Id, Asignatura_Es_Electiva, Asignatura_Tramo/, [[{ Asignatura_Id: 2222, Asignatura_Es_Electiva: 0, Asignatura_Tramo: 'Básica' }]]]]);
    pool.query = porPatron([[/FROM incluyeasig/, [[{ n: 3 }]]]]);
    const res = nuevoRes();

    await planController.editarAsignatura({ params: { id: '2222' }, body: { nombre: 'Matemática', tramo: 'Media' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toContain('del tramo Básica: no se puede cambiar a Media');
    expect(pool.execute.mock.calls.some(([sql]) => /UPDATE asignatura/.test(sql))).toBe(false);
  });

  test('Sin uso, el tramo sí se cambia; y mantener el tramo no revisa el uso', async () => {
    pool.execute = porPatron([[/SELECT Asignatura_Id, Asignatura_Es_Electiva, Asignatura_Tramo/, [[{ Asignatura_Id: 2226, Asignatura_Es_Electiva: 0, Asignatura_Tramo: 'Básica' }]]]]);
    pool.query = porPatron([[/FROM incluyeasig/, [[{ n: 0 }]]]]);
    let res = nuevoRes();
    await planController.editarAsignatura({ params: { id: '2226' }, body: { nombre: 'Inglés', tramo: 'Kinder' } }, res);
    expect(res.status).not.toHaveBeenCalled();
    const update = pool.execute.mock.calls.find(([sql]) => /UPDATE asignatura/.test(sql));
    expect(update[1]).toEqual(['Inglés', 'Kinder', 0, '2226']);

    pool.query.mockClear();
    res = nuevoRes();
    await planController.editarAsignatura({ params: { id: '2226' }, body: { nombre: 'Inglés', tramo: 'Básica' } }, res);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('Planes educativos: solo asignaturas del tramo del nivel', () => {
  const conexion = (reglas) => {
    const conn = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: porPatron(reglas), query: porPatron(reglas),
    };
    pool.getConnection.mockResolvedValue(conn);
    return conn;
  };

  test('Crear: rechaza Matemática de Básica en el plan de 1ero Medio', async () => {
    const conn = conexion([
      [/SELECT Nivel_Educativo_Nombre FROM nivel_educativo/, [[{ Nivel_Educativo_Nombre: '1ero Medio' }]]],
      [/FROM asignatura WHERE Asignatura_Id IN \(\?\)$/, [[{ Asignatura_Id: 2222, Asignatura_Nombre: 'Matemática', Asignatura_Es_Electiva: 0 }]]],
      [/AS nombre, Nivel_Educativo_Tramo AS tramo/, [[{ nombre: '1ero Medio', tramo: 'Media' }]]],
      [/Asignatura_Tramo <> \?/, [[{ id: 2222, nombre: 'Matemática', tramo: 'Básica' }]]],
    ]);
    const res = nuevoRes();
    await planController.crearPlan({ body: {
      nivel_educativo_id: 32, periodo_lectivo: '2026',
      asignaturas: [{ asignatura_id: 2222, tipo: 'Obligatorio', horas_semanales: 6 }],
    } }, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toContain('1ero Medio es del tramo Media');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.execute.mock.calls.some(([sql]) => /INSERT INTO (plan_educativo|incluyeasig)/.test(sql))).toBe(false);
  });

  test('Clonar a un nivel de otro tramo: rechaza las asignaturas copiadas del origen', async () => {
    const conn = conexion([
      [/FROM plan_educativo pe\s+JOIN nivel_educativo/, [[{ Plan_Educativo_Id: 1, Nivel_Educativo_Id: 29, Nivel_Educativo_Nombre: '6to Básico' }]]],
      [/SELECT Nivel_Educativo_Nombre FROM nivel_educativo/, [[{ Nivel_Educativo_Nombre: '7mo Básico' }]]],
      [/FROM incluyeasig ia JOIN asignatura a/, [[{ Asignatura_Id: 2222, Tipo: 'Obligatorio', Horas_Semanales_Requeridas: 6 }]]],
      [/AS nombre, Nivel_Educativo_Tramo AS tramo/, [[{ nombre: '7mo Básico', tramo: 'Media' }]]],
      [/Asignatura_Tramo <> \?/, [[{ id: 2222, nombre: 'Matemática', tramo: 'Básica' }]]],
    ]);
    const res = nuevoRes();
    await planController.clonarPlan({ body: { plan_origen_id: 1, nuevo_periodo_lectivo: '2027', nivel_educativo_id: 30 } }, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toBe(
      '7mo Básico es del tramo Media: la asignatura "Matemática" (Básica) es de otro tramo y no se puede incluir'
    );
    expect(conn.execute.mock.calls.some(([sql]) => /INSERT INTO plan_educativo/.test(sql))).toBe(false);
  });
});
