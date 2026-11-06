// RF60: profesor jefe (CU95, CU96), estudiantes del curso (CU97) y cursos por período.
const pool = require('../config/db');
const controller = require('../controllers/profesorJefeController');
const { crearCurso } = require('../controllers/cursoController');

jest.mock('../config/db');

const CURSO = {
  Curso_Id: 222, Curso_Nombre: '1ero Básico A', Curso_Periodo_Lectivo: '2026',
  Curso_Profesor_Jefe_Usuario_Id: null, Usuario_RUT: null, Usuario_Nombre_Completo: null,
};
const DOCENTE = { Usuario_Id: 3, Usuario_RUT: '3483606-k', Usuario_Nombre_Completo: 'María Morales', Es_Docente: 1, Usuario_Estado_Cuenta: 1 };
const PERIODOS = [[{ Parametro_Institucional_Id: 1, Parametro_Institucional_Periodo_Vigente: '2026', Parametro_Institucional_Periodo_Siguiente: null }]];

/**
 * Conexión simulada que responde según el SQL. `datos` define curso, docente,
 * jefaturas del docente y situaciones pendientes.
 */
function mockConexion({ curso = CURSO, docente = DOCENTE, jefaturas = [], pendientes = 0 } = {}) {
  const conn = {
    query: jest.fn(async (sql) => {
      if (/FROM curso c\s+LEFT JOIN usuario pj/.test(sql)) return [curso ? [curso] : []];
      if (/FROM parametro_institucional/.test(sql)) return PERIODOS;
      if (/FROM usuario WHERE Usuario_Id = \?/.test(sql)) return [docente ? [docente] : []];
      if (/WHERE Curso_Profesor_Jefe_Usuario_Id = \? AND Curso_Periodo_Lectivo = \?/.test(sql)) return [jefaturas];
      if (/FROM situacion_final/.test(sql)) return [[{ total: pendientes }]];
      return [{ affectedRows: 1 }];
    }),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  pool.getConnection = jest.fn().mockResolvedValue(conn);
  return conn;
}

const sqls = (conn) => conn.query.mock.calls.map((c) => c[0]);
const historial = (conn) => conn.query.mock.calls.filter(([s]) => /INSERT INTO historial/.test(s));

describe('RF60 - CU95/CU96: profesor jefe', () => {
  let req;
  let res;
  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { id: '222' }, body: { docenteId: 3 }, user: { id: 1, roles: ['Administrador'] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  });

  test('CU95: designa al docente y lo registra en el historial', async () => {
    const conn = mockConexion();
    await controller.designarProfesorJefe(req, res);

    expect(sqls(conn)).toContainEqual(expect.stringContaining('UPDATE curso SET Curso_Profesor_Jefe_Usuario_Id = ?'));
    const [h] = historial(conn);
    expect(h[1].slice(0, 4)).toEqual(['—', 'CU95: designación de profesor jefe: 1ero Básico A (2026)', 'Curso_Profesor_Jefe_Usuario_Id', '3483606 (María Morales)']);
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].mensaje).toContain('quedó como profesor jefe');
  });

  test('Tope: un docente con 2 jefaturas en el período no puede tomar una tercera (409)', async () => {
    const conn = mockConexion({ jefaturas: [{ Curso_Id: 224, Curso_Nombre: '2do Básico A' }, { Curso_Id: 225, Curso_Nombre: '1ero Medio A' }] });
    await controller.designarProfesorJefe(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].mensaje).toContain('2do Básico A, 1ero Medio A');
    expect(conn.rollback).toHaveBeenCalled();
    expect(historial(conn)).toHaveLength(0);
  });

  test('El tope se cuenta en el período del curso y bloquea al docente (FOR UPDATE)', async () => {
    const conn = mockConexion();
    await controller.designarProfesorJefe(req, res);
    const consulta = conn.query.mock.calls.find(([s]) => /Curso_Periodo_Lectivo = \?/.test(s) && /FOR UPDATE/.test(s));
    expect(consulta[1]).toEqual([3, '2026', 222, 222]);
    expect(sqls(conn)).toContainEqual(expect.stringMatching(/FROM usuario WHERE Usuario_Id = \? FOR UPDATE/));
  });

  test('CU95 Excepción 1: docente inactivo (400)', async () => {
    mockConexion({ docente: { ...DOCENTE, Usuario_Estado_Cuenta: 0 } });
    await controller.designarProfesorJefe(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Un usuario sin rol docente no puede ser profesor jefe (404)', async () => {
    mockConexion({ docente: { ...DOCENTE, Es_Docente: 0 } });
    await controller.designarProfesorJefe(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('CU95 Excepción 2: si el curso ya tiene jefe, pide confirmar el reemplazo', async () => {
    const conn = mockConexion({ curso: { ...CURSO, Curso_Profesor_Jefe_Usuario_Id: 5, Usuario_RUT: '3890710-7', Usuario_Nombre_Completo: 'Ana Torres' } });
    await controller.designarProfesorJefe(req, res);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ requiereConfirmacion: true }));
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('CU96: el reemplazo confirmado registra anterior y nuevo', async () => {
    req.body.confirmarReemplazo = true;
    const conn = mockConexion({ curso: { ...CURSO, Curso_Profesor_Jefe_Usuario_Id: 5, Usuario_RUT: '3890710-7', Usuario_Nombre_Completo: 'Ana Torres' } });
    await controller.designarProfesorJefe(req, res);
    const [h] = historial(conn);
    expect(h[1].slice(0, 4)).toEqual(['3890710 (Ana Torres)', 'CU96: reemplazo de profesor jefe: 1ero Básico A (2026)', 'Curso_Profesor_Jefe_Usuario_Id', '3483606 (María Morales)']);
  });

  test('CU96 Excepción 2: con situaciones finales en registro pide confirmación adicional', async () => {
    req.body.confirmarReemplazo = true;
    const conn = mockConexion({
      curso: { ...CURSO, Curso_Profesor_Jefe_Usuario_Id: 5, Usuario_RUT: '3890710-7', Usuario_Nombre_Completo: 'Ana Torres' },
      pendientes: 3,
    });
    await controller.designarProfesorJefe(req, res);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ requiereConfirmacionAdicional: true }));
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('No se designa jefe en un curso de un período ya cerrado', async () => {
    mockConexion({ curso: { ...CURSO, Curso_Periodo_Lectivo: '2025' } });
    await controller.designarProfesorJefe(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('CU96 Excepción 1: retirar la jefatura de un curso sin jefe (400)', async () => {
    mockConexion();
    await controller.retirarProfesorJefe(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('CU96: retirar la jefatura deja NULL y lo registra', async () => {
    const conn = mockConexion({ curso: { ...CURSO, Curso_Profesor_Jefe_Usuario_Id: 5, Usuario_RUT: '3890710-7', Usuario_Nombre_Completo: 'Ana Torres' } });
    await controller.retirarProfesorJefe(req, res);
    expect(sqls(conn)).toContainEqual('UPDATE curso SET Curso_Profesor_Jefe_Usuario_Id = NULL WHERE Curso_Id = ?');
    expect(historial(conn)[0][1].slice(0, 4)).toEqual(['3890710 (Ana Torres)', 'CU96: retiro de profesor jefe: 1ero Básico A (2026)', 'Curso_Profesor_Jefe_Usuario_Id', '—']);
    expect(conn.commit).toHaveBeenCalled();
  });
});

describe('RF60 - CU97: estudiantes de un curso', () => {
  let res;
  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  });

  test('El administrador ve los estudiantes del curso', async () => {
    pool.query
      .mockResolvedValueOnce([[{ Curso_Id: 222, Curso_Nombre: '1ero Básico A' }]])
      .mockResolvedValueOnce([[{ Estudiante_Id: 1, Estudiante_Nombre_Completo: 'Diego', Estudiante_RUT: '1-9', Estudiante_Estado_Academico: 'Regular' }]]);
    await controller.getEstudiantesDeCurso({ params: { id: '222' }, user: { id: 1, roles: ['Administrador'] } }, res);
    expect(res.json.mock.calls[0][0].estudiantes).toHaveLength(1);
  });

  test('CU97 Excepción 2: docente sin clases ni jefatura en el curso (403)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ Curso_Id: 226, Curso_Nombre: '2do Medio A' }]])
      .mockResolvedValueOnce([[]]);
    await controller.getEstudiantesDeCurso({ params: { id: '226' }, user: { id: 3, roles: ['Docente'] } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('CU97 Excepción 1: curso sin estudiantes', async () => {
    pool.query.mockResolvedValueOnce([[{ Curso_Id: 222 }]]).mockResolvedValueOnce([[]]);
    await controller.getEstudiantesDeCurso({ params: { id: '222' }, user: { id: 1, roles: ['Administrador'] } }, res);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ estudiantes: [], mensaje: 'El curso no tiene estudiantes' }));
  });

  test('Un apoderado no puede consultar (403)', async () => {
    await controller.getEstudiantesDeCurso({ params: { id: '222' }, user: { id: 4, roles: ['Apoderado'] } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('Cursos por período', () => {
  let res;
  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  });

  test('Sin cierre iniciado no se puede crear un curso del período siguiente', async () => {
    pool.query.mockResolvedValueOnce(PERIODOS);
    await crearCurso({ body: { nivel_educativo_id: 25, seccion: 'B', periodo: '2027' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('Crea el curso en el período vigente y valida el nombre solo dentro del período', async () => {
    pool.query.mockResolvedValueOnce(PERIODOS);
    pool.execute
      .mockResolvedValueOnce([[{ Nivel_Educativo_Nombre: '2do Básico' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 300 }]);
    await crearCurso({ body: { nivel_educativo_id: 25, seccion: 'b' } }, res);
    expect(pool.execute.mock.calls[1][1]).toEqual(['2do Básico B', '2026']);
    expect(pool.execute.mock.calls[2][1]).toEqual(['B', '2do Básico B', 25, '2026']);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
