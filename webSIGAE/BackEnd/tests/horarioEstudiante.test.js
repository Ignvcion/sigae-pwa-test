const horarioController = require('../controllers/horarioController');
const pool = require('../config/db');

jest.mock('../config/db');

const estudiante = (extra = {}) => ({
  Estudiante_Id: 222222222,
  Estudiante_Nombre_Completo: 'Diego Martin Perez Castro',
  Curso_Id: 222,
  Apoderado_Usuario_Id: 4,
  Curso_Nombre: '1ero Básico A',
  ...extra,
});

describe('Horario semanal de un estudiante visto por su apoderado', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { estudianteId: '222222222' }, user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    pool.execute = jest.fn();
  });

  test('El apoderado ve el horario del curso de su estudiante', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    const horario = [
      { id: 1, asignatura: 'Matemáticas', docente: 'María Morales', dia: 'Lunes', horaInicio: '08:00:00', horaFin: '08:45:00', estado: 'Activo' },
    ];
    pool.execute
      .mockResolvedValueOnce([[estudiante()]])
      .mockResolvedValueOnce([horario]);

    await horarioController.getHorarioEstudiante(req, res);

    expect(pool.execute.mock.calls[0][1]).toEqual([222222222]);
    // Curso de las clases regulares, curso de los electivos y la ruta del estudiante (sin ruta: null)
    expect(pool.execute.mock.calls[1][1]).toEqual([222, 222, null, null]);
    expect(res.json).toHaveBeenCalledWith({
      estudiante: { id: 222222222, nombre: 'Diego Martin Perez Castro', curso: '1ero Básico A', ruta: null },
      horario,
    });
  });

  test('Un apoderado no puede ver el horario de un estudiante que no es suyo (404)', async () => {
    req.user = { id: 8, roles: ['Apoderado'] };
    pool.execute.mockResolvedValueOnce([[estudiante()]]);
    pool.query = jest.fn().mockResolvedValueOnce([[]]); // tampoco es suplente

    await horarioController.getHorarioEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('apoderado_suplente');
  });

  test('RF57: un apoderado suplente puede ver el horario del estudiante', async () => {
    req.user = { id: 8, roles: ['Apoderado'] };
    pool.execute
      .mockResolvedValueOnce([[estudiante()]])
      .mockResolvedValueOnce([[]]);
    pool.query = jest.fn().mockResolvedValueOnce([[{ 1: 1 }]]);

    await horarioController.getHorarioEstudiante(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual([222222222, 8, 8]);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });

  test('Un administrador puede ver el horario de cualquier estudiante', async () => {
    req.user = { id: 1, roles: ['Administrador'] };
    pool.execute
      .mockResolvedValueOnce([[estudiante()]])
      .mockResolvedValueOnce([[]]);

    await horarioController.getHorarioEstudiante(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      horario: [],
      mensaje: 'El curso del estudiante aún no tiene horario planificado',
    }));
  });

  test('Un docente (sin rol apoderado ni admin) recibe 403', async () => {
    req.user = { id: 3, roles: ['Docente'] };

    await horarioController.getHorarioEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('ID de estudiante inválido responde 400', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.estudianteId = 'abc';

    await horarioController.getHorarioEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Error técnico responde 500', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    pool.execute.mockRejectedValueOnce(new Error('db caída'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await horarioController.getHorarioEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
