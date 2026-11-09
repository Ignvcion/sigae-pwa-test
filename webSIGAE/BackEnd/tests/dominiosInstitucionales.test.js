// Los correos institucionales de docentes y administradores aceptan los dos
// dominios del colegio (@colegiojc.cl y @colegiojacquescousteau.cl) en TODOS
// los lugares donde se guardan, y se guardan sin espacios en los extremos:
//   createUsuario, updateUsuario, asignarRol, editarAdministrador (usuarioController),
//   validateCrearUsuario (middleware) y scripts/crearSuperAdmin.js.
// CU19 (editarPerfilPropio) está en editarPerfilPropio.test.js y codigosVerificacion.test.js.
const usuarioController = require('../controllers/usuarioController');
const db = require('../config/db');
const { validateCrearUsuario, validarCorreoInstitucional } = require('../middleware/validation');
const { validarDatos } = require('../scripts/crearSuperAdmin');

jest.mock('../config/db');

const DOMINIOS_VALIDOS = ['@colegiojc.cl', '@colegiojacquescousteau.cl'];
const MENSAJE_DOMINIO = 'debe pertenecer al dominio @colegiojc.cl o @colegiojacquescousteau.cl';

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const SUPER_ADMIN = { id: 1, roles: ['Administrador'], administradorTipo: 'Super Admin' };

// Base simulada: responde por patrón de SQL y guarda lo que se escribe en usuario
let escrituras;
function simularBase(usuarioExistente = null) {
  escrituras = [];
  const responder = async (sql, valores) => {
    if (/^\s*(INSERT INTO usuario|UPDATE usuario)/.test(sql)) {
      escrituras.push({ sql, valores });
      return [{ insertId: 50, affectedRows: 1 }];
    }
    if (/WHERE Usuario_RUT = \?/.test(sql)) return [[]];
    if (/FROM especialidad WHERE Especialidad_Nombre = \?/.test(sql)) return [[{ Especialidad_Id: 1, Especialidad_Nombre: valores[0] }]];
    if (/SELECT \* FROM usuario WHERE Usuario_Id = \?/.test(sql)) return [[usuarioExistente || { Usuario_Id: 50 }]];
    if (/SELECT Es_Administrador, Administrador_Tipo, Es_Apoderado, Es_Docente FROM usuario/.test(sql)) return [[usuarioExistente]];
    if (/SELECT Es_Administrador, Administrador_Tipo FROM usuario/.test(sql)) return [[usuarioExistente]];
    if (/SELECT Usuario_Id FROM usuario WHERE/.test(sql)) return [[]]; // sin duplicados
    if (/SELECT Usuario_Id, Usuario_Nombre_Completo, Usuario_Telefono/.test(sql)) return [[{ Usuario_Id: 2 }]];
    return [[]];
  };
  db.query.mockImplementation(responder);
  const conn = {
    query: jest.fn(responder),
    beginTransaction: jest.fn(async () => {}), commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}), release: jest.fn(),
  };
  db.getConnection.mockResolvedValue(conn);
}

beforeEach(() => jest.resetAllMocks());

describe('validarCorreoInstitucional', () => {
  test.each(DOMINIOS_VALIDOS)('acepta el dominio %s (también con mayúsculas)', (dominio) => {
    expect(validarCorreoInstitucional(`ana.perez${dominio}`)).toBe(true);
    expect(validarCorreoInstitucional(`Ana.Perez${dominio.toUpperCase()}`)).toBe(true);
  });

  test.each(['ana@jacquescousteau.edu', 'ana@gmail.com', 'ana@colegiojc.cl.com', 'ana@x.colegiojc.cl', null, undefined])(
    'rechaza %p', (correo) => {
      expect(validarCorreoInstitucional(correo)).toBe(false);
    }
  );
});

describe('createUsuario: docente y administrador con cualquiera de los dos dominios', () => {
  const base = {
    Usuario_RUT: '12345678-5', Usuario_Telefono: '912345678', Usuario_Nombre_Completo: 'Ana Pérez',
    Usuario_Contraseña: 'Clave2026', Usuario_Estado_Cuenta: 1,
  };

  test.each(DOMINIOS_VALIDOS)('crea un docente con %s y lo guarda sin espacios', async (dominio) => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario({
      body: {
        ...base, Es_Docente: 1, Docente_Correo_Institucional: `  ana.perez${dominio} `,
        Docente_Carga_Horaria_Semanal: 30, Docente_Especialidades: ['Matemáticas'],
      },
      user: SUPER_ADMIN,
    }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const insercion = escrituras.find((e) => /INSERT INTO usuario/.test(e.sql));
    expect(insercion.valores).toContain(`ana.perez${dominio}`);
  });

  test.each(DOMINIOS_VALIDOS)('crea un administrador con %s', async (dominio) => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario({
      body: { ...base, Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal', Administrador_Correo_Institucional: `ana.perez${dominio}` },
      user: SUPER_ADMIN,
    }, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('rechaza el dominio anterior sin escribir', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario({
      body: { ...base, Es_Docente: 1, Docente_Correo_Institucional: 'ana.perez@jacquescousteau.edu', Docente_Carga_Horaria_Semanal: 30 },
      user: SUPER_ADMIN,
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain(MENSAJE_DOMINIO);
    expect(escrituras).toHaveLength(0);
  });
});

describe('validateCrearUsuario (middleware de la ruta de creación)', () => {
  async function pasa(body) {
    const req = { body };
    const res = nuevoRes();
    for (const middleware of validateCrearUsuario) {
      let siguio = false;
      await middleware(req, res, () => { siguio = true; });
      if (!siguio) return false;
    }
    return true;
  }
  const base = {
    Usuario_RUT: '12345678-5', Usuario_Telefono: '912345678', Usuario_Nombre_Completo: 'Ana Pérez',
    Usuario_Contraseña: 'Clave2026', Usuario_Direccion_Calle: 'Los Aromos', Usuario_Direccion_Numero: '45',
    Usuario_Direccion_Comuna: 'Ñuñoa',
  };

  test.each(DOMINIOS_VALIDOS)('deja pasar docente y administrador con %s', async (dominio) => {
    expect(await pasa({ ...base, Es_Docente: 1, Docente_Correo_Institucional: `ana${dominio}` })).toBe(true);
    expect(await pasa({ ...base, Es_Administrador: 1, Administrador_Correo_Institucional: `ana${dominio}` })).toBe(true);
  });

  test('detiene el dominio anterior', async () => {
    expect(await pasa({ ...base, Es_Docente: 1, Docente_Correo_Institucional: 'ana@jacquescousteau.edu' })).toBe(false);
  });
});

describe('updateUsuario: editar el correo institucional', () => {
  const docente = { Es_Administrador: 0, Administrador_Tipo: null, Es_Apoderado: 0, Es_Docente: 1 };
  const req = (body) => ({ params: { id: '7' }, user: SUPER_ADMIN, body });

  test.each(DOMINIOS_VALIDOS)('acepta %s y guarda el correo sin espacios', async (dominio) => {
    simularBase(docente);
    const res = nuevoRes();
    await usuarioController.updateUsuario(req({ Docente_Correo_Institucional: ` ana${dominio} ` }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(escrituras[0].valores).toEqual([`ana${dominio}`, `ana${dominio}`, '7']);
  });

  test.each([
    [{ Docente_Correo_Institucional: '' }, 'El correo institucional del docente es obligatorio'],
    [{ Docente_Correo_Institucional: '   ' }, 'El correo institucional del docente es obligatorio'],
    [{ Docente_Correo_Institucional: null }, 'El correo institucional del docente es obligatorio'],
    [{ Administrador_Correo_Institucional: '' }, 'El correo institucional del administrador es obligatorio'],
    [{ Apoderado_Correo_Natural: '' }, 'El correo del apoderado es obligatorio'],
    [{ Docente_Correo_Institucional: 'ana@jacquescousteau.edu' }, `El correo institucional del docente ${MENSAJE_DOMINIO}`],
    [{ Administrador_Correo_Institucional: 'ana@gmail.com' }, `El correo institucional del administrador ${MENSAJE_DOMINIO}`],
  ])('rechaza %p sin escribir', async (body, mensaje) => {
    simularBase(docente);
    const res = nuevoRes();
    await usuarioController.updateUsuario(req(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje });
    expect(escrituras).toHaveLength(0);
  });
});

describe('asignarRol: el correo del rol nuevo', () => {
  const apoderado = {
    Usuario_Id: 8, Es_Administrador: 0, Es_Docente: 0, Es_Apoderado: 1, Administrador_Tipo: null,
    Apoderado_Correo_Natural: 'luis@gmail.com', Docente_Correo_Institucional: null,
  };

  test.each(DOMINIOS_VALIDOS)('asigna Docente con %s', async (dominio) => {
    simularBase(apoderado);
    const res = nuevoRes();
    await usuarioController.asignarRol({
      params: { id: '8' }, user: SUPER_ADMIN,
      body: { rol: 'Docente', Docente_Correo_Institucional: ` luis${dominio}`, Docente_Carga_Horaria_Semanal: 20, Docente_Especialidades: ['Historia'] },
    }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(escrituras[0].valores).toContain(`luis${dominio}`);
  });

  test('rechaza el dominio anterior', async () => {
    simularBase(apoderado);
    const res = nuevoRes();
    await usuarioController.asignarRol({
      params: { id: '8' }, user: SUPER_ADMIN,
      body: { rol: 'Docente', Docente_Correo_Institucional: 'luis@jacquescousteau.edu', Docente_Carga_Horaria_Semanal: 20, Docente_Especialidades: ['Historia'] },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain(MENSAJE_DOMINIO);
    expect(escrituras).toHaveLength(0);
  });
});

describe('editarAdministrador (CU3)', () => {
  const admin = { Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal' };

  test.each(DOMINIOS_VALIDOS)('acepta %s y lo guarda sin espacios', async (dominio) => {
    simularBase(admin);
    const res = nuevoRes();
    await usuarioController.editarAdministrador({ params: { id: '2' }, body: { Administrador_Correo_Institucional: `carlos${dominio} ` } }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(escrituras[0].valores).toEqual([`carlos${dominio}`, `carlos${dominio}`, '2']);
  });
});

describe('scripts/crearSuperAdmin.js', () => {
  const datos = { rut: '12345678-5', nombre: 'Rosa Muñoz', telefono: '912345678', contrasena: 'Clave1234' };

  test.each(DOMINIOS_VALIDOS)('acepta %s', (dominio) => {
    expect(validarDatos({ ...datos, correo: `ro.munoz${dominio}` })).toEqual([]);
  });

  test('rechaza el dominio anterior', () => {
    expect(validarDatos({ ...datos, correo: 'ro.munoz@jacquescousteau.edu' })[0]).toContain('@colegiojacquescousteau.cl');
  });
});
