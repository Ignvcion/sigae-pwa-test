// Colores de asignaturas y docentes: paleta básica de 12, color aleatorio al
// crear (entre los menos usados), cambio por paleta o hexadecimal libre.
const pool = require('../config/db');
const colores = require('../utils/colores');
const { getColores, cambiarColorAsignatura, cambiarColorDocente } = require('../controllers/colorController');
const planController = require('../controllers/planController');

jest.mock('../config/db');

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const HEX = /^#[0-9A-F]{6}$/;

beforeEach(() => jest.resetAllMocks());

describe('utils/colores', () => {
  test('La paleta básica tiene 12 colores hexadecimales distintos y con nombre', () => {
    expect(colores.PALETA_BASICA).toHaveLength(12);
    expect(new Set(colores.PALETA_BASICA.map((c) => c.hex)).size).toBe(12);
    colores.PALETA_BASICA.forEach((c) => {
      expect(c.hex).toMatch(HEX);
      expect(c.nombre).toBeTruthy();
    });
  });

  test.each([
    ['#2563eb', '#2563EB'], ['2563EB', '#2563EB'], [' #a1B2c3 ', '#A1B2C3'],
    ['#25e', null], ['#2563EG', null], ['rojo', null], ['', null], [null, null], [undefined, null],
  ])('normalizarColor(%p) → %p', (entrada, salida) => {
    expect(colores.normalizarColor(entrada)).toBe(salida);
  });

  test('El color aleatorio es de la paleta y elige entre los menos usados', () => {
    const paleta = colores.PALETA_BASICA.map((c) => c.hex);
    // Todos usados una vez salvo el Violeta: solo puede salir el Violeta
    const usados = paleta.filter((h) => h !== '#7C3AED');
    expect(colores.colorAleatorio(usados, () => 0.99)).toBe('#7C3AED');
    expect(colores.colorAleatorio(usados, () => 0)).toBe('#7C3AED');

    // Sin usados, cualquiera de la paleta según el azar
    expect(colores.colorAleatorio([], () => 0)).toBe(paleta[0]);
    expect(colores.colorAleatorio([], () => 0.999)).toBe(paleta[11]);

    // Colores fuera de la paleta (elegidos a mano) no cuentan; mayúsculas/minúsculas da igual
    const casiTodos = paleta.slice(0, 11).map((h) => h.toLowerCase()).concat(['#123456', null]);
    expect(colores.colorAleatorio(casiTodos, Math.random)).toBe(paleta[11]);
  });

  test('Muchos colores aleatorios seguidos se reparten sin repetir hasta agotar la paleta', () => {
    const usados = [];
    for (let i = 0; i < 12; i++) usados.push(colores.colorAleatorio(usados));
    expect(new Set(usados).size).toBe(12);
  });
});

describe('GET /api/colores', () => {
  test('Devuelve mapas id → color y completa con un color estable si falta', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 2222, color: '#dc2626' }, { id: 2223, color: null }]])
      .mockResolvedValueOnce([[{ id: 3, color: '#4F46E5' }, { id: 5, color: 'malo' }]]);
    const res = nuevoRes();

    await getColores({}, res);

    const { asignaturas, docentes } = res.json.mock.calls[0][0];
    expect(asignaturas[2222]).toBe('#DC2626');
    expect(asignaturas[2223]).toBe(colores.colorPorDefecto(2223));
    expect(docentes).toEqual({ 3: '#4F46E5', 5: colores.colorPorDefecto(5) });
  });
});

describe('Cambiar el color (administración)', () => {
  test.each([
    ['asignatura', cambiarColorAsignatura, /UPDATE asignatura SET Asignatura_Color = \?/],
    ['docente', cambiarColorDocente, /UPDATE usuario SET Docente_Color = \? WHERE Usuario_Id = \? AND Es_Docente = 1/],
  ])('%s: guarda el hexadecimal normalizado', async (_, cambiar, sql) => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = nuevoRes();
    await cambiar({ params: { id: '7' }, body: { color: '0d9488' } }, res);

    expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(sql), ['#0D9488', '7']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ color: '#0D9488' }));
  });

  test.each([cambiarColorAsignatura, cambiarColorDocente])('rechaza un color inválido sin tocar la base', async (cambiar) => {
    const res = nuevoRes();
    await cambiar({ params: { id: '7' }, body: { color: 'azul' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('Un docente inexistente (o que no es docente) responde 404', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = nuevoRes();
    await cambiarColorDocente({ params: { id: '1' }, body: { color: '#0D9488' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('Asignaturas (CU47): color al crear y editar', () => {
  const sinDuplicados = () => pool.execute.mockImplementation(async (sql) => (
    /INSERT INTO asignatura/.test(sql) ? [{ insertId: 3000 }] : [[]]
  ));

  test('Sin color elegido recibe uno aleatorio entre los que no usan las demás', async () => {
    sinDuplicados();
    const usados = colores.PALETA_BASICA.map((c) => c.hex).filter((h) => h !== '#16A34A');
    pool.query.mockResolvedValueOnce([usados.map((color) => ({ color }))]);
    const res = nuevoRes();

    await planController.crearAsignatura({ body: { nombre: 'Química', prioridad: 'Media' } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].color).toBe('#16A34A');
    const insert = pool.execute.mock.calls.find(([sql]) => /INSERT INTO asignatura/.test(sql));
    expect(insert[1].at(-1)).toBe('#16A34A');
  });

  test('Con un color elegido (cualquier hexadecimal) se usa ese', async () => {
    sinDuplicados();
    const res = nuevoRes();
    await planController.crearAsignatura({ body: { nombre: 'Química', prioridad: 'Media', color: '#123abc' } }, res);

    expect(res.json.mock.calls[0][0].color).toBe('#123ABC');
    expect(pool.query).not.toHaveBeenCalled(); // no hace falta sortear
  });

  test('Un color inválido se rechaza antes de tocar la base', async () => {
    const res = nuevoRes();
    await planController.crearAsignatura({ body: { nombre: 'Química', prioridad: 'Media', color: '#12' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('Al editar, el color es opcional: si llega se guarda, si no se mantiene', async () => {
    pool.execute.mockImplementation(async (sql) => (
      /SELECT Asignatura_Id, Asignatura_Es_Electiva/.test(sql) ? [[{ Asignatura_Id: 2222, Asignatura_Es_Electiva: 0 }]] : [[]]
    ));
    const conColor = nuevoRes();
    await planController.editarAsignatura({ params: { id: '2222' }, body: { nombre: 'Matemática', prioridad: 'Alta', color: '#7c3aed' } }, conColor);
    let update = pool.execute.mock.calls.find(([sql]) => /UPDATE asignatura/.test(sql));
    expect(update[0]).toContain('Asignatura_Color = ?');
    expect(update[1]).toEqual(['Matemática', 'Alta', 0, '#7C3AED', '2222']);

    pool.execute.mockClear();
    await planController.editarAsignatura({ params: { id: '2222' }, body: { nombre: 'Matemática', prioridad: 'Alta' } }, nuevoRes());
    update = pool.execute.mock.calls.find(([sql]) => /UPDATE asignatura/.test(sql));
    expect(update[0]).not.toContain('Asignatura_Color');
  });
});
