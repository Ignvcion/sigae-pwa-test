const usuarioController = require('../controllers/usuarioController');
const db = require('../config/db');

jest.mock('../config/db');

describe('Pruebas Unitarias - CU2 y CU3: Visualización y Edición de Administradores', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // CU2: Visualizar administradores registrados
  describe('CU2 - getAdministradores', () => {
    test('Debe retornar el listado de administradores registrados', async () => {
      const mockAdmins = [
        {
          Usuario_Id: 1,
          Usuario_Nombre_Completo: 'Ana Torres',
          Usuario_Telefono: '912345678',
          Administrador_Correo_Institucional: 'ana.torres@colegiojc.cl',
          Usuario_Estado_Cuenta: 1,
          Administrador_Tipo: 'Administrador Normal',
        },
      ];
      db.query.mockResolvedValueOnce([mockAdmins]);

      await usuarioController.getAdministradores(req, res);

      expect(res.json).toHaveBeenCalledWith(mockAdmins);
    });

    test('Excepción 1: Retorna 200 con mensaje informativo si no existen administradores', async () => {
      db.query.mockResolvedValueOnce([[]]);

      await usuarioController.getAdministradores(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        mensaje: 'No existen administradores registrados en la plataforma',
        administradores: [],
      });
    });

    test('Excepción 2: Retorna 500 si ocurre un fallo técnico con la base de datos', async () => {
      db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

      await usuarioController.getAdministradores(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'La información no pudo ser encontrada' });
    });
  });

  // CU3: Editar administradores registrados
  describe('CU3 - editarAdministrador', () => {
    test('Debe actualizar correo, teléfono y estado exitosamente', async () => {
      req.params.id = 1;
      req.body = {
        Administrador_Correo_Institucional: 'nuevo.correo@colegiojc.cl',
        Usuario_Telefono: '912345678',
        Usuario_Estado_Cuenta: 1,
      };

      db.query.mockResolvedValueOnce([[{ Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal' }]]);
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      db.query.mockResolvedValueOnce([[{
        Usuario_Id: 1,
        Usuario_Nombre_Completo: 'Ana Torres',
        Usuario_Telefono: '912345678',
        Administrador_Correo_Institucional: 'nuevo.correo@colegiojc.cl',
        Usuario_Estado_Cuenta: 1,
        Administrador_Tipo: 'Administrador Normal',
      }]]);

      await usuarioController.editarAdministrador(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ mensaje: 'Cambios guardados correctamente' })
      );
    });

    test('Retorna 404 si el administrador no existe', async () => {
      req.params.id = 999;
      req.body = { Usuario_Telefono: '912345678' };

      db.query.mockResolvedValueOnce([[]]);

      await usuarioController.editarAdministrador(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Administrador no encontrado' });
    });

    test('Retorna 403 si se intenta editar a un Super Administrador', async () => {
      req.params.id = 1;
      req.body = { Usuario_Telefono: '912345678' };

      db.query.mockResolvedValueOnce([[{ Es_Administrador: 1, Administrador_Tipo: 'Super Admin' }]]);

      await usuarioController.editarAdministrador(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'No tienes permiso para editar a un Super Administrador' });
    });

    test('Excepción 1: Retorna 400 si el correo institucional no cumple el formato', async () => {
      req.params.id = 1;
      req.body = { Administrador_Correo_Institucional: 'correo@gmail.com' };

      db.query.mockResolvedValueOnce([[{ Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal' }]]);

      await usuarioController.editarAdministrador(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Ingresa un correo electrónico institucional @colegiojc.cl o @colegiojacquescousteau.cl' });
    });

    test('Cambiar el correo deja la cuenta sin verificar si el correo es distinto (se compara antes de reemplazarlo)', async () => {
      req.params.id = 1;
      req.body = { Administrador_Correo_Institucional: 'nuevo@colegiojacquescousteau.cl' };

      db.query
        .mockResolvedValueOnce([[{ Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ Usuario_Id: 1 }]]);

      await usuarioController.editarAdministrador(req, res);

      const [sql, valores] = db.query.mock.calls[1];
      expect(sql).toBe('UPDATE usuario SET Usuario_Correo_Verificado = IF(Administrador_Correo_Institucional <=> ?, '
        + 'Usuario_Correo_Verificado, 0), Administrador_Correo_Institucional = ? WHERE Usuario_Id = ?');
      expect(valores).toEqual(['nuevo@colegiojacquescousteau.cl', 'nuevo@colegiojacquescousteau.cl', 1]);
    });

    test('Excepción 1: Retorna 400 si el teléfono no respeta el estándar chileno de 9 dígitos', async () => {
      req.params.id = 1;
      req.body = { Usuario_Telefono: '12345' };

      db.query.mockResolvedValueOnce([[{ Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal' }]]);

      await usuarioController.editarAdministrador(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        mensaje: 'El número telefónico debe tener 9 dígitos, opcionalmente con prefijo +56',
      });
    });
  });
});
