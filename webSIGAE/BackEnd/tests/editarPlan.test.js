const planController = require('../controllers/planController');
const pool = require('../config/db');

jest.mock('../config/db');

function crearConnMock() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
}

const BODY = {
  nivel_educativo_id: 24,
  periodo_lectivo: '2026',
  asignaturas: [
    { asignatura_id: 2222, tipo: 'Obligatorio', horas_semanales: 5 },
    { asignatura_id: 2225, tipo: 'Complementario', horas_semanales: 2 },
  ],
};

describe('Editar plan educativo', () => {
  let req;
  let res;
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { id: '2222222' }, body: JSON.parse(JSON.stringify(BODY)) };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    conn = crearConnMock();
    pool.getConnection.mockResolvedValue(conn);
  });

  test('Retorna 400 si el plan queda sin asignaturas', async () => {
    req.body.asignaturas = [];

    await planController.editarPlan(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('Retorna 400 si una asignatura se repite', async () => {
    req.body.asignaturas.push({ asignatura_id: 2222, tipo: 'Obligatorio', horas_semanales: 1 });

    await planController.editarPlan(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Retorna 404 si el plan no existe', async () => {
    conn.execute.mockResolvedValueOnce([[]]);

    await planController.editarPlan(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('Retorna 409 si otro plan ya cubre ese nivel y periodo', async () => {
    conn.execute
      .mockResolvedValueOnce([[{ Plan_Educativo_Id: 2222222 }]])
      .mockResolvedValueOnce([[{ Nivel_Educativo_Nombre: '1ro Básico' }]])
      .mockResolvedValueOnce([[{ Plan_Educativo_Id: 2222999 }]]);

    await planController.editarPlan(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('Actualiza las asignaturas que se mantienen, agrega las nuevas y quita las demás', async () => {
    conn.execute
      .mockResolvedValueOnce([[{ Plan_Educativo_Id: 2222222 }]])           // plan FOR UPDATE
      .mockResolvedValueOnce([[{ Nivel_Educativo_Nombre: '1ro Básico' }]]) // nivel
      .mockResolvedValueOnce([[]])                                          // sin duplicado
      .mockResolvedValueOnce([[{ Asignatura_Id: 2222 }, { Asignatura_Id: 2225 }]]) // asignaturas existen
      .mockResolvedValueOnce([[{ nombre: '1ro Básico', tramo: 'Básica' }]]) // tramo del nivel
      .mockResolvedValueOnce([[]])                                          // ninguna de otro tramo
      .mockResolvedValueOnce([{ affectedRows: 1 }])                         // UPDATE plan
      .mockResolvedValueOnce([[                                             // incluyeasig actual
        { IncluyeAsig_Id: 1, Asignatura_Id: 2222, Asignatura_Nombre: 'Matemáticas' },
        { IncluyeAsig_Id: 2, Asignatura_Id: 2223, Asignatura_Nombre: 'Lenguaje' },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])                         // UPDATE 2222
      .mockResolvedValueOnce([{ insertId: 3 }])                             // INSERT 2225
      .mockResolvedValueOnce([{ affectedRows: 1 }])                         // DELETE 2223
      .mockResolvedValueOnce([[{ Asignatura_Nombre: 'Lenguaje' }]]);        // clases de la quitada

    await planController.editarPlan(req, res);

    const sqls = conn.execute.mock.calls.map((c) => c[0]);
    expect(sqls[8]).toContain('UPDATE incluyeasig');
    expect(conn.execute.mock.calls[8][1]).toEqual([5, 'Obligatorio', 1]);
    expect(sqls[9]).toContain('INSERT INTO incluyeasig');
    expect(sqls[10]).toContain('DELETE FROM incluyeasig');
    expect(conn.execute.mock.calls[10][1]).toEqual([2]);
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      mensaje: 'Plan educativo de 1ro Básico – 2026 actualizado correctamente',
      advertencias: ['"Lenguaje" ya no está en el plan, pero aún tiene clases programadas en el horario'],
    });
  });

  test('Rechaza una asignatura de otro tramo (422) sin modificar el plan', async () => {
    conn.execute
      .mockResolvedValueOnce([[{ Plan_Educativo_Id: 2222222 }]])
      .mockResolvedValueOnce([[{ Nivel_Educativo_Nombre: '1ro Básico' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Asignatura_Id: 2222 }, { Asignatura_Id: 2225 }]])
      .mockResolvedValueOnce([[{ nombre: '1ro Básico', tramo: 'Básica' }]])
      .mockResolvedValueOnce([[{ id: 2225, nombre: 'Ciencias Naturales', tramo: 'Media' }]]);

    await planController.editarPlan(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toBe(
      '1ro Básico es del tramo Básica: la asignatura "Ciencias Naturales" (Media) es de otro tramo y no se puede incluir'
    );
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.execute.mock.calls.some(([sql]) => /UPDATE plan_educativo/.test(sql))).toBe(false);
  });
});
