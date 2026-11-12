// Pie de los correos automáticos ("Nadie revisa esta cuenta") y respaldos
// enviados por correo a la cuenta de respaldos (utils/respaldo.js,
// scripts/enviarRespaldo.js y la copia del Excel del cierre de período).
const enviados = [];
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: async (msg) => { enviados.push(msg); } }),
}));

const mailer = require('../utils/mailer');
const {
  fechaHoraChile, formatearBytes, limiteBytes, argumentosVolcado,
  armarCorreoRespaldo, armarCorreoRespaldoCierre, instruccionesRestauracion,
} = require('../utils/respaldo');

beforeEach(() => { enviados.length = 0; });

describe('Pie de los correos automáticos', () => {
  test('el código de verificación y la contraseña inicial dicen que nadie revisa la cuenta', async () => {
    await mailer.enviarCodigoVerificacion({ para: 'a@b.cl', nombre: 'Ana', codigo: '123456', minutos: 10, proposito: 'Activacion' });
    await mailer.enviarContrasenaInicial({ para: 'a@b.cl', nombre: 'Ana', rut: '11111111-1', contrasena: 'Clave1234' });
    for (const msg of enviados) {
      expect(msg.text).toMatch(/enviado automáticamente por SIGAE\. No respondas a este mensaje\.\nNadie revisa esta cuenta\.\n$/);
      expect(msg.html).toContain('No respondas a este mensaje.<br>Nadie revisa esta cuenta.');
    }
  });

  test('el correo de respaldo lleva el pie y los adjuntos', async () => {
    await mailer.enviarRespaldo({ para: 'r@b.cl', asunto: 'A', texto: 'T', html: '<p>H</p>', adjuntos: [{ filename: 'x.gz', content: 'x' }] });
    expect(enviados[0]).toMatchObject({ to: 'r@b.cl', subject: 'A', attachments: [{ filename: 'x.gz' }] });
    expect(enviados[0].text).toMatch(/^T\n\n.*Nadie revisa esta cuenta\.\n$/s);
  });
});

describe('utils/respaldo', () => {
  test('fecha y hora en la zona de Chile', () => {
    // 2026-11-12 06:17 UTC = 03:17 en Chile (UTC-3, horario de verano)
    expect(fechaHoraChile(new Date('2026-11-12T06:17:05Z'))).toEqual({ fecha: '2026-11-12', hora: '03:17:05', sello: '20261112_0317' });
  });

  test('tamaños legibles y límite del adjunto', () => {
    expect(formatearBytes(512)).toBe('512 B');
    expect(formatearBytes(10846)).toBe('10.6 KB');
    expect(formatearBytes(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(limiteBytes({})).toBe(18 * 1024 * 1024);
    expect(limiteBytes({ RESPALDO_MAX_MB: '10' })).toBe(10 * 1024 * 1024);
  });

  test('el volcado usa el usuario de respaldo, no pone la contraseña en la línea de comandos y respeta DB_SSL', () => {
    const env = { DB_HOST: 'rds', DB_PORT: '3307', DB_USER: 'app', DB_PASSWORD: 'secreta', DB_NAME: 'sigae', RESPALDO_DB_USER: 'lector', DB_SSL: 'true', RESPALDO_SSL_CA: '/ca.pem' };
    const args = argumentosVolcado(env);
    expect(args).toEqual(expect.arrayContaining(['-h', 'rds', '-P', '3307', '-u', 'lector', '--single-transaction', '--no-tablespaces', '--databases', 'sigae', '--ssl', '--ssl-ca=/ca.pem']));
    expect(args.join(' ')).not.toContain('secreta');
    expect(argumentosVolcado({ DB_USER: 'app' })).not.toContain('--ssl');
  });

  test('el correo del respaldo diario trae el detalle y cómo cargarlo', () => {
    const correo = armarCorreoRespaldo({
      archivo: 'sigae_20261112_0317.sql.gz', bytes: 10846, sha256: 'abc123', tablas: 33,
      baseDatos: 'sigae', servidor: 'ec2', inicio: new Date('2026-11-12T06:17:05Z'), duracionSeg: 2,
    }, mailer.escaparHTML);
    expect(correo.asunto).toBe('Respaldo SIGAE - sigae - 2026-11-12 03:17');
    for (const dato of ['Fecha: 2026-11-12', 'Hora: 03:17:05 (hora de Chile)', 'Tablas: 33', 'SHA-256: abc123', '10.6 KB']) {
      expect(correo.texto).toContain(dato);
      expect(correo.leeme).toContain(dato);
    }
    expect(correo.texto).toContain('gunzip -c sigae_20261112_0317.sql.gz | mariadb --default-character-set=utf8mb4');
    expect(correo.texto).toContain('sha256sum sigae_20261112_0317.sql.gz');
    expect(correo.html).toContain('<table');
  });

  test('las instrucciones escapan el HTML y explican cómo restaurar en Windows', () => {
    const texto = instruccionesRestauracion({ archivo: 'sigae_x.sql.gz', sha256: 'h', baseDatos: 'sigae' });
    expect(texto).toContain('sigae_x.sql');
    expect(texto).toContain('7-Zip');
    const correo = armarCorreoRespaldo({ archivo: 'a<b>.gz', bytes: 1, sha256: 'h', tablas: 1, baseDatos: 'sigae', servidor: 's', inicio: new Date(), duracionSeg: 0 }, mailer.escaparHTML);
    expect(correo.html).not.toContain('a<b>');
    expect(correo.html).toContain('a&lt;b&gt;');
  });

  test('el correo del cierre de período usa nombres legibles para lo que se elimina', () => {
    const correo = armarCorreoRespaldoCierre({
      archivo: 'respaldo_cambio_periodo_2026.xlsx', bytes: 2048, sha256: 'ff', vigente: '2026', siguiente: '2027',
      conteo: { cursos: 3, apoderadosDesactivar: 2 }, inicio: new Date('2026-12-20T15:00:00Z'), responsable: '5682711-0',
    }, mailer.escaparHTML);
    expect(correo.asunto).toBe('Respaldo SIGAE - cierre de período 2026 - 2026-12-20 12:00');
    expect(correo.texto).toContain('- Cursos que se eliminan: 3');
    expect(correo.texto).toContain('- Apoderados que quedan inactivos: 2');
    expect(correo.texto).toContain('Descargado por: 5682711-0');
  });
});
