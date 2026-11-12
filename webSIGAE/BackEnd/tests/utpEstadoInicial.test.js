// Etiqueta UTP, registro inactivo hasta el primer inicio de sesión y dirección
// opcional (sin cambios en la base de datos):
// - UTP se guarda en usuario.Administrador_Tipo = 'UTP' (utils/permisos.js). Un
//   administrador con UTP entra con el rol 'UTP' (pierde los permisos de
//   administrador); un docente con UTP conserva 'Docente' y suma los de la UTP.
// - Toda cuenta se registra inactiva y se activa con su primer inicio de sesión
//   (utils/primerIngreso.js).
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const mailer = require('../utils/mailer');
const { login } = require('../controllers/authController');
const usuarioController = require('../controllers/usuarioController');
const estudianteController = require('../controllers/estudianteController');
const { verifyAdmin, verifyGestionAcademica } = require('../middleware/authMiddleware');
const {
  tieneEtiquetaUTP, puedeGestionAcademica, tipoTrasCambioDeRoles,
} = require('../utils/permisos');
const { cuentaUtilizable, cuentaUtilizableSQL } = require('../utils/primerIngreso');
const { validarDireccion } = require('../middleware/validation');

jest.mock('../config/db');
jest.mock('../utils/mailer');

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const SUPER_ADMIN = { id: 1, roles: ['Administrador'], administradorTipo: 'Super Admin' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('utils/permisos', () => {
  test('la etiqueta UTP solo vale sobre un Administrador o un Docente', () => {
    expect(tieneEtiquetaUTP({ Es_Administrador: 1, Administrador_Tipo: 'UTP' })).toBe(true);
    expect(tieneEtiquetaUTP({ Es_Docente: 1, Es_Administrador: 0, Administrador_Tipo: 'UTP' })).toBe(true);
    expect(tieneEtiquetaUTP({ Es_Apoderado: 1, Administrador_Tipo: 'UTP' })).toBe(false);
    expect(tieneEtiquetaUTP({ Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal' })).toBe(false);
  });

  test('gestión académica: administrador completo o etiqueta UTP', () => {
    expect(puedeGestionAcademica({ roles: ['Administrador'] })).toBe(true);
    expect(puedeGestionAcademica({ roles: ['UTP'], utp: true })).toBe(true);
    expect(puedeGestionAcademica({ roles: ['Docente'], utp: true })).toBe(true);
    expect(puedeGestionAcademica({ roles: ['Docente'] })).toBe(false);
  });

  test('la etiqueta se conserva solo mientras el usuario sea Administrador o Docente', () => {
    expect(tipoTrasCambioDeRoles({ Es_Administrador: 0, Es_Docente: 1, Administrador_Tipo: 'UTP' })).toBe('UTP');
    expect(tipoTrasCambioDeRoles({ Es_Administrador: 0, Es_Docente: 0, Administrador_Tipo: 'UTP' })).toBeNull();
    expect(tipoTrasCambioDeRoles({ Es_Administrador: 1, Es_Docente: 0, Administrador_Tipo: null })).toBe('Administrador Normal');
    expect(tipoTrasCambioDeRoles({ Es_Administrador: 0, Es_Docente: 1, Administrador_Tipo: 'Administrador Normal' })).toBeNull();
  });
});

describe('Middleware', () => {
  const pasar = (mw, user) => {
    const next = jest.fn();
    const res = nuevoRes();
    mw({ user }, res, next);
    return next.mock.calls.length === 1 ? 'pasa' : res.status.mock.calls[0][0];
  };

  test('un administrador con UTP no pasa verifyAdmin (sus permisos se podan)', () => {
    expect(pasar(verifyAdmin, { roles: ['UTP'], utp: true })).toBe(403);
    expect(pasar(verifyAdmin, { roles: ['Administrador'] })).toBe('pasa');
  });

  test('verifyGestionAcademica admite al administrador y a la etiqueta UTP', () => {
    expect(pasar(verifyGestionAcademica, { roles: ['Administrador'] })).toBe('pasa');
    expect(pasar(verifyGestionAcademica, { roles: ['UTP'], utp: true })).toBe('pasa');
    expect(pasar(verifyGestionAcademica, { roles: ['Docente'], utp: true })).toBe('pasa');
    expect(pasar(verifyGestionAcademica, { roles: ['Docente'] })).toBe(403);
    expect(pasar(verifyGestionAcademica, { roles: ['Apoderado'] })).toBe(403);
  });
});

describe('Login', () => {
  let hash;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'secreto_de_prueba_para_jest_de_al_menos_32_chars';
    hash = await bcrypt.hash('Clave#2026', 4);
  });

  const base = () => ({
    Usuario_Id: 7, Usuario_RUT: '11111111-1', Usuario_Contraseña: hash,
    Usuario_Nombre_Completo: 'Prueba', Usuario_Estado_Cuenta: 1, Usuario_Correo_Verificado: 1,
    Es_Administrador: 0, Administrador_Tipo: null, Administrador_Correo_Institucional: null,
    Es_Docente: 0, Docente_Correo_Institucional: null, Es_Apoderado: 0, Apoderado_Correo_Natural: null,
    Espera_Primer_Ingreso: 0,
  });
  const simularUsuario = (usuario) => {
    db.execute.mockImplementation(async (sql) => {
      if (/FROM usuario/.test(sql)) return [[usuario]];
      return [{ affectedRows: 1 }];
    });
  };
  const ingresar = async () => {
    const res = nuevoRes();
    await login({ body: { rut: '11111111-1', password: 'Clave#2026' }, headers: {}, ip: '127.0.0.1' }, res);
    return res;
  };

  test('un administrador con UTP entra con el rol UTP y sin tipo de administrador', async () => {
    simularUsuario({ ...base(), Es_Administrador: 1, Administrador_Tipo: 'UTP', Administrador_Correo_Institucional: 'a@colegiojc.cl' });
    const res = await ingresar();
    const { user, token } = res.json.mock.calls[0][0];
    expect(user).toMatchObject({ roles: ['UTP'], utp: true, administradorTipo: null });
    expect(jwt.decode(token)).toMatchObject({ roles: ['UTP'], utp: true });
  });

  test('un docente con UTP conserva el rol Docente y suma la etiqueta', async () => {
    simularUsuario({ ...base(), Es_Docente: 1, Administrador_Tipo: 'UTP', Docente_Correo_Institucional: 'd@colegiojc.cl' });
    const res = await ingresar();
    expect(res.json.mock.calls[0][0].user).toMatchObject({ roles: ['Docente'], utp: true, administradorTipo: null });
  });

  test('una cuenta inactiva que espera su primer ingreso entra y queda activa', async () => {
    simularUsuario({ ...base(), Es_Apoderado: 1, Usuario_Estado_Cuenta: 0, Espera_Primer_Ingreso: 1 });
    const res = await ingresar();
    expect(res.json.mock.calls[0][0].token).toBeDefined();
    const activar = db.execute.mock.calls.find(([sql]) => /UPDATE usuario SET Usuario_Estado_Cuenta = 1/.test(sql));
    expect(activar[1]).toEqual([7]);
  });

  test('una cuenta desactivada que ya ingresó antes no puede entrar', async () => {
    simularUsuario({ ...base(), Es_Apoderado: 1, Usuario_Estado_Cuenta: 0, Espera_Primer_Ingreso: 0 });
    const res = await ingresar();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.execute.mock.calls.some(([sql]) => /INSERT INTO sesion/.test(sql))).toBe(false);
  });

  test('una cuenta activa no se vuelve a actualizar al entrar', async () => {
    simularUsuario({ ...base(), Es_Apoderado: 1 });
    await ingresar();
    expect(db.execute.mock.calls.some(([sql]) => /SET Usuario_Estado_Cuenta = 1/.test(sql))).toBe(false);
  });
});

describe('utils/primerIngreso', () => {
  test('cuenta utilizable: activa o a la espera de su primer ingreso', () => {
    expect(cuentaUtilizable({ Usuario_Estado_Cuenta: 1 })).toBe(true);
    expect(cuentaUtilizable({ Usuario_Estado_Cuenta: 0, Espera_Primer_Ingreso: 1 })).toBe(true);
    expect(cuentaUtilizable({ Usuario_Estado_Cuenta: 0, Espera_Primer_Ingreso: 0 })).toBe(false);
  });

  test('el SQL revisa que no haya sesiones ni marca de apoderado sin asociaciones', () => {
    const sql = cuentaUtilizableSQL('u');
    expect(sql).toContain('u.Usuario_Estado_Cuenta = 1');
    expect(sql).toContain('u.Apoderado_Sin_Asociaciones_Desde IS NULL');
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM sesion s_pi WHERE s_pi\.Usuario_Id = u\.Usuario_Id\)/);
  });
});

describe('createUsuario: la cuenta se registra inactiva', () => {
  let insercion;
  beforeEach(() => {
    mailer.correoConfigurado.mockReturnValue(true);
    mailer.enviarContrasenaInicial.mockResolvedValue();
    insercion = null;
    const responder = async (sql, valores) => {
      if (/^\s*INSERT INTO usuario/.test(sql)) {
        insercion = valores;
        return [{ insertId: 50, affectedRows: 1 }];
      }
      if (/SELECT \* FROM usuario WHERE Usuario_Id = \?/.test(sql)) {
        return [[{ Usuario_Id: 50, Usuario_Estado_Cuenta: insercion?.[3] }]];
      }
      return [[]];
    };
    db.query.mockImplementation(responder);
    db.getConnection.mockResolvedValue({
      query: jest.fn(responder),
      beginTransaction: jest.fn(async () => {}), commit: jest.fn(async () => {}),
      rollback: jest.fn(async () => {}), release: jest.fn(),
    });
  });

  const apoderado = {
    Usuario_RUT: '5738925-7', Usuario_Nombre_Completo: 'Pedro Fernández', Usuario_Telefono: '944706559',
    Es_Apoderado: 1, Apoderado_Correo_Natural: 'pedro@gmail.com',
  };

  test('ignora el estado enviado, guarda 0 y avisa que queda inactiva hasta el primer ingreso', async () => {
    const res = nuevoRes();
    await usuarioController.createUsuario({ body: { ...apoderado, Usuario_Estado_Cuenta: 1 }, user: SUPER_ADMIN }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(insercion[3]).toBe(0);
    expect(res.json.mock.calls[0][0].Aviso_Estado).toMatch(/inactiva hasta el primer inicio de sesión/);
  });

  test('registra sin dirección: la dirección es opcional', async () => {
    const res = nuevoRes();
    await usuarioController.createUsuario({ body: { ...apoderado }, user: SUPER_ADMIN }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    // calle, número, depto y comuna quedan en NULL
    expect(insercion.slice(14, 18)).toEqual([null, null, null, null]);
  });

  test('no permite registrar directamente con la etiqueta UTP', async () => {
    const res = nuevoRes();
    await usuarioController.createUsuario({
      body: {
        ...apoderado, Es_Apoderado: 0, Apoderado_Correo_Natural: undefined,
        Es_Administrador: 1, Administrador_Tipo: 'UTP', Administrador_Correo_Institucional: 'pe.fernandez@colegiojc.cl',
      },
      user: SUPER_ADMIN,
    }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(insercion[11]).toBe('Administrador Normal');
  });
});

describe('validarDireccion opcional', () => {
  test('vacía es válida; incompleta no', () => {
    expect(validarDireccion({}, { opcional: true })).toBeNull();
    expect(validarDireccion({ calle: '', numero: '', depto: '', comuna: '' }, { opcional: true })).toBeNull();
    expect(validarDireccion({ calle: 'Los Pinos' }, { opcional: true })).toMatch(/número/);
    expect(validarDireccion({ calle: 'Los Pinos', numero: '45', comuna: 'Maipú' }, { opcional: true })).toBeNull();
  });

  test('en una edición parcial solo se vacía si llegan todos los campos', () => {
    expect(validarDireccion({ calle: '' }, { parcial: true, opcional: true })).toMatch(/calle/);
    expect(validarDireccion({ calle: '', numero: '', comuna: '' }, { parcial: true, opcional: true })).toBeNull();
  });

  test('sin la opción, la dirección sigue siendo obligatoria (ficha del estudiante)', () => {
    expect(validarDireccion({})).toMatch(/calle/);
  });
});

describe('cambiarEtiquetaUTP (PUT /api/usuarios/:id/etiqueta-utp)', () => {
  let conn;
  const simular = (usuario) => {
    conn = {
      query: jest.fn(async (sql) => {
        if (/FROM usuario WHERE Usuario_Id = \? FOR UPDATE/.test(sql)) return [usuario ? [usuario] : []];
        return [{ affectedRows: 1 }];
      }),
      beginTransaction: jest.fn(async () => {}), commit: jest.fn(async () => {}),
      rollback: jest.fn(async () => {}), release: jest.fn(),
    };
    db.getConnection.mockResolvedValue(conn);
  };
  const cambiar = async (id, utp) => {
    const res = nuevoRes();
    await usuarioController.cambiarEtiquetaUTP({ params: { id: String(id) }, body: { utp }, user: SUPER_ADMIN }, res);
    return res;
  };
  const admin = { Usuario_Id: 2, Usuario_RUT: '9343727-6', Usuario_Nombre_Completo: 'Carlos Gonzales', Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal', Es_Docente: 0 };

  test('asigna la etiqueta a un administrador, cierra sus sesiones y deja historial', async () => {
    simular(admin);
    const res = await cambiar(2, true);
    expect(res.status).not.toHaveBeenCalled();
    const sqls = conn.query.mock.calls.map(([sql, v]) => [sql, v]);
    expect(sqls.find(([sql]) => /SET Administrador_Tipo = \?/.test(sql))[1]).toEqual(['UTP', '2']);
    expect(sqls.some(([sql]) => /UPDATE sesion SET Sesion_Estado = 0/.test(sql))).toBe(true);
    expect(sqls.some(([sql]) => /INSERT INTO historial/.test(sql))).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].mensaje).toMatch(/limitados a los de la UTP/);
  });

  test('al retirarla, el administrador vuelve a Administrador Normal y el docente queda sin tipo', async () => {
    simular({ ...admin, Administrador_Tipo: 'UTP' });
    await cambiar(2, false);
    expect(conn.query.mock.calls.find(([sql]) => /SET Administrador_Tipo = \?/.test(sql))[1]).toEqual(['Administrador Normal', '2']);

    simular({ Usuario_Id: 3, Usuario_RUT: '3483606-k', Usuario_Nombre_Completo: 'María Morales', Es_Administrador: 0, Es_Docente: 1, Administrador_Tipo: 'UTP' });
    await cambiar(3, false);
    expect(conn.query.mock.calls.find(([sql]) => /SET Administrador_Tipo = \?/.test(sql))[1]).toEqual([null, '3']);
  });

  test('rechaza a un Super Administrador, a un apoderado y una asignación repetida', async () => {
    simular({ ...admin, Administrador_Tipo: 'Super Admin' });
    expect((await cambiar(2, true)).status).toHaveBeenCalledWith(400);
    simular({ Usuario_Id: 4, Es_Administrador: 0, Es_Docente: 0, Es_Apoderado: 1, Administrador_Tipo: null });
    expect((await cambiar(4, true)).status).toHaveBeenCalledWith(400);
    simular({ ...admin, Administrador_Tipo: 'UTP' });
    expect((await cambiar(2, true)).status).toHaveBeenCalledWith(409);
  });

  test('valida el cuerpo y no permite cambiarse la propia etiqueta', async () => {
    const res = nuevoRes();
    await usuarioController.cambiarEtiquetaUTP({ params: { id: '2' }, body: {}, user: SUPER_ADMIN }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect((await cambiar(1, true)).status).toHaveBeenCalledWith(403);
  });
});

describe('Ficha del estudiante editada por la etiqueta UTP', () => {
  test('solo puede cambiar curso, estado académico y ruta', async () => {
    const res = nuevoRes();
    await estudianteController.updateEstudiante({
      params: { id: '5' },
      body: { Estudiante_Nombre_Completo: 'Otro Nombre' },
      user: { id: 9, roles: ['UTP'], utp: true },
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});
