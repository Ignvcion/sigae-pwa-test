// CU20: la subida de fotos no puede dejar archivos que se sirvan como HTML o JS desde /uploads.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sigae-uploads-'));
const uploadFotoPerfil = require('../middleware/uploadFotoPerfil');
const { esImagenValida, UPLOAD_DIR } = uploadFotoPerfil;

const escribir = (nombre, bytes) => {
  const ruta = path.join(UPLOAD_DIR, nombre);
  fs.writeFileSync(ruta, bytes);
  return ruta;
};

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

afterAll(() => fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true }));

describe('esImagenValida', () => {
  test.each([
    ['image/jpeg', JPEG], ['image/png', PNG], ['image/webp', WEBP],
  ])('acepta un %s real', (tipo, bytes) => {
    const ruta = escribir(`ok-${tipo.split('/')[1]}`, bytes);
    expect(esImagenValida(ruta, tipo)).toBe(true);
    expect(fs.existsSync(ruta)).toBe(true);
  });

  test('un HTML declarado como imagen se rechaza y se borra', () => {
    const ruta = escribir('falso.png', Buffer.from('<script>alert(1)</script>'));
    expect(esImagenValida(ruta, 'image/png')).toBe(false);
    expect(fs.existsSync(ruta)).toBe(false);
  });

  test('un PNG declarado como JPEG se rechaza', () => {
    const ruta = escribir('cruzado.jpg', PNG);
    expect(esImagenValida(ruta, 'image/jpeg')).toBe(false);
    expect(fs.existsSync(ruta)).toBe(false);
  });
});

describe('nombre del archivo guardado', () => {
  test('la extensión sale del tipo permitido y nunca del nombre original', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '../middleware/uploadFotoPerfil.js'), 'utf8');
    expect(fuente).not.toMatch(/extname\(file\.originalname\)/);
    expect(fuente).toMatch(/EXTENSION_POR_TIPO\[file\.mimetype\]/);
  });
});
