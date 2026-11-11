// Registro de usuarios sin contraseña escrita por el administrador: SIGAE genera
// una aleatoria, la guarda hasheada y la envía al correo del usuario desde la
// cuenta no-reply (utils/contrasenaInicial.js + utils/mailer.js). Si el correo
// no sale, la cuenta no se crea. El teléfono se acepta con espacios y se guarda sin ellos.
const bcrypt = require('bcrypt');
const usuarioController = require('../controllers/usuarioController');
const db = require('../config/db');
const mailer = require('../utils/mailer');
const { generarContrasenaAleatoria } = require('../utils/contrasenaInicial');
const { validarFortalezaContrasena } = require('../middleware/validation');

jest.mock('../config/db');
jest.mock('../utils/mailer');

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const SUPER_ADMIN = { id: 1, roles: ['Administrador'], administradorTipo: 'Super Admin' };

let insercion;
let conn;
function simularBase() {
  insercion = null;
  const responder = async (sql, valores) => {
    if (/^\s*INSERT INTO usuario/.test(sql)) {
      insercion = valores;
      return [{ insertId: 50, affectedRows: 1 }];
    }
    if (/SELECT \* FROM usuario WHERE Usuario_Id = \?/.test(sql)) {
      return [[{ Usuario_Id: 50, Usuario_Contraseña: insercion?.[4] }]];
    }
    return [[]]; // sin RUT ni correos duplicados
  };
  db.query.mockImplementation(responder);
  conn = {
    query: jest.fn(responder),
    beginTransaction: jest.fn(async () => {}), commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}), release: jest.fn(),
  };
  db.getConnection.mockResolvedValue(conn);
}

const apoderado = {
  Usuario_RUT: '5738925-7', Usuario_Nombre_Completo: 'Pedro Fernández', Usuario_Telefono: '+56 9 4470 6559',
  Usuario_Estado_Cuenta: 1, Es_Apoderado: 1, Apoderado_Correo_Natural: 'pedro@gmail.com',
  Usuario_Direccion_Calle: 'Avenida Concha y Toro', Usuario_Direccion_Numero: '134', Usuario_Direccion_Comuna: 'Puente Alto',
};

beforeEach(() => {
  jest.resetAllMocks();
  mailer.correoConfigurado.mockReturnValue(true);
  mailer.enviarContrasenaInicial.mockResolvedValue();
});

describe('generarContrasenaAleatoria', () => {
  test('cumple la política de contraseñas y no se repite', () => {
    const generadas = new Set();
    for (let i = 0; i < 200; i++) {
      const pwd = generarContrasenaAleatoria();
      expect(pwd).toHaveLength(12);
      expect(validarFortalezaContrasena(pwd)).toBeFalsy();
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).not.toMatch(/[0O1lI\s]/);
      generadas.add(pwd);
    }
    expect(generadas.size).toBe(200);
  });
});

describe('createUsuario: contraseña inicial aleatoria enviada por correo', () => {
  test('genera la contraseña, la guarda hasheada y la envía al correo del rol', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario({ body: { ...apoderado }, user: SUPER_ADMIN }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mailer.enviarContrasenaInicial).toHaveBeenCalledTimes(1);
    const envio = mailer.enviarContrasenaInicial.mock.calls[0][0];
    expect(envio).toMatchObject({ para: 'pedro@gmail.com', nombre: 'Pedro Fernández', rut: '5738925-7' });
    expect(validarFortalezaContrasena(envio.contrasena)).toBeFalsy();

    const hashGuardado = insercion[4];
    expect(hashGuardado).not.toBe(envio.contrasena);
    expect(await bcrypt.compare(envio.contrasena, hashGuardado)).toBe(true);
    expect(conn.commit).toHaveBeenCalled();

    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta).not.toHaveProperty('Usuario_Contraseña');
    expect(JSON.stringify(respuesta)).not.toContain(envio.contrasena);
    expect(respuesta.Contrasena_Enviada_A).toBe('pe***@gmail.com');
  });

  test('ignora una contraseña enviada en el cuerpo', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario({ body: { ...apoderado, Usuario_Contraseña: 'Elegida123' }, user: SUPER_ADMIN }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(await bcrypt.compare('Elegida123', insercion[4])).toBe(false);
  });

  test('envía al correo institucional del administrador', async () => {
    simularBase();
    const res = nuevoRes();
    const { Apoderado_Correo_Natural: _correo, Es_Apoderado: _rol, ...base } = apoderado;
    await usuarioController.createUsuario({
      body: { ...base, Es_Administrador: 1, Administrador_Tipo: 'Administrador Normal', Administrador_Correo_Institucional: 'pe.fernandez@colegiojc.cl' },
      user: SUPER_ADMIN,
    }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mailer.enviarContrasenaInicial.mock.calls[0][0].para).toBe('pe.fernandez@colegiojc.cl');
  });

  test('si el correo no sale, la cuenta no se crea (rollback) y responde 503', async () => {
    simularBase();
    mailer.enviarContrasenaInicial.mockRejectedValue(new Error('SMTP caído'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = nuevoRes();
    await usuarioController.createUsuario({ body: { ...apoderado }, user: SUPER_ADMIN }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].mensaje).toMatch(/no se registró/);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('guarda el teléfono sin espacios', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario({ body: { ...apoderado }, user: SUPER_ADMIN }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(insercion[1]).toBe('944706559');
  });
});

describe('Correo con la contraseña inicial (utils/mailer.js)', () => {
  test('sale de EMAIL_FROM, marcado como automático, con el RUT y la contraseña', async () => {
    const nodemailer = require('nodemailer');
    const sendMail = jest.fn().mockResolvedValue({});
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail });
    const real = jest.requireActual('../utils/mailer');
    process.env.EMAIL_FROM = 'SIGAE <noreply@colegiojc.cl>';
    process.env.SMTP_HOST = 'smtp.gmail.com';

    await real.enviarContrasenaInicial({ para: 'pedro@gmail.com', nombre: 'Pedro <b>', rut: '5738925-7', contrasena: 'Ab3xYz9Kq2Mn' });

    const correo = sendMail.mock.calls[0][0];
    expect(correo).toMatchObject({
      from: 'SIGAE <noreply@colegiojc.cl>', to: 'pedro@gmail.com',
      subject: 'Tu cuenta en SIGAE fue creada',
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    });
    expect(correo.text).toContain('Ab3xYz9Kq2Mn');
    expect(correo.text).toContain('5738925-7');
    expect(correo.text).toContain('No respondas a este mensaje');
    expect(correo.html).toContain('Pedro &lt;b&gt;');
    expect(correo.html).not.toMatch(/<a /);
    delete process.env.EMAIL_FROM;
    delete process.env.SMTP_HOST;
  });
});
