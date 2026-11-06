const controller = require('../controllers/apoderadosEstudianteController');
const estudianteController = require('../controllers/estudianteController');
const pool = require('../config/db');

jest.mock('../config/db');

const ESTUDIANTE = { Estudiante_Id: 222222222, Estudiante_Nombre_Completo: 'Diego Perez', Curso_Id: 222, Curso_Nombre: '1ero Básico A' };
const usuario = (id, nombre, extra = {}) => ({
  Usuario_Id: id,
  Usuario_Nombre_Completo: nombre,
  Usuario_RUT: `${id}-0`,
  Usuario_Telefono: `9${id}`,
  Usuario_Correo: `u${id}@correo.cl`,
  Usuario_Estado_Cuenta: 1,
  ...extra,
});

/** Mocks de obtenerApoderadosEstudiante: estudiante, titular (si hay) y suplentes */
function mockApoderados({ titular = usuario(4, 'Pedro Fernandez'), suplentes = [] } = {}) {
  pool.query.mockResolvedValueOnce([[{ ...ESTUDIANTE, Apoderado_Usuario_Id: titular ? titular.Usuario_Id : null }]]);
  if (titular) pool.query.mockResolvedValueOnce([[titular]]);
  pool.query.mockResolvedValueOnce([suplentes]);
}

const apoderadoBD = (id, nombre, extra = {}) => ({
  Usuario_Id: id, Usuario_Nombre_Completo: nombre, Es_Apoderado: 1, Usuario_Estado_Cuenta: 1, ...extra,
});

describe('Pruebas Unitarias - CU90/CU91: Apoderado titular y suplentes (RF57)', () => {
  let req;
  let res;
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { estudianteId: '222222222' }, query: {}, body: {}, user: { id: 2, roles: ['Administrador'] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    conn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
    };
    pool.getConnection = jest.fn().mockResolvedValue(conn);
    pool.query = jest.fn();
  });

  describe('validarDesignacion', () => {
    test('normaliza titular y suplentes', () => {
      expect(controller.validarDesignacion({ titularId: '4', suplenteIds: ['8', 9] })).toEqual({
        titularId: 4, suplenteIds: [8, 9],
      });
    });

    test('CU90 Excepción 2: ningún titular', () => {
      expect(controller.validarDesignacion({ suplenteIds: [8] }).error)
        .toBe('Debes designar un apoderado titular: cada estudiante tiene exactamente uno');
    });

    test('CU90 Excepción 2: dos titulares', () => {
      expect(controller.validarDesignacion({ titularId: [4, 8] }).error)
        .toBe('Un estudiante tiene un único apoderado titular: selecciona solo uno');
    });

    test('máximo 4 suplentes, sin repetidos y sin incluir al titular', () => {
      expect(controller.validarDesignacion({ titularId: 4, suplenteIds: [5, 6, 7, 8, 9] }).error)
        .toBe('Un estudiante puede tener como máximo 4 apoderados suplentes');
      expect(controller.validarDesignacion({ titularId: 4, suplenteIds: [5, 6, 7, 8] }).error).toBeUndefined();
      expect(controller.validarDesignacion({ titularId: 4, suplenteIds: [8, 8] }).error)
        .toBe('Un mismo apoderado no puede figurar dos veces como suplente');
      expect(controller.validarDesignacion({ titularId: 4, suplenteIds: [4] }).error)
        .toBe('El apoderado titular no puede ser también suplente del mismo estudiante');
    });
  });

  test('CU90: muestra titular, suplentes y el máximo permitido', async () => {
    mockApoderados({ suplentes: [usuario(8, 'Luis Ramos')] });

    await controller.getApoderadosEstudiante(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      titular: expect.objectContaining({ Usuario_Id: 4 }),
      suplentes: [expect.objectContaining({ Usuario_Id: 8 })],
      maxSuplentes: 4,
    }));
  });

  test('CU90 Excepción 2: rechaza la designación sin titular antes de tocar la BD', async () => {
    req.body = { titularId: null, suplenteIds: [8] };

    await controller.designarApoderados(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('CU90: rechaza un suplente que no tiene rol de apoderado', async () => {
    req.body = { titularId: 4, suplenteIds: [3] };
    mockApoderados();
    pool.query.mockResolvedValueOnce([[apoderadoBD(4, 'Pedro Fernandez'), apoderadoBD(3, 'María Morales', { Es_Apoderado: 0 })]]);

    await controller.designarApoderados(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'María Morales no tiene rol de apoderado' });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('CU90: rechaza un apoderado con la cuenta inactiva', async () => {
    req.body = { titularId: 4, suplenteIds: [9] };
    mockApoderados();
    pool.query.mockResolvedValueOnce([[apoderadoBD(4, 'Pedro Fernandez'), apoderadoBD(9, 'Sandra Vera', { Usuario_Estado_Cuenta: 0 })]]);

    await controller.designarApoderados(req, res);

    expect(res.json).toHaveBeenCalledWith({ mensaje: 'La cuenta de Sandra Vera está inactiva' });
  });

  test('CU90 Flujo correcto: agrega suplentes y lo registra en el historial', async () => {
    req.body = { titularId: 4, suplenteIds: [8, 9] };
    mockApoderados();
    pool.query.mockResolvedValueOnce([[apoderadoBD(4, 'Pedro Fernandez'), apoderadoBD(8, 'Luis Ramos'), apoderadoBD(9, 'Sandra Vera')]]);

    await controller.designarApoderados(req, res);

    const sqls = conn.query.mock.calls.map((c) => c[0]);
    // El titular no cambió: no se actualiza estudiante
    expect(sqls.some((s) => s.includes('UPDATE estudiante'))).toBe(false);
    expect(conn.query.mock.calls[0]).toEqual(['DELETE FROM apoderado_suplente WHERE Estudiante_Id = ?', [222222222]]);
    expect(conn.query.mock.calls[1][1]).toEqual([[[222222222, 8], [222222222, 9]]]);
    const historial = conn.query.mock.calls[2];
    expect(historial[0]).toContain('INSERT INTO historial');
    expect(historial[1]).toEqual(['—', 'Designación de apoderados suplentes', 'apoderado_suplente', 'Luis Ramos, Sandra Vera', 222222222, 2]);
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Designación de apoderados guardada correctamente' });
  });

  test('CU90: intercambiar titular y suplente actualiza ambos y registra dos cambios', async () => {
    req.body = { titularId: 8, suplenteIds: [4] };
    mockApoderados({ suplentes: [usuario(8, 'Luis Ramos')] });
    pool.query.mockResolvedValueOnce([[apoderadoBD(8, 'Luis Ramos'), apoderadoBD(4, 'Pedro Fernandez')]]);

    await controller.designarApoderados(req, res);

    expect(conn.query.mock.calls[0]).toEqual(['UPDATE estudiante SET Apoderado_Usuario_Id = ? WHERE Estudiante_Id = ?', [8, 222222222]]);
    const historiales = conn.query.mock.calls.filter((c) => c[0].includes('INSERT INTO historial'));
    expect(historiales.map((h) => h[1].slice(0, 4))).toEqual([
      ['Pedro Fernandez', 'Designación de apoderado titular', 'Apoderado_Usuario_Id', 'Luis Ramos'],
      ['Luis Ramos', 'Designación de apoderados suplentes', 'apoderado_suplente', 'Pedro Fernandez'],
    ]);
  });

  test('CU90: sin cambios no abre transacción', async () => {
    req.body = { titularId: 4, suplenteIds: [8] };
    mockApoderados({ suplentes: [usuario(8, 'Luis Ramos')] });
    pool.query.mockResolvedValueOnce([[apoderadoBD(4, 'Pedro Fernandez'), apoderadoBD(8, 'Luis Ramos')]]);

    await controller.designarApoderados(req, res);

    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No hay cambios en la designación de apoderados' });
  });

  test('CU90: si falla la BD se revierte la transacción', async () => {
    req.body = { titularId: 4, suplenteIds: [8] };
    mockApoderados();
    pool.query.mockResolvedValueOnce([[apoderadoBD(4, 'Pedro Fernandez'), apoderadoBD(8, 'Luis Ramos')]]);
    conn.query.mockRejectedValueOnce(new Error('fallo'));

    await controller.designarApoderados(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  describe('CU91: contactos del titular y suplentes', () => {
    test('el docente del curso ve nombre, correo y teléfono de ambos', async () => {
      req.user = { id: 3, roles: ['Docente'] };
      mockApoderados({ suplentes: [usuario(8, 'Luis Ramos')] });
      pool.query.mockResolvedValueOnce([[{ 1: 1 }]]); // imparte clases en el curso

      await controller.getContactosApoderados(req, res);

      expect(pool.query.mock.calls[3][1]).toEqual([3, 222]);
      const respuesta = res.json.mock.calls[0][0];
      expect(respuesta.titular).toEqual({
        Usuario_Id: 4, Usuario_Nombre_Completo: 'Pedro Fernandez', Usuario_Correo: 'u4@correo.cl', Usuario_Telefono: '94',
      });
      expect(respuesta.suplentes).toHaveLength(1);
      // No se exponen datos que el CU no pide (RUT, estado de la cuenta)
      expect(respuesta.titular.Usuario_RUT).toBeUndefined();
    });

    test('Excepción 1: sin suplentes se muestra solo el titular', async () => {
      mockApoderados();

      await controller.getContactosApoderados(req, res);

      expect(res.json.mock.calls[0][0].suplentes).toEqual([]);
    });

    test('Excepción 2: el docente que no imparte clases al estudiante no ve los contactos', async () => {
      req.user = { id: 6, roles: ['Docente'] };
      mockApoderados();
      pool.query.mockResolvedValueOnce([[]]);

      await controller.getContactosApoderados(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json.mock.calls[0][0].mensaje).toContain('No impartes clases a este estudiante');
    });

    test('un apoderado no puede consultar los contactos', async () => {
      req.user = { id: 4, roles: ['Apoderado'] };

      await controller.getContactosApoderados(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('Flujos de asociación existentes con suplentes', () => {
    // Las escrituras de CU9 y CU39 van en una transacción (conn) junto con el historial.
    const mockConexion = () => {
      const conn = {
        query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
      };
      pool.getConnection = jest.fn().mockResolvedValue(conn);
      return conn;
    };

    test('CU39: al asignar como titular a un suplente, deja de ser suplente', async () => {
      req.params = { estudianteId: '222222222' };
      req.body = { apoderadoId: 8 };
      req.user = { id: 1, roles: ['Administrador'] };
      pool.query
        .mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Apoderado_Usuario_Id: 4 }]])
        .mockResolvedValueOnce([[{ Usuario_Id: 8, Usuario_Estado_Cuenta: 1 }]]);
      const conn = mockConexion();

      await estudianteController.editarAsociaciones(req, res);

      expect(conn.query.mock.calls.map(([sql, params]) => [sql, params])).toContainEqual([
        'DELETE FROM apoderado_suplente WHERE Estudiante_Id = ? AND Suplente_Usuario_Id = ?', ['222222222', 8],
      ]);
      expect(conn.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Asociaciones actualizadas correctamente' });
    });

    test('CU9: eliminar todas las asociaciones también quita las suplencias', async () => {
      req.params = { apoderadoId: 8 };
      req.user = { id: 1, roles: ['Administrador'] };
      pool.query.mockResolvedValueOnce([[{ Usuario_Id: 8, Usuario_Estado_Cuenta: 1, Es_Apoderado: 1 }]]);
      const conn = mockConexion();
      conn.query
        .mockResolvedValueOnce([[{ Estudiante_Id: 222222222 }]]) // titular de
        .mockResolvedValueOnce([[{ Estudiante_Id: 222222224 }]]) // suplente de
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE titular
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE suplencias

      await estudianteController.eliminarTodasAsociacionesApoderado(req, res);

      expect(conn.query.mock.calls[1][0]).toContain('apoderado_suplente');
      expect(conn.query.mock.calls[3][0]).toBe('DELETE FROM apoderado_suplente WHERE Suplente_Usuario_Id = ?');
      expect(conn.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ eliminadas: 2 }));
    });

    test('CU40: el apoderado ve también los estudiantes de los que es suplente', async () => {
      req.user = { id: 8, roles: ['Apoderado'] };
      req.params = { apoderadoId: '8' };
      pool.query.mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Rol_Apoderado: 'Suplente' }]]);

      await estudianteController.getEstudiantesAsociados(req, res);

      expect(pool.query.mock.calls[0][0]).toContain('apoderado_suplente');
      expect(pool.query.mock.calls[0][1]).toEqual([8, 8, 8]);
      expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ Rol_Apoderado: 'Suplente' })]);
    });
  });
});
