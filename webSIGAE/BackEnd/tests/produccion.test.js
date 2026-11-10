// Pruebas de la configuración de producción: logs saneados y validación del .env.
const { sanear, sanearTexto } = require('../utils/logger');
const { problemasEntornoProduccion } = require('../config/env');

jest.mock('../config/db');

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
    SMTP_HOST: 'smtp.example.cl', SMTP_USER: 'u', SMTP_PASS: 'p', EMAIL_FROM: 'SIGAE <noreply@colegiojc.cl>',
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
    expect(problemasEntornoProduccion({ ...completo, DB_PASSWORD: 'sigae123' }))
      .toContain('DB_PASSWORD es el valor de desarrollo de .env.example');
  });
});

// CU14 (recuperación con código), activación y cambio de correo: tests/codigosVerificacion.test.js
