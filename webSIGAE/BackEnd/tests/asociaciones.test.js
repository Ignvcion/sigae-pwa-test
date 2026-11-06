const estudianteController = require('../controllers/estudianteController');
const db = require('../config/db');

jest.mock('../config/db');

// Conexión de transacción simulada: el UPDATE y el INSERT en historial pasan por aquí.
function mockConexion() {
  const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  db.getConnection = jest.fn().mockResolvedValue(conn);
  return conn;
}

const insertsHistorial = (conn) =>
  conn.query.mock.calls.filter(([sql]) => /INSERT INTO historial/.test(sql));

describe('Pruebas Unitarias - CU9 y CU10: Gestión de Asociaciones Apoderado-Estudiante', () => {
  let req;
  let res;
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    conn = mockConexion();
    req = { params: {}, body: {}, user: { id: 1 } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // CU9: Eliminar todas las asociaciones activas
  describe('CU9 - eliminarTodasAsociacionesApoderado', () => {
    test('Debe eliminar todas las asociaciones exitosamente', async () => {
      req.params.apoderadoId = 5;

      db.query.mockResolvedValueOnce([
        [{ Usuario_Id: 5, Usuario_Nombre_Completo: 'Juan Perez', Usuario_Estado_Cuenta: 1, Es_Apoderado: 1 }]
      ]);
      conn.query
        .mockResolvedValueOnce([[{ Estudiante_Id: 1 }, { Estudiante_Id: 2 }]]) // titular: SELECT ... FOR UPDATE
        .mockResolvedValueOnce([[]]) // suplente: SELECT ... FOR UPDATE
        .mockResolvedValueOnce([{ affectedRows: 2 }]) // UPDATE
        .mockResolvedValueOnce([{ affectedRows: 0 }]) // DELETE suplencias
        .mockResolvedValue([{ affectedRows: 1 }]); // INSERT historial

      await estudianteController.eliminarTodasAsociacionesApoderado(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mensaje: 'Todas las asociaciones activas fueron eliminadas exitosamente',
          eliminadas: 2,
        })
      );
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    test('Registra trazabilidad en historial: una fila por estudiante desvinculado', async () => {
      req.params.apoderadoId = 5;
      db.query.mockResolvedValueOnce([
        [{ Usuario_Id: 5, Usuario_RUT: '15.555.555-5', Usuario_Nombre_Completo: 'Juan Perez', Usuario_Estado_Cuenta: 1, Es_Apoderado: 1 }]
      ]);
      conn.query
        .mockResolvedValueOnce([[{ Estudiante_Id: 1 }, { Estudiante_Id: 2 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValue([{ affectedRows: 1 }]);

      await estudianteController.eliminarTodasAsociacionesApoderado(req, res);

      const inserts = insertsHistorial(conn);
      expect(inserts).toHaveLength(2);
      // [anterior, descripcion, atributo, nuevo, Usuario_Id, Estudiante_Id, Citacion_Id, Horario_Asignatura_Id, Responsable]
      // Persona como "RUT sin DV (Nombre)"; sin apoderado = "—"
      expect(inserts[0][1]).toEqual(['15555555 (Juan Perez)', expect.stringContaining('CU9'), 'Apoderado_Usuario_Id', '—', 5, 1, null, null, 1]);
      expect(inserts[1][1][5]).toBe(2);
    });

    test('Si falla el registro en historial se revierte todo (rollback) y responde 500', async () => {
      req.params.apoderadoId = 5;
      db.query.mockResolvedValueOnce([
        [{ Usuario_Id: 5, Usuario_Nombre_Completo: 'Juan Perez', Usuario_Estado_Cuenta: 1, Es_Apoderado: 1 }]
      ]);
      conn.query
        .mockResolvedValueOnce([[{ Estudiante_Id: 1 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockRejectedValueOnce(new Error('Fallo al insertar historial'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await estudianteController.eliminarTodasAsociacionesApoderado(req, res);

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      console.error.mockRestore();
    });

    test('Excepción 1: Retorna 400 si el apoderado no tiene asociaciones activas', async () => {
      req.params.apoderadoId = 5;

      db.query.mockResolvedValueOnce([
        [{ Usuario_Id: 5, Usuario_Nombre_Completo: 'Juan Perez', Usuario_Estado_Cuenta: 1, Es_Apoderado: 1 }]
      ]);
      conn.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

      await estudianteController.eliminarTodasAsociacionesApoderado(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        mensaje: 'No existen asociaciones disponibles para eliminar',
      });
      expect(conn.rollback).toHaveBeenCalled();
      expect(insertsHistorial(conn)).toHaveLength(0);
    });

    test('Retorna 404 si el apoderado no existe', async () => {
      req.params.apoderadoId = 999;
      db.query.mockResolvedValueOnce([[]]);

      await estudianteController.eliminarTodasAsociacionesApoderado(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Apoderado no encontrado' });
    });
  });

  // CU10: Eliminar asociación específica
  describe('CU10 - eliminarAsociacionEspecifica', () => {
    test('Debe eliminar la asociación del estudiante exitosamente', async () => {
      req.params.estudianteId = 10;

      db.query.mockResolvedValueOnce([
        [{ Estudiante_Id: 10, Estudiante_Nombre_Completo: 'Lucas Silva', Apoderado_Usuario_Id: 5 }]
      ]);
      conn.query
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
        .mockResolvedValueOnce([[{ Usuario_Id: 5, Usuario_RUT: '15.555.555-5', Usuario_Nombre_Completo: 'Juan Perez' }]]) // RUT y nombre
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT historial

      await estudianteController.eliminarAsociacionEspecifica(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mensaje: 'Asociación específica eliminada exitosamente',
          estudiante: 'Lucas Silva',
        })
      );
      const inserts = insertsHistorial(conn);
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1]).toEqual(['15555555 (Juan Perez)', expect.stringContaining('CU10'), 'Apoderado_Usuario_Id', '—', 5, 10, null, null, 1]);
      expect(conn.commit).toHaveBeenCalled();
    });

    test('Si otro usuario cambió la asociación entre medio, no registra nada y responde 400', async () => {
      req.params.estudianteId = 10;
      db.query.mockResolvedValueOnce([
        [{ Estudiante_Id: 10, Estudiante_Nombre_Completo: 'Lucas Silva', Apoderado_Usuario_Id: 5 }]
      ]);
      conn.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      await estudianteController.eliminarAsociacionEspecifica(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(conn.rollback).toHaveBeenCalled();
      expect(insertsHistorial(conn)).toHaveLength(0);
    });

    test('Excepción 1: Retorna 400 si el estudiante no tenía apoderado asociado', async () => {
      req.params.estudianteId = 10;

      db.query.mockResolvedValueOnce([
        [{ Estudiante_Id: 10, Estudiante_Nombre_Completo: 'Lucas Silva', Apoderado_Usuario_Id: null }]
      ]);

      await estudianteController.eliminarAsociacionEspecifica(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        mensaje: 'No fue posible completar la eliminación',
      });
    });

    test('Retorna 404 si el estudiante no existe', async () => {
      req.params.estudianteId = 999;
      db.query.mockResolvedValueOnce([[]]);

      await estudianteController.eliminarAsociacionEspecifica(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Ficha de estudiante no encontrada' });
    });
  });
});