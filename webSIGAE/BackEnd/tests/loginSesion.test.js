// Login y tabla `sesion`:
// - cada inicio de sesión genera un token distinto, aunque el mismo usuario entre
//   dos veces en el mismo segundo (Sesion_Token_Acceso es UNIQUE);
// - en `sesion` se guarda el hash SHA-256 del token (64 caracteres), que cabe en
//   la columna varchar(255) aunque el JWT sea más largo.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { login, logout } = require('../controllers/authController');
const { hashToken } = require('../utils/sesion');

jest.mock('../config/db');

describe('Login: un token único por sesión', () => {
  let hash;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto_de_prueba_para_jest_de_al_menos_32_chars';
    hash = await bcrypt.hash('Clave#2026', 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-11-05T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    pool.execute.mockImplementation(async (sql) => {
      if (/FROM usuario/.test(sql)) {
        return [[{
          Usuario_Id: 7, Usuario_RUT: '11111111-1', Usuario_Contraseña: hash,
          Usuario_Nombre_Completo: 'Prueba', Usuario_Estado_Cuenta: 1,
          Es_Administrador: 1, Administrador_Tipo: 'Administrador', Administrador_Correo_Institucional: 'a@b.cl',
          Es_Docente: 0, Docente_Correo_Institucional: null, Es_Apoderado: 0, Apoderado_Correo_Natural: null,
        }]];
      }
      return [{ affectedRows: 1 }];
    });
  });

  afterEach(() => jest.useRealTimers());

  const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
  const req = () => ({ body: { rut: '11111111-1', password: 'Clave#2026' }, headers: {}, ip: '127.0.0.1' });

  test('Dos logins en el mismo segundo producen tokens distintos', async () => {
    const r1 = nuevoRes();
    const r2 = nuevoRes();
    await login(req(), r1);
    await login(req(), r2);

    const t1 = r1.json.mock.calls[0][0].token;
    const t2 = r2.json.mock.calls[0][0].token;
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(jwt.decode(t1).iat).toBe(jwt.decode(t2).iat); // mismo segundo
    expect(t1).not.toBe(t2);

    // En `sesion` se guarda el hash de cada token devuelto, nunca el token
    const inserts = pool.execute.mock.calls.filter(([sql]) => /INSERT INTO sesion/.test(sql));
    expect(inserts.map(([, params]) => params[0])).toEqual([hashToken(t1), hashToken(t2)]);
  });

  test('Un JWT de más de 255 caracteres se guarda como hash de 64', async () => {
    pool.execute.mockImplementation(async (sql) => {
      if (/FROM usuario/.test(sql)) {
        return [[{
          Usuario_Id: 1500, Usuario_RUT: '12345678-9', Usuario_Contraseña: hash,
          Usuario_Nombre_Completo: 'Prueba', Usuario_Estado_Cuenta: 1,
          Es_Administrador: 1, Administrador_Tipo: 'Super Admin', Administrador_Correo_Institucional: 'a@b.cl',
          Es_Docente: 1, Docente_Correo_Institucional: 'd@b.cl', Es_Apoderado: 1, Apoderado_Correo_Natural: 'p@b.cl',
        }]];
      }
      return [{ affectedRows: 1 }];
    });
    const r = nuevoRes();
    await login(req(), r);
    const token = r.json.mock.calls[0][0].token;
    expect(token.length).toBeGreaterThan(255);
    const [, params] = pool.execute.mock.calls.find(([sql]) => /INSERT INTO sesion/.test(sql));
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  test('Logout cierra la sesión buscando por el hash del token', async () => {
    const r = nuevoRes();
    await logout({ headers: { authorization: 'Bearer abc.def.ghi' } }, r);
    const [sql, params] = pool.execute.mock.calls.at(-1);
    expect(sql).toMatch(/UPDATE sesion/);
    expect(params).toEqual([hashToken('abc.def.ghi')]);
  });

  test('El token sigue verificándose con JWT_SECRET y trae jti', async () => {
    const r = nuevoRes();
    await login(req(), r);
    const decoded = jwt.verify(r.json.mock.calls[0][0].token, process.env.JWT_SECRET);
    expect(decoded).toEqual(expect.objectContaining({ id: 7, roles: ['Administrador'] }));
    expect(decoded.jti).toMatch(/^[0-9a-f-]{36}$/);
  });
});
