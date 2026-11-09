// Electivos de 3° y 4° medio: plan del período (CU108), programación en bloques
// compartidos (CU106) y su relación con las clases regulares (CU54, RF27, RF33, CU47).
const pool = require('../config/db');
const electivos = require('../controllers/electivoController');
const { conflictoRegularConElectivos, completitudElectivos } = require('../utils/electivos');
const planController = require('../controllers/planController');

jest.mock('../config/db');

// Respuestas por patrón de SQL: la primera que coincide gana; sin coincidencia, una fila vacía.
function porPatron(respuestas) {
  return jest.fn(async (sql) => {
    for (const [patron, valor] of respuestas) if (patron.test(sql)) return typeof valor === 'function' ? valor() : valor;
    return [[]];
  });
}

function mockConn(respuestas) {
  const conn = {
    query: porPatron(respuestas),
    execute: porPatron(respuestas),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn().mockResolvedValue(), release: jest.fn(),
  };
  pool.getConnection = jest.fn().mockResolvedValue(conn);
  return conn;
}

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

const PERIODOS = [/FROM parametro_institucional ORDER BY/, [[{ Parametro_Institucional_Periodo_Vigente: '2026' }]]];
const PLAN = [/FROM plan_electivos WHERE Plan_Electivos_Periodo_Lectivo = \?$/, [[{ Plan_Electivos_Id: 1, Plan_Electivos_Periodo_Lectivo: '2026' }]]];
const ITEMS = [/FROM plan_electivos_asignatura pea\s+JOIN asignatura a/, [[
  { Plan_Electivos_Asignatura_Id: 1, Asignatura_Id: 2227, Asignatura_Nombre: 'Biología', ruta: 'Científica', horas: 3, horas_programadas: 0.75 },
  { Plan_Electivos_Asignatura_Id: 2, Asignatura_Id: 2229, Asignatura_Nombre: 'Historia', ruta: 'Humanística', horas: 1, horas_programadas: 0.75 },
]]];
const DOCENTES_PLAN = [/FROM plan_electivos_docente ped/, [[
  { Plan_Electivos_Asignatura_Id: 1, Usuario_Id: 7, Usuario_Nombre_Completo: 'Carmen' },
  { Plan_Electivos_Asignatura_Id: 2, Usuario_Id: 6, Usuario_Nombre_Completo: 'Roberto' },
]]];
const BLOQUE = [/FROM bloque_horario bh WHERE bh.Bloque_Horario_Id = \?/, [[{
  Bloque_Horario_Id: 11111113, Bloque_Horario_Tipo: 'Clase', Bloque_Horario_Hora_Inicio: '11:00:00',
  Bloque_Horario_Hora_Fin: '11:45:00', duracion: 0.75, desajustado: 0,
}]]];
const DOCENTE = [/FROM usuario WHERE Usuario_Id = \? AND Es_Docente = 1/, [[{
  Usuario_Id: 7, Usuario_Nombre_Completo: 'Carmen', Docente_Especialidad: 'Ciencias', Docente_Carga_Horaria_Semanal: null,
}]]];

const programar = (body) => ({
  body: { dia: 'Jueves', Bloque_Horario_Id: 11111113, Asignatura_Id: 2227, ruta: 'Científica', Docente_Usuario_Id: 7, ...body },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('CU108: plan de electivos del período', () => {
  test('Excepción 3: ya existe un plan para el período (409 con el plan para editarlo)', async () => {
    pool.query = porPatron([PERIODOS, [/FROM asignatura WHERE Asignatura_Id IN/, [[{ Asignatura_Id: 2227, Asignatura_Nombre: 'Biología', Asignatura_Es_Electiva: 1 }]]]]);
    const conn = mockConn([[/FOR UPDATE/, [[{ Plan_Electivos_Id: 1 }]]]]);
    const r = res();
    await electivos.crearPlan({ body: { asignaturas: [{ Asignatura_Id: 2227, ruta: 'Científica', horas: 3, docentes: [] }] } }, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ Plan_Electivos_Id: 1 }));
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('Excepción 2: solo admite asignaturas marcadas como electivas', async () => {
    pool.query = porPatron([PERIODOS, [/FROM asignatura WHERE Asignatura_Id IN/, [[{ Asignatura_Id: 2222, Asignatura_Nombre: 'Matemática', Asignatura_Es_Electiva: 0 }]]]]);
    const r = res();
    await electivos.crearPlan({ body: { asignaturas: [{ Asignatura_Id: 2222, ruta: 'Científica', horas: 3 }] } }, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].mensaje).toContain('no está marcada como electiva');
  });

  test('Excepción 2: la ruta Técnica no tiene electivos y las horas deben ser enteras', async () => {
    pool.query = porPatron([PERIODOS]);
    let r = res();
    await electivos.crearPlan({ body: { asignaturas: [{ Asignatura_Id: 2227, ruta: 'Técnica', horas: 3 }] } }, r);
    expect(r.status).toHaveBeenCalledWith(400);
    r = res();
    await electivos.crearPlan({ body: { asignaturas: [{ Asignatura_Id: 2227, ruta: 'Científica', horas: 1.5 }] } }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  test('Excepción 1: no hay plan anterior para clonar', async () => {
    pool.query = porPatron([PERIODOS]);
    const r = res();
    await electivos.clonarPlan({ body: { hacia: '2026' } }, r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json.mock.calls[0][0].mensaje).toContain('2025');
  });

  test('Al editar no se puede quitar una asignatura con clases programadas', async () => {
    pool.query = porPatron([PERIODOS, [/FROM asignatura WHERE Asignatura_Id IN/, [[{ Asignatura_Id: 2229, Asignatura_Nombre: 'Historia', Asignatura_Es_Electiva: 1 }]]]]);
    const conn = mockConn([
      PERIODOS,
      [/FROM plan_electivos WHERE Plan_Electivos_Id = \? FOR UPDATE/, [[{ Plan_Electivos_Id: 1, periodo: '2026' }]]],
      [/GROUP BY ce.Asignatura_Id/, [[{ Asignatura_Id: 2227, ruta: 'Científica', Asignatura_Nombre: 'Biología', horas: 0.75 }]]],
    ]);
    const r = res();
    await electivos.editarPlan({ params: { id: '1' }, body: { asignaturas: [{ Asignatura_Id: 2229, ruta: 'Humanística', horas: 2 }] } }, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0].mensaje).toContain('Biología (Científica) tiene clases programadas');
    expect(conn.query.mock.calls.some(([sql]) => /DELETE FROM plan_electivos_asignatura/.test(sql))).toBe(false);
  });
});

describe('CU106: programación de electivos', () => {
  test('Flujo correcto: programa el electivo e informa la especialidad como sugerencia', async () => {
    pool.query = porPatron([PERIODOS]);
    const conn = mockConn([PLAN, ITEMS, DOCENTES_PLAN, BLOQUE, DOCENTE, [/INSERT INTO clase_electivo/, [{ insertId: 9 }]]]);
    const r = res();
    await electivos.programarElectivo(programar({}), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json.mock.calls[0][0].Clase_Electivo_Id).toBe(9);
    expect(r.json.mock.calls[0][0].sugerencia).toContain('no coincide con Biología');
    expect(conn.commit).toHaveBeenCalled();
  });

  test('Excepción 1: la asignatura no pertenece al plan para esa ruta', async () => {
    pool.query = porPatron([PERIODOS]);
    mockConn([PLAN, ITEMS, DOCENTES_PLAN]);
    const r = res();
    await electivos.programarElectivo(programar({ ruta: 'Humanística' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].mensaje).toContain('no pertenece al plan de electivos 2026');
  });

  test('Excepción 2: la ruta Técnica no tiene electivos', async () => {
    pool.query = porPatron([PERIODOS]);
    const r = res();
    await electivos.programarElectivo(programar({ ruta: 'Técnica' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  test('Excepción 3: no supera las horas semanales del electivo en el plan', async () => {
    pool.query = porPatron([PERIODOS]);
    mockConn([PLAN, ITEMS, DOCENTES_PLAN, BLOQUE]);
    const r = res();
    await electivos.programarElectivo(programar({ Asignatura_Id: 2229, ruta: 'Humanística', Docente_Usuario_Id: 6 }), r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json.mock.calls[0][0].mensaje).toContain('1 h semanales');
  });

  test('Excepción 4: el bloque tiene clases regulares de 3° o 4° medio', async () => {
    pool.query = porPatron([PERIODOS]);
    mockConn([PLAN, ITEMS, DOCENTES_PLAN, BLOQUE,
      [/AND ha.Horario_Asignatura_Dia_Semana = \? AND ha.Bloque_Horario_Id = \?/, [[{ Curso_Nombre: '3ero Medio A', Asignatura_Nombre: 'Matemática' }]]]]);
    const r = res();
    await electivos.programarElectivo(programar({}), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0].mensaje).toContain('3ero Medio A (Matemática)');
  });

  test('Excepción 5: el docente no está habilitado en el plan', async () => {
    pool.query = porPatron([PERIODOS]);
    mockConn([PLAN, ITEMS, DOCENTES_PLAN, BLOQUE]);
    const r = res();
    await electivos.programarElectivo(programar({ Docente_Usuario_Id: 6 }), r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json.mock.calls[0][0].mensaje).toContain('no está habilitado');
  });

  test('Excepción 5: el docente ya tiene clase ese día y bloque', async () => {
    pool.query = porPatron([PERIODOS]);
    mockConn([PLAN, ITEMS, DOCENTES_PLAN, BLOQUE, DOCENTE, [/UNION ALL/, [[{ clase: '1ero Básico A (Matemática)' }]]]]);
    const r = res();
    await electivos.programarElectivo(programar({}), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0].mensaje).toContain('ya tiene 1ero Básico A (Matemática)');
  });

  test('RF35: el electivo cuenta en la carga horaria semanal del docente', async () => {
    pool.query = porPatron([PERIODOS]);
    mockConn([PLAN, ITEMS, DOCENTES_PLAN, BLOQUE,
      [/FROM usuario WHERE Usuario_Id = \? AND Es_Docente = 1/, [[{ Usuario_Id: 7, Usuario_Nombre_Completo: 'Carmen', Docente_Carga_Horaria_Semanal: 2 }]]],
      [/FROM horario_asignatura ha\s+JOIN bloque_horario bh/, [[{ horas: 0.75 }]]],
      [/FROM clase_electivo ce JOIN bloque_horario bh/, [[{ horas: 0.75 }]]]]);
    const r = res();
    await electivos.programarElectivo(programar({}), r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json.mock.calls[0][0].mensaje).toContain('carga horaria semanal de 2 h');
  });
});

describe('CU54: clases regulares y electivos', () => {
  test('Un curso de 3° o 4° medio no admite clases regulares en un bloque de electivos', async () => {
    const db = { query: porPatron([
      [/FROM curso c WHERE c.Curso_Id = \?/, [[{ periodo: '2026', tiene: 1 }]]],
      [/FROM clase_electivo ce/, [[{ asignatura: 'Biología', ruta: 'Científica', Docente_Usuario_Id: 7 }]]],
    ]) };
    const msg = await conflictoRegularConElectivos(db, { cursoId: 227, docenteId: 3, dia: 'Miércoles', bloqueId: 11111113 });
    expect(msg).toContain('no admite clases regulares');
  });

  test('En otro curso solo choca si el docente tiene un electivo a esa hora', async () => {
    const db = { query: porPatron([
      [/FROM curso c WHERE c.Curso_Id = \?/, [[{ periodo: '2026', tiene: 0 }]]],
      [/FROM clase_electivo ce/, [[{ asignatura: 'Biología', ruta: 'Científica', Docente_Usuario_Id: 7 }]]],
    ]) };
    expect(await conflictoRegularConElectivos(db, { cursoId: 222, docenteId: 3, dia: 'Miércoles', bloqueId: 1 })).toBeNull();
    expect(await conflictoRegularConElectivos(db, { cursoId: 222, docenteId: 7, dia: 'Miércoles', bloqueId: 1 }))
      .toContain('ya tiene el electivo Biología (Científica)');
  });

  test('Completitud: horas de una ruta y cada bloque de electivos una vez', async () => {
    const db = { query: porPatron([
      [/MAX\(t.horas\)/, [[{ horas: 6 }]]],
      [/SELECT DISTINCT ce.Clase_Electivo_Dia_Semana/, [[{ horas: 1.5 }]]],
    ]) };
    expect(await completitudElectivos(db, '2026')).toEqual({ requeridas: 6, programadas: 1.5 });
  });
});

describe('RF27 y CU47: asignaturas electivas', () => {
  test('RF27: una electiva no entra en un plan educativo regular', async () => {
    const conn = mockConn([
      [/FROM nivel_educativo WHERE/, [[{ Nivel_Educativo_Nombre: '3ero Medio' }]]],
      [/FROM asignatura WHERE Asignatura_Id IN/, [[{ Asignatura_Id: 2227, Asignatura_Nombre: 'Biología', Asignatura_Es_Electiva: 1 }]]],
    ]);
    const r = res();
    await planController.crearPlan({ body: {
      nivel_educativo_id: 34, periodo_lectivo: '2026',
      asignaturas: [{ asignatura_id: 2227, tipo: 'Obligatorio', horas_semanales: 2 }],
    } }, r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json.mock.calls[0][0].error).toContain('solo puede incluirse en el plan de electivos');
    expect(conn.execute.mock.calls.some(([sql]) => /INSERT INTO plan_educativo/.test(sql))).toBe(false);
  });

  test('CU47: se registra una asignatura marcada como electiva', async () => {
    pool.execute = porPatron([[/INSERT INTO asignatura/, [{ insertId: 3000 }]]]);
    const r = res();
    await planController.crearAsignatura({ body: { nombre: 'Química Avanzada', prioridad: 'Media', electiva: true } }, r);
    expect(r.status).toHaveBeenCalledWith(201);
    const insert = pool.execute.mock.calls.find(([sql]) => /INSERT INTO asignatura/.test(sql));
    // El último valor es el color aleatorio de la paleta (utils/colores.js)
    expect(insert[1]).toEqual(['Química Avanzada', 'Media', 1, expect.stringMatching(/^#[0-9A-F]{6}$/)]);
  });

  test('CU47: no se marca como electiva una asignatura usada en planes o cursos', async () => {
    pool.execute = porPatron([[/SELECT Asignatura_Id, Asignatura_Es_Electiva FROM asignatura/, [[{ Asignatura_Id: 2222, Asignatura_Es_Electiva: 0 }]]]]);
    pool.query = porPatron([[/FROM incluyeasig/, [[{ n: 2 }]]]]);
    const r = res();
    await planController.editarAsignatura({ params: { id: '2222' }, body: { nombre: 'Matemática', prioridad: 'Alta', electiva: true } }, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(pool.execute.mock.calls.some(([sql]) => /UPDATE asignatura/.test(sql))).toBe(false);
  });
});
