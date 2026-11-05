const estudianteController = require('../controllers/estudianteController');
const db = require('../config/db');

jest.mock('../config/db');

describe('Pruebas Unitarias - CU40: Estudiantes Asociados a un Apoderado', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('El apoderado ve su propia lista de estudiantes asociados', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.apoderadoId = '4';

    db.query.mockResolvedValueOnce([[
      { Estudiante_Id: 1, Estudiante_Nombre_Completo: 'Diego Perez', Estudiante_RUT: '1-9', Estudiante_Estado_Academico: 'Regular', Curso_Nombre: '1ero Básico A' },
    ]]);

    await estudianteController.getEstudiantesAsociados(req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ Estudiante_Nombre_Completo: 'Diego Perez' }),
    ]);
    // No debe validar existencia del apoderado en `usuario`: usa su propio id directamente
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('Un Administrador puede consultar los estudiantes de otro apoderado', async () => {
    req.user = { id: 1, roles: ['Administrador'] };
    req.params.apoderadoId = '4';

    db.query
      .mockResolvedValueOnce([[{ Usuario_Id: 4 }]]) // validación de existencia del apoderado
      .mockResolvedValueOnce([[
        { Estudiante_Id: 1, Estudiante_Nombre_Completo: 'Diego Perez', Estudiante_RUT: '1-9', Estudiante_Estado_Academico: 'Regular', Curso_Nombre: '1ero Básico A' },
      ]]);

    await estudianteController.getEstudiantesAsociados(req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ Estudiante_Nombre_Completo: 'Diego Perez' }),
    ]);
  });

  test('Retorna 403 si el actor no es Apoderado ni Administrador', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.params.apoderadoId = '4';

    await estudianteController.getEstudiantesAsociados(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No tienes permiso para consultar esta información' });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Excepción 1: retorna 200 con mensaje informativo si no hay estudiantes asociados', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.apoderadoId = '4';

    db.query.mockResolvedValueOnce([[]]);

    await estudianteController.getEstudiantesAsociados(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      mensaje: 'No existen estudiantes asociados a la cuenta',
      estudiantes: [],
    });
  });

  test('Excepción 2: Admin consulta un apoderado que no existe', async () => {
    req.user = { id: 1, roles: ['Administrador'] };
    req.params.apoderadoId = '999';

    db.query.mockResolvedValueOnce([[]]);

    await estudianteController.getEstudiantesAsociados(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'El apoderado no fue encontrado' });
  });

  test('Excepción 3: retorna 500 ante un error técnico en la consulta', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.apoderadoId = '4';

    db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

    await estudianteController.getEstudiantesAsociados(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No fue posible cargar estudiantes, reintente más tarde' });
  });
});

describe('Pruebas Unitarias - CU39: Editar Asociaciones de un Estudiante', () => {
  let req;
  let res;
  let conn;

  const insertsHistorial = () =>
    conn.query.mock.calls.filter(([sql]) => /INSERT INTO historial/.test(sql));

  beforeEach(() => {
    jest.clearAllMocks();
    conn = {
      query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]), // UPDATE e INSERT historial
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);
    req = { params: {}, body: {}, user: { id: 1 } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('Debe reasignar el apoderado exitosamente', async () => {
    req.params.estudianteId = 1;
    req.body = { apoderadoId: 7 };

    db.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 1, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[{ Usuario_Id: 7, Usuario_Estado_Cuenta: 1 }]]);

    await estudianteController.editarAsociaciones(req, res);

    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Asociaciones actualizadas correctamente' });
    // Registra trazabilidad: de apoderado 4 a apoderado 7, hecho por el usuario 1
    const inserts = insertsHistorial();
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['4', expect.stringContaining('CU39'), 'Apoderado_Usuario_Id', '7', 4, 1, null, null, 1]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('Si la asociación cambió entre la lectura y el UPDATE, responde 409 sin registrar historial', async () => {
    req.params.estudianteId = 1;
    req.body = { apoderadoId: 7 };

    db.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 1, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[{ Usuario_Id: 7, Usuario_Estado_Cuenta: 1 }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    await estudianteController.editarAsociaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(conn.rollback).toHaveBeenCalled();
    expect(insertsHistorial()).toHaveLength(0);
  });

  test('CU39 - Excepción "Elimina última asociación": pide confirmación adicional sin ejecutar el UPDATE', async () => {
    req.params.estudianteId = 1;
    req.body = { apoderadoId: null };

    db.query.mockResolvedValueOnce([[{ Estudiante_Id: 1, Apoderado_Usuario_Id: 4 }]]);

    await estudianteController.editarAsociaciones(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requiereConfirmacion: true })
    );
  });

  test('Debe eliminar la asociación (apoderadoId: null) cuando el frontend ya confirmó', async () => {
    req.params.estudianteId = 1;
    req.body = { apoderadoId: null, confirmarEliminacion: true };

    db.query.mockResolvedValueOnce([[{ Estudiante_Id: 1, Apoderado_Usuario_Id: 4 }]]);

    await estudianteController.editarAsociaciones(req, res);

    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Asociaciones actualizadas correctamente' });
    const inserts = insertsHistorial();
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1].slice(0, 4)).toEqual(['4', expect.stringContaining('eliminación'), 'Apoderado_Usuario_Id', 'NULL']);
  });

  test('Retorna 404 si la ficha de estudiante no existe', async () => {
    req.params.estudianteId = 999;
    req.body = { apoderadoId: 7 };

    db.query.mockResolvedValueOnce([[]]);

    await estudianteController.editarAsociaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Ficha de estudiante no encontrada' });
  });

  test('Excepción: retorna 400 si el apoderado ya se encuentra vinculado (evita duplicar)', async () => {
    req.params.estudianteId = 1;
    req.body = { apoderadoId: 4 };

    db.query.mockResolvedValueOnce([[{ Estudiante_Id: 1, Apoderado_Usuario_Id: 4 }]]);

    await estudianteController.editarAsociaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'La asociación ya existe, no se duplicará el registro' });
  });

  test('Retorna 404 si el nuevo apoderado indicado no existe', async () => {
    req.params.estudianteId = 1;
    req.body = { apoderadoId: 999 };

    db.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 1, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[]]);

    await estudianteController.editarAsociaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Apoderado no encontrado' });
  });

  test('Retorna 400 si el nuevo apoderado está inactivo', async () => {
    req.params.estudianteId = 1;
    req.body = { apoderadoId: 7 };

    db.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 1, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[{ Usuario_Id: 7, Usuario_Estado_Cuenta: 0 }]]);

    await estudianteController.editarAsociaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'El apoderado seleccionado está inactivo' });
  });

  test('Retorna 400 si no se indica apoderadoId en el cuerpo', async () => {
    req.params.estudianteId = 1;
    req.body = {};

    await estudianteController.editarAsociaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Pruebas Unitarias - CU41: Detalle de Estudiante desde la Lista de Asociados', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('El apoderado ve el detalle de un estudiante propio', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params = { apoderadoId: '4', estudianteId: '1' };

    db.query.mockResolvedValueOnce([[
      { Estudiante_Id: 1, Estudiante_Nombre_Completo: 'Diego Perez', Estudiante_RUT: '1-9', Estudiante_Estado_Academico: 'Regular', Curso_Nombre: '1ero Básico A' },
    ]]);

    await estudianteController.getDetalleEstudiante(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ Estudiante_Nombre_Completo: 'Diego Perez' })
    );
  });

  test('Un Administrador puede consultar el detalle desde el contexto de cualquier apoderado', async () => {
    req.user = { id: 1, roles: ['Administrador'] };
    req.params = { apoderadoId: '4', estudianteId: '1' };

    db.query.mockResolvedValueOnce([[
      { Estudiante_Id: 1, Estudiante_Nombre_Completo: 'Diego Perez', Estudiante_RUT: '1-9', Estudiante_Estado_Academico: 'Regular', Curso_Nombre: '1ero Básico A' },
    ]]);

    await estudianteController.getDetalleEstudiante(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ Estudiante_Nombre_Completo: 'Diego Perez' })
    );
  });

  test('Retorna 403 si el actor no es Apoderado ni Administrador', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.params = { apoderadoId: '4', estudianteId: '1' };

    await estudianteController.getDetalleEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Excepción "Acceso directo sin permisos": un Apoderado no puede pedir el detalle bajo el contexto de otro apoderado, sin tocar la BD', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params = { apoderadoId: '999', estudianteId: '1' };

    await estudianteController.getDetalleEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No tienes permiso para visualizar este estudiante' });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Excepción: el estudiante ya no se encuentra asociado a esa cuenta', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params = { apoderadoId: '4', estudianteId: '1' };

    db.query.mockResolvedValueOnce([[]]);

    await estudianteController.getDetalleEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'El estudiante ya no se encuentra asociado a esta cuenta' });
  });

  test('Excepción: error técnico retorna 500', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params = { apoderadoId: '4', estudianteId: '1' };

    db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

    await estudianteController.getDetalleEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No fue posible cargar la ficha estudiantil, reintente más tarde' });
  });
});
