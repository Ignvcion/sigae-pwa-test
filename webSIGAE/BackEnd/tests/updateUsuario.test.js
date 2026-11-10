const usuarioController = require('../controllers/usuarioController');
const db = require('../config/db');

jest.mock('../config/db');

describe('updateUsuario - validaciones del Glosario 6.1.2', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.resetAllMocks();
    req = {
      params: { id: '8' },
      user: { id: 1, roles: ['Administrador'], administradorTipo: 'Super Admin' },
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('Una contraseña nueva válida se guarda hasheada con bcrypt, nunca en texto plano', async () => {
    req.body = { Usuario_Contraseña: 'Colegio2026' };
    db.query
      .mockResolvedValueOnce(objetivo())
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ Usuario_Id: 8, Usuario_Contraseña: 'hash' }]]);

    await usuarioController.updateUsuario(req, res);

    const [sql, valores] = db.query.mock.calls[1];
    expect(sql).toContain('Usuario_Contraseña = ?');
    expect(valores).not.toContain('Colegio2026');
    expect(valores.find((v) => String(v).startsWith('$2b$'))).toBeDefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  const objetivo = (extra = {}) => [[{ Es_Administrador: 0, Administrador_Tipo: null, Es_Apoderado: 1, ...extra }]];

  test('normaliza el teléfono +56 a 9 dígitos y actualiza la dirección estructurada', async () => {
    req.body = {
      Usuario_Telefono: '+56945678901',
      Usuario_Direccion_Calle: 'Calle Los Pinos',
      Usuario_Direccion_Numero: '456',
      Usuario_Direccion_Depto: '',
      Usuario_Direccion_Comuna: 'Santiago',
    };
    db.query
      .mockResolvedValueOnce(objetivo())
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ Usuario_Id: 8, Usuario_Contraseña: 'hash' }]]);

    await usuarioController.updateUsuario(req, res);

    const [sql, valores] = db.query.mock.calls[1];
    expect(sql).toContain('Usuario_Telefono = ?');
    expect(sql).toContain('Usuario_Direccion_Comuna = ?');
    expect(valores).toEqual(['945678901', 'Calle Los Pinos', '456', null, 'Santiago', '8']);
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each([
    [{ Usuario_Telefono: '9456-78901' }, 'El número telefónico debe tener 9 dígitos, opcionalmente con prefijo +56'],
    [{ Usuario_Nombre_Completo: 'Luis' }, 'El nombre completo debe contener solo letras y espacios (nombre y apellido, máx. 100 caracteres)'],
    [{ Apoderado_Correo_Natural: 'luis@' }, 'El correo del apoderado debe tener el formato usuario@dominio'],
    [{ Usuario_Direccion_Comuna: '' }, 'La comuna es obligatoria'],
    // Una contraseña nueva cumple las mismas reglas que al crear el usuario
    [{ Usuario_Contraseña: '1' }, 'La contraseña debe tener al menos 8 caracteres'],
    [{ Usuario_Contraseña: 'sinmayuscula1' }, 'La contraseña debe contener al menos una mayúscula'],
  ])('rechaza %p sin ejecutar el UPDATE', async (body, mensaje) => {
    req.body = body;
    db.query.mockResolvedValueOnce(objetivo());

    await usuarioController.updateUsuario(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje });
  });

  test('actualiza la dirección de un usuario que no es apoderado', async () => {
    req.body = { Usuario_Direccion_Calle: 'Los Aromos', Usuario_Direccion_Numero: '45', Usuario_Direccion_Comuna: 'Ñuñoa' };
    db.query
      .mockResolvedValueOnce(objetivo({ Es_Apoderado: 0 }))
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ Usuario_Id: 8, Usuario_Contraseña: 'hash' }]]);

    await usuarioController.updateUsuario(req, res);

    const [sql, valores] = db.query.mock.calls[1];
    expect(sql).toContain('Usuario_Direccion_Calle = ?');
    expect(sql).toContain('Usuario_Direccion_Comuna = ?');
    expect(valores).toEqual(['Los Aromos', '45', 'Ñuñoa', '8']);
  });
});
