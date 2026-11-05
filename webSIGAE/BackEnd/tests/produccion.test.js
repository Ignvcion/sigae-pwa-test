// Pruebas de la configuración de producción: logs saneados, validación del
// .env y recuperación de contraseña por SMTP (CU14).
const { sanear, sanearTexto } = require('../utils/logger');
const { problemasEntornoProduccion } = require('../config/env');

jest.mock('../config/db');
jest.mock('../utils/mailer', () => ({
  correoConfigurado: jest.fn(),
  enviarCorreoRecuperacion: jest.fn(),
}));

describe('utils/logger: logs sin datos personales', () => {
  test('Tapa RUT, correos y valores entre comillas de un error de MySQL', () => {
    const err = new Error("Duplicate entry '12.345.678-9' for key 'Usuario_RUT'");
    err.code = 'ER_DUP_ENTRY';
    err.sql = "INSERT INTO usuario VALUES ('12.345.678-9', 'Juan Pérez')";
    const salida = sanear(err);
    expect(salida).toContain('ER_DUP_ENTRY');
    expect(salida).not.toContain('12.345.678-9');
    expect(salida).not.toContain('Juan');
    expect(salida).not.toContain('INSERT INTO');
  });

  test('Tapa RUT sin puntos, correos y tokens en texto libre', () => {
    const salida = sanearTexto('usuario 12345678-k correo ana@colegio.cl token ' + 'a'.repeat(64));
    expect(salida).toBe('usuario [RUT] correo [correo] token [token]');
  });

  test('No vuelca objetos: solo sus claves', () => {
    expect(sanear({ Usuario_RUT: '1-9', Nota: 'x' })).toBe('[objeto omitido: Usuario_RUT, Nota]');
  });
});

describe('config/env: validación del .env de producción', () => {
  const completo = {
    DB_HOST: 'sigae.xxxx.rds.amazonaws.com', DB_USER: 'sigae_app', DB_PASSWORD: 'x', DB_NAME: 'sigae',
    JWT_SECRET: 'z'.repeat(64), FRONTEND_URL: 'https://sigae.example.cl', UPLOADS_DIR: '/var/sigae/uploads',
    PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
    SMTP_HOST: 'smtp.example.cl', SMTP_USER: 'u', SMTP_PASS: 'p', EMAIL_FROM: 'SIGAE <no-responder@example.cl>',
  };

  test('Una configuración completa no tiene problemas', () => {
    expect(problemasEntornoProduccion(completo)).toEqual([]);
  });

  test('Informa cada variable faltante por nombre', () => {
    const { JWT_SECRET, DB_PASSWORD, ...incompleto } = completo;
    expect(problemasEntornoProduccion(incompleto)).toEqual(
      expect.arrayContaining(['falta JWT_SECRET', 'falta DB_PASSWORD'])
    );
  });

  test('Rechaza un JWT_SECRET corto, el de ejemplo, localhost y rutas relativas', () => {
    const problemas = problemasEntornoProduccion({
      ...completo, JWT_SECRET: 'corto', FRONTEND_URL: 'http://localhost:5173', UPLOADS_DIR: 'uploads',
    });
    expect(problemas).toEqual(expect.arrayContaining([
      'JWT_SECRET debe tener al menos 32 caracteres',
      'CORS_ORIGINS / FRONTEND_URL apuntan a localhost',
      'UPLOADS_DIR debe ser una ruta absoluta',
    ]));
    expect(problemasEntornoProduccion({ ...completo, JWT_SECRET: 'un_secreto_muy_largo_y_seguro' }))
      .toContain('JWT_SECRET es el valor de ejemplo de .env.example');
  });
});

describe('CU14: recuperación de contraseña por SMTP', () => {
  const pool = require('../config/db');
  const mailer = require('../utils/mailer');
  const { forgotPassword } = require('../controllers/passwordController');
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: { rut: '11111111-1' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    pool.execute
      .mockResolvedValueOnce([[{
        Usuario_Id: 3, Usuario_Nombre_Completo: 'Ana', Usuario_Estado_Cuenta: 1,
        Administrador_Correo_Institucional: null, Docente_Correo_Institucional: 'ana@colegio.cl',
        Apoderado_Correo_Natural: null,
      }]])
      .mockResolvedValue([{ affectedRows: 1 }]);
  });

  test('Con SMTP configurado envía el correo y no devuelve ni registra el enlace', async () => {
    mailer.correoConfigurado.mockReturnValue(true);
    mailer.enviarCorreoRecuperacion.mockResolvedValue();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await forgotPassword(req, res);

    expect(mailer.enviarCorreoRecuperacion).toHaveBeenCalledWith(expect.objectContaining({
      para: 'ana@colegio.cl',
      enlace: expect.stringMatching(/\/reset-password\?token=[0-9a-f]{64}$/),
    }));
    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta).not.toHaveProperty('devResetLink');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test('Si el envío falla, invalida el token y responde 503', async () => {
    mailer.correoConfigurado.mockReturnValue(true);
    mailer.enviarCorreoRecuperacion.mockRejectedValue(new Error('ECONNREFUSED'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    const ultimoUpdate = pool.execute.mock.calls.at(-1);
    expect(ultimoUpdate[0]).toMatch(/SET Solicitud_Recuperacion_Estado = 'Expirado'/);
    console.error.mockRestore();
  });

  test('En desarrollo sin SMTP devuelve el enlace para pruebas', async () => {
    mailer.correoConfigurado.mockReturnValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await forgotPassword(req, res);

    expect(res.json.mock.calls[0][0]).toHaveProperty('devResetLink');
    expect(mailer.enviarCorreoRecuperacion).not.toHaveBeenCalled();
    console.log.mockRestore();
  });
});
