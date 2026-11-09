// Bot de códigos de verificación (utils/codigosVerificacion.js) y sus tres usos:
//   - CU14: recuperar la contraseña con un código (reemplaza al enlace).
//   - Primer ingreso: activar la cuenta confirmando el correo antes de la sesión.
//   - CU19: confirmar el correo nuevo antes de guardarlo.
// La base es un doble en memoria que entiende solo las consultas de estos flujos,
// así las pruebas siguen el estado real de cada código (intentos, vencimiento, uso).
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const mailer = require('../utils/mailer');
const codigos = require('../utils/codigosVerificacion');
const { login, verificarActivacion, reenviarActivacion } = require('../controllers/authController');
const { forgotPassword, resetPassword } = require('../controllers/passwordController');
const usuarioController = require('../controllers/usuarioController');

jest.mock('../config/db', () => ({ execute: jest.fn(), query: jest.fn() }));
jest.mock('../utils/mailer', () => ({
  correoConfigurado: jest.fn(),
  enviarCodigoVerificacion: jest.fn(),
}));

const INICIO = new Date('2026-11-09T15:00:00Z');
const avanzar = (segundos) => jest.setSystemTime(new Date(Date.now() + segundos * 1000));

// ── Base de datos en memoria ─────────────────────────────────────────────────
function crearBase(usuarios) {
  const db = { usuarios: usuarios.map((u) => ({ ...u })), codigos: [], sesiones: [] };
  let siguienteId = 1;
  const usuario = (id) => db.usuarios.find((u) => u.Usuario_Id === id);
  const copia = (filas) => [filas.map((f) => ({ ...f }))];
  const ultimoDe = (usuarioId, proposito) => db.codigos
    .filter((c) => c.Usuario_Id === usuarioId && c.Codigo_Verificacion_Proposito === proposito)
    .sort((a, b) => b.Codigo_Verificacion_Id - a.Codigo_Verificacion_Id)
    .slice(0, 1);

  db.ejecutar = async (sqlOriginal, p = []) => {
    const sql = sqlOriginal.replace(/\s+/g, ' ').trim();
    const porId = () => db.codigos.find((c) => c.Codigo_Verificacion_Id === p.at(-1));

    // codigo_verificacion
    if (/^SELECT .* FROM codigo_verificacion WHERE Usuario_Id = \? AND Codigo_Verificacion_Proposito = \? ORDER BY/.test(sql)) {
      return copia(ultimoDe(p[0], p[1]));
    }
    if (/^SELECT \* FROM codigo_verificacion WHERE Codigo_Verificacion_Desafio = \?/.test(sql)) {
      return copia(db.codigos.filter((c) => c.Codigo_Verificacion_Desafio === p[0] && c.Codigo_Verificacion_Proposito === p[1]));
    }
    if (/^UPDATE codigo_verificacion SET Codigo_Verificacion_Desafio = \?/.test(sql)) {
      porId().Codigo_Verificacion_Desafio = p[0];
      return [{ affectedRows: 1 }];
    }
    if (/^UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = 'Expirado' WHERE Usuario_Id = \?/.test(sql)) {
      db.codigos.filter((c) => c.Usuario_Id === p[0] && c.Codigo_Verificacion_Proposito === p[1] && c.Codigo_Verificacion_Estado === 'Pendiente')
        .forEach((c) => { c.Codigo_Verificacion_Estado = 'Expirado'; });
      return [{ affectedRows: 1 }];
    }
    if (/^UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = 'Expirado' WHERE Codigo_Verificacion_Id = \?/.test(sql)) {
      porId().Codigo_Verificacion_Estado = 'Expirado';
      return [{ affectedRows: 1 }];
    }
    if (/^DELETE FROM codigo_verificacion WHERE Usuario_Id = \? AND Codigo_Verificacion_Fecha_Creacion < \?/.test(sql)) {
      db.codigos = db.codigos.filter((c) => !(c.Usuario_Id === p[0] && c.Codigo_Verificacion_Fecha_Creacion < p[1]));
      return [{ affectedRows: 0 }];
    }
    if (/^INSERT INTO codigo_verificacion/.test(sql)) {
      const [Usuario_Id, Codigo_Verificacion_Proposito, Codigo_Verificacion_Correo, Codigo_Verificacion_Hash,
        Codigo_Verificacion_Sal, Codigo_Verificacion_Desafio, Codigo_Verificacion_Fecha_Creacion,
        Codigo_Verificacion_Fecha_Expiracion] = p;
      const fila = {
        Codigo_Verificacion_Id: siguienteId++, Usuario_Id, Codigo_Verificacion_Proposito, Codigo_Verificacion_Correo,
        Codigo_Verificacion_Hash, Codigo_Verificacion_Sal, Codigo_Verificacion_Desafio,
        Codigo_Verificacion_Intentos: 0, Codigo_Verificacion_Estado: 'Pendiente',
        Codigo_Verificacion_Fecha_Creacion, Codigo_Verificacion_Fecha_Expiracion,
      };
      db.codigos.push(fila);
      return [{ insertId: fila.Codigo_Verificacion_Id, affectedRows: 1 }];
    }
    if (/^UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = IF\(Codigo_Verificacion_Intentos \+ 1 >= \?/.test(sql)) {
      const c = porId();
      if (c.Codigo_Verificacion_Estado !== 'Pendiente') return [{ affectedRows: 0 }];
      if (c.Codigo_Verificacion_Intentos + 1 >= p[0]) c.Codigo_Verificacion_Estado = 'Bloqueado';
      c.Codigo_Verificacion_Intentos += 1;
      return [{ affectedRows: 1 }];
    }
    if (/^UPDATE codigo_verificacion SET Codigo_Verificacion_Estado = 'Utilizado'/.test(sql)) {
      const c = porId();
      if (c.Codigo_Verificacion_Estado !== 'Pendiente') return [{ affectedRows: 0 }];
      c.Codigo_Verificacion_Estado = 'Utilizado';
      return [{ affectedRows: 1 }];
    }

    // usuario
    if (/FROM usuario WHERE Usuario_RUT = \?/.test(sql)) return copia(db.usuarios.filter((u) => u.Usuario_RUT === p[0]));
    if (/FROM usuario WHERE Usuario_Id = \?$/.test(sql)) return copia(db.usuarios.filter((u) => u.Usuario_Id === p[0]));
    let m = sql.match(/^SELECT Usuario_Id FROM usuario WHERE (\w+) = \? AND Usuario_Id != \?$/);
    if (m) return copia(db.usuarios.filter((u) => u[m[1]] === p[0] && u.Usuario_Id !== p[1]));
    m = sql.match(/^UPDATE usuario SET (.+) WHERE Usuario_Id = \?$/);
    if (m) {
      const u = usuario(p.at(-1));
      let i = 0;
      for (const asignacion of m[1].split(', ')) {
        const [columna, valor] = asignacion.split(' = ').map((x) => x.replace(/`/g, ''));
        u[columna] = valor === '?' ? p[i++] : Number(valor);
      }
      return [{ affectedRows: 1 }];
    }

    // sesion
    if (/^INSERT INTO sesion/.test(sql)) { db.sesiones.push({ Usuario_Id: p.at(-1), Sesion_Estado: 1 }); return [{ affectedRows: 1 }]; }
    if (/^UPDATE sesion SET Sesion_Estado = 0/.test(sql)) {
      db.sesiones.filter((s) => s.Usuario_Id === p[0]).forEach((s) => { s.Sesion_Estado = 0; });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Consulta no esperada en la base de prueba: ${sql}`);
  };
  return db;
}

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const respuesta = (res) => res.json.mock.calls.at(-1)[0];
const ultimoCodigoEnviado = () => mailer.enviarCodigoVerificacion.mock.calls.at(-1)[0].codigo;
const codigoIncorrecto = (bueno) => (bueno === '000000' ? '111111' : '000000');

let base;
let hash;
const DOCENTE = {
  Usuario_Id: 5, Usuario_RUT: '11111111-1', Usuario_Nombre_Completo: 'Ana Torres', Usuario_Estado_Cuenta: 1,
  Usuario_Correo_Verificado: 0, Es_Administrador: 0, Administrador_Tipo: null, Administrador_Correo_Institucional: null,
  Es_Docente: 1, Docente_Correo_Institucional: 'an.torres@colegiojc.cl', Es_Apoderado: 1,
  Apoderado_Correo_Natural: 'ana.torres@gmail.com', Usuario_Telefono: '912345678',
};

beforeAll(async () => {
  process.env.JWT_SECRET = 'secreto_de_prueba_para_jest_de_al_menos_32_chars';
  hash = await bcrypt.hash('Clave2026', 4);
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ now: INICIO, doNotFake: ['nextTick', 'setImmediate'] });
  base = crearBase([{ ...DOCENTE, Usuario_Contraseña: hash }]);
  pool.execute.mockImplementation(base.ejecutar);
  pool.query.mockImplementation(base.ejecutar);
  mailer.correoConfigurado.mockReturnValue(true);
  mailer.enviarCodigoVerificacion.mockResolvedValue();
});

afterEach(() => jest.useRealTimers());

describe('Bot de códigos: emitir y verificar', () => {
  const emitir = (extra = {}) => codigos.emitirCodigo(pool, {
    usuarioId: 5, nombre: 'Ana Torres', correo: 'an.torres@colegiojc.cl', proposito: codigos.PROPOSITOS.RECUPERACION, ...extra,
  });
  const verificar = (codigo) => codigos.verificarCodigo(pool, { usuarioId: 5, proposito: codigos.PROPOSITOS.RECUPERACION, codigo });

  test('Envía un código de 6 dígitos y guarda solo su hash con sal', async () => {
    const r = await emitir();

    expect(r).toEqual({ correoEnmascarado: 'an*******@colegiojc.cl' });
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledWith({
      para: 'an.torres@colegiojc.cl', nombre: 'Ana Torres', codigo: expect.stringMatching(/^\d{6}$/),
      minutos: 10, proposito: 'Recuperacion',
    });
    const [fila] = base.codigos;
    expect(fila.Codigo_Verificacion_Hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fila.Codigo_Verificacion_Sal).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(fila)).not.toContain(`"${ultimoCodigoEnviado()}"`);
    expect(fila.Codigo_Verificacion_Fecha_Expiracion - fila.Codigo_Verificacion_Fecha_Creacion).toBe(10 * 60 * 1000);
  });

  test('El código correcto sirve una sola vez', async () => {
    await emitir();
    const codigo = ultimoCodigoEnviado();

    const fila = await verificar(codigo);
    expect(fila.Codigo_Verificacion_Correo).toBe('an.torres@colegiojc.cl');
    expect(base.codigos[0].Codigo_Verificacion_Estado).toBe('Utilizado');
    await expect(verificar(codigo)).rejects.toThrow('Este código ya fue usado. Pide uno nuevo.');
  });

  test('Acepta el código con espacios o guion y rechaza otro formato sin gastar intentos', async () => {
    await emitir();
    const codigo = ultimoCodigoEnviado();

    await expect(verificar('12345')).rejects.toMatchObject({ status: 400, message: 'El código tiene 6 dígitos.' });
    expect(base.codigos[0].Codigo_Verificacion_Intentos).toBe(0);
    await expect(verificar(`${codigo.slice(0, 3)} ${codigo.slice(3)}`)).resolves.toBeDefined();
  });

  test('Cinco códigos incorrectos bloquean el código, aunque después llegue el correcto', async () => {
    await emitir();
    const codigo = ultimoCodigoEnviado();
    const malo = codigoIncorrecto(codigo);

    await expect(verificar(malo)).rejects.toMatchObject({ message: 'Código incorrecto. Te quedan 4 intentos.', restantes: 4 });
    await expect(verificar(malo)).rejects.toThrow('Te quedan 3 intentos.');
    await expect(verificar(malo)).rejects.toThrow('Te quedan 2 intentos.');
    await expect(verificar(malo)).rejects.toThrow('Te queda 1 intento.');
    await expect(verificar(malo)).rejects.toMatchObject({ restantes: 0, message: 'Se agotaron los intentos para este código. Pide uno nuevo.' });
    expect(base.codigos[0].Codigo_Verificacion_Estado).toBe('Bloqueado');
    await expect(verificar(codigo)).rejects.toThrow('Se agotaron los intentos para este código. Pide uno nuevo.');
  });

  test('El código vence a los 10 minutos', async () => {
    await emitir();
    const codigo = ultimoCodigoEnviado();
    avanzar(10 * 60 + 1);

    await expect(verificar(codigo)).rejects.toThrow('El código venció (dura 10 minutos). Pide uno nuevo.');
    expect(base.codigos[0].Codigo_Verificacion_Estado).toBe('Expirado');
  });

  test('Pedir otro código exige esperar 60 segundos e invalida el anterior', async () => {
    await emitir();
    const primero = ultimoCodigoEnviado();

    avanzar(20);
    await expect(emitir()).rejects.toMatchObject({ status: 429, segundos: 40 });
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledTimes(1);

    avanzar(41);
    await emitir();
    const segundo = ultimoCodigoEnviado();
    expect(base.codigos.map((c) => c.Codigo_Verificacion_Estado)).toEqual(['Expirado', 'Pendiente']);
    if (primero !== segundo) await expect(verificar(primero)).rejects.toThrow('Código incorrecto');
    await expect(verificar(segundo)).resolves.toBeDefined();
  });

  test('Si el correo no se pudo enviar, responde 503 y el código no queda vigente', async () => {
    mailer.enviarCodigoVerificacion.mockRejectedValue(new Error('ECONNREFUSED'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(emitir()).rejects.toMatchObject({ status: 503 });
    expect(base.codigos[0].Codigo_Verificacion_Estado).toBe('Expirado');
    console.error.mockRestore();
  });

  test('En desarrollo sin SMTP devuelve el código y lo muestra en la consola', async () => {
    mailer.correoConfigurado.mockReturnValue(false);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const r = await emitir();

    expect(r.devCodigo).toMatch(/^\d{6}$/);
    expect(mailer.enviarCodigoVerificacion).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain(r.devCodigo);
    log.mockRestore();
  });

  test('Enmascara el correo dejando visibles las dos primeras letras y el dominio', () => {
    expect(codigos.enmascararCorreo('ma.morales@colegiojacquescousteau.cl')).toBe('ma********@colegiojacquescousteau.cl');
    expect(codigos.enmascararCorreo('ab@x.cl')).toBe('ab***@x.cl');
  });
});

describe('Primer ingreso: activar la cuenta con un código', () => {
  const reqLogin = () => ({ body: { rut: '11111111-1', password: 'Clave2026' }, headers: {}, ip: '127.0.0.1' });

  test('Un usuario sin verificar no recibe sesión: recibe un desafío y el código va a su correo principal', async () => {
    const res = nuevoRes();
    await login(reqLogin(), res);

    const r = respuesta(res);
    expect(r).toEqual({
      requiereVerificacion: true, desafio: expect.stringMatching(/^[0-9a-f]{64}$/),
      correoEnmascarado: 'an*******@colegiojc.cl', minutos: 10,
    });
    expect(r).not.toHaveProperty('token');
    expect(base.sesiones).toHaveLength(0);
    // Docente y apoderado: el principal es el institucional
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledWith(expect.objectContaining({
      para: 'an.torres@colegiojc.cl', proposito: 'Activacion',
    }));
  });

  test('Con el código correcto queda verificado y entra; el siguiente login no pide código', async () => {
    const r1 = nuevoRes();
    await login(reqLogin(), r1);
    const { desafio } = respuesta(r1);

    const r2 = nuevoRes();
    await verificarActivacion({ body: { desafio, codigo: ultimoCodigoEnviado() }, headers: {}, ip: '127.0.0.1' }, r2);

    const { token, user } = respuesta(r2);
    expect(jwt.verify(token, process.env.JWT_SECRET)).toEqual(expect.objectContaining({ id: 5, roles: ['Docente', 'Apoderado'] }));
    expect(user.correo).toBe('an.torres@colegiojc.cl');
    expect(base.usuarios[0].Usuario_Correo_Verificado).toBe(1);
    expect(base.sesiones).toHaveLength(1);

    const r3 = nuevoRes();
    await login(reqLogin(), r3);
    expect(respuesta(r3)).toHaveProperty('token');
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledTimes(1);
  });

  test('Un código incorrecto no entrega sesión ni verifica la cuenta', async () => {
    const r1 = nuevoRes();
    await login(reqLogin(), r1);
    const r2 = nuevoRes();
    await verificarActivacion({ body: { desafio: respuesta(r1).desafio, codigo: codigoIncorrecto(ultimoCodigoEnviado()) }, headers: {} }, r2);

    expect(r2.status).toHaveBeenCalledWith(400);
    expect(respuesta(r2)).toEqual({ error: 'Código incorrecto. Te quedan 4 intentos.', intentosRestantes: 4 });
    expect(base.usuarios[0].Usuario_Correo_Verificado).toBe(0);
    expect(base.sesiones).toHaveLength(0);
  });

  test('Volver a iniciar sesión al minuto no envía otro correo: renueva el desafío del mismo código', async () => {
    const r1 = nuevoRes();
    await login(reqLogin(), r1);
    avanzar(15);
    const r2 = nuevoRes();
    await login(reqLogin(), r2);

    expect(respuesta(r2).aviso).toBe('Ya te enviamos un código hace un momento: revisa tu correo.');
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledTimes(1);

    const codigo = ultimoCodigoEnviado();
    const viejo = nuevoRes();
    await verificarActivacion({ body: { desafio: respuesta(r1).desafio, codigo }, headers: {} }, viejo);
    expect(viejo.status).toHaveBeenCalledWith(400);

    const nuevo = nuevoRes();
    await verificarActivacion({ body: { desafio: respuesta(r2).desafio, codigo }, headers: {} }, nuevo);
    expect(respuesta(nuevo)).toHaveProperty('token');
  });

  test('Reenviar: respeta la espera y entrega un desafío y un código nuevos', async () => {
    const r1 = nuevoRes();
    await login(reqLogin(), r1);
    const { desafio } = respuesta(r1);

    const pronto = nuevoRes();
    await reenviarActivacion({ body: { desafio } }, pronto);
    expect(pronto.status).toHaveBeenCalledWith(429);

    avanzar(61);
    const r2 = nuevoRes();
    await reenviarActivacion({ body: { desafio } }, r2);
    const nuevoDesafio = respuesta(r2).desafio;
    expect(nuevoDesafio).not.toBe(desafio);
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledTimes(2);

    const r3 = nuevoRes();
    await verificarActivacion({ body: { desafio: nuevoDesafio, codigo: ultimoCodigoEnviado() }, headers: {} }, r3);
    expect(respuesta(r3)).toHaveProperty('token');
  });

  test('Reenviar con un desafío inventado o vencido pide iniciar sesión de nuevo', async () => {
    const inventado = nuevoRes();
    await reenviarActivacion({ body: { desafio: 'f'.repeat(64) } }, inventado);
    expect(inventado.status).toHaveBeenCalledWith(400);

    const r1 = nuevoRes();
    await login(reqLogin(), r1);
    avanzar(31 * 60);
    const vencido = nuevoRes();
    await reenviarActivacion({ body: { desafio: respuesta(r1).desafio } }, vencido);
    expect(respuesta(vencido)).toEqual({ error: 'La verificación venció. Inicia sesión de nuevo.' });
  });

  test('Si la cuenta se deshabilita antes de ingresar el código, no entra', async () => {
    const r1 = nuevoRes();
    await login(reqLogin(), r1);
    base.usuarios[0].Usuario_Estado_Cuenta = 0;

    const r2 = nuevoRes();
    await verificarActivacion({ body: { desafio: respuesta(r1).desafio, codigo: ultimoCodigoEnviado() }, headers: {} }, r2);
    expect(r2.status).toHaveBeenCalledWith(401);
    expect(base.sesiones).toHaveLength(0);
  });

  test('Una cuenta sin correo registrado entra directo (no hay nada que verificar)', async () => {
    Object.assign(base.usuarios[0], { Docente_Correo_Institucional: null, Apoderado_Correo_Natural: null });
    const res = nuevoRes();
    await login(reqLogin(), res);
    expect(respuesta(res)).toHaveProperty('token');
    expect(mailer.enviarCodigoVerificacion).not.toHaveBeenCalled();
  });

  test('Si el correo de activación no se puede enviar, responde 503 sin sesión', async () => {
    mailer.enviarCodigoVerificacion.mockRejectedValue(new Error('ETIMEDOUT'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = nuevoRes();
    await login(reqLogin(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(base.sesiones).toHaveLength(0);
    console.error.mockRestore();
  });
});

describe('CU14: recuperar la contraseña con un código', () => {
  test('Envía el código al correo elegido y con él cambia la contraseña, verifica el correo y cierra sesiones', async () => {
    base.sesiones.push({ Usuario_Id: 5, Sesion_Estado: 1 });
    const r1 = nuevoRes();
    await forgotPassword({ body: { rut: '11111111-1', correoEnmascarado: 'an********@gmail.com' } }, r1);

    expect(respuesta(r1)).toEqual({
      message: 'Si los datos son correctos, recibirás un código de verificación en tu correo.', minutos: 10,
    });
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledWith(expect.objectContaining({
      para: 'ana.torres@gmail.com', proposito: 'Recuperacion',
    }));

    const r2 = nuevoRes();
    await resetPassword({ body: { rut: '11111111-1', codigo: ultimoCodigoEnviado(), newPassword: 'NuevaClave9' } }, r2);

    expect(respuesta(r2)).toEqual({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
    expect(await bcrypt.compare('NuevaClave9', base.usuarios[0].Usuario_Contraseña)).toBe(true);
    expect(base.usuarios[0].Usuario_Correo_Verificado).toBe(1);
    expect(base.sesiones[0].Sesion_Estado).toBe(0);
  });

  test('Con varios correos exige elegir uno; con un RUT inexistente responde lo mismo que con uno real', async () => {
    const sinElegir = nuevoRes();
    await forgotPassword({ body: { rut: '11111111-1' } }, sinElegir);
    expect(sinElegir.status).toHaveBeenCalledWith(400);

    const inexistente = nuevoRes();
    await forgotPassword({ body: { rut: '22222222-2' } }, inexistente);
    expect(inexistente.status).not.toHaveBeenCalled();
    expect(respuesta(inexistente).message).toContain('Si los datos son correctos');
    expect(mailer.enviarCodigoVerificacion).not.toHaveBeenCalled();
  });

  test('Una contraseña débil se rechaza antes de revisar el código (no gasta intentos)', async () => {
    await forgotPassword({ body: { rut: '11111111-1', correoEnmascarado: 'an*******@colegiojc.cl' } }, nuevoRes());
    const res = nuevoRes();
    await resetPassword({ body: { rut: '11111111-1', codigo: ultimoCodigoEnviado(), newPassword: 'corta' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(base.codigos[0]).toMatchObject({ Codigo_Verificacion_Estado: 'Pendiente', Codigo_Verificacion_Intentos: 0 });
  });

  test('Con un código incorrecto no cambia la contraseña', async () => {
    await forgotPassword({ body: { rut: '11111111-1', correoEnmascarado: 'an*******@colegiojc.cl' } }, nuevoRes());
    const res = nuevoRes();
    await resetPassword({ body: { rut: '11111111-1', codigo: codigoIncorrecto(ultimoCodigoEnviado()), newPassword: 'NuevaClave9' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(respuesta(res).intentosRestantes).toBe(4);
    expect(base.usuarios[0].Usuario_Contraseña).toBe(hash);
  });

  test('Sin un código emitido, o con un RUT inexistente, responde lo mismo', async () => {
    const sinCodigo = nuevoRes();
    await resetPassword({ body: { rut: '11111111-1', codigo: '123456', newPassword: 'NuevaClave9' } }, sinCodigo);
    const inexistente = nuevoRes();
    await resetPassword({ body: { rut: '22222222-2', codigo: '123456', newPassword: 'NuevaClave9' } }, inexistente);

    expect(respuesta(sinCodigo)).toEqual({ error: 'No hay un código vigente. Pide uno nuevo.' });
    expect(respuesta(inexistente)).toEqual({ error: 'No hay un código vigente. Pide uno nuevo.' });
  });
});

describe('CU19: el correo nuevo se guarda al confirmar el código', () => {
  const reqPerfil = (body) => ({ user: { id: 5 }, body });

  test('El código va al correo nuevo y al confirmarlo se guarda y queda verificado', async () => {
    const r1 = nuevoRes();
    await usuarioController.editarPerfilPropio(reqPerfil({ correo: 'ana.torres@colegiojacquescousteau.cl' }), r1);

    expect(respuesta(r1).verificacionCorreo).toEqual({ pendiente: true, correoEnmascarado: 'an********@colegiojacquescousteau.cl', minutos: 10 });
    expect(mailer.enviarCodigoVerificacion).toHaveBeenCalledWith(expect.objectContaining({
      para: 'ana.torres@colegiojacquescousteau.cl', proposito: 'Cambio de correo',
    }));
    expect(base.usuarios[0].Docente_Correo_Institucional).toBe('an.torres@colegiojc.cl');

    const r2 = nuevoRes();
    await usuarioController.confirmarCorreoPropio(reqPerfil({ codigo: ultimoCodigoEnviado() }), r2);

    expect(respuesta(r2)).toEqual(expect.objectContaining({ mensaje: 'Correo actualizado correctamente' }));
    expect(base.usuarios[0]).toMatchObject({
      Docente_Correo_Institucional: 'ana.torres@colegiojacquescousteau.cl', Usuario_Correo_Verificado: 1,
    });
    expect(respuesta(r2).usuario).not.toHaveProperty('Usuario_Contraseña');
  });

  test('Con un código incorrecto el correo no cambia', async () => {
    await usuarioController.editarPerfilPropio(reqPerfil({ correo: 'nueva@colegiojc.cl' }), nuevoRes());
    const res = nuevoRes();
    await usuarioController.confirmarCorreoPropio(reqPerfil({ codigo: codigoIncorrecto(ultimoCodigoEnviado()) }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(respuesta(res)).toEqual({ mensaje: 'Código incorrecto. Te quedan 4 intentos.', intentosRestantes: 4 });
    expect(base.usuarios[0].Docente_Correo_Institucional).toBe('an.torres@colegiojc.cl');
  });

  test('Si otra cuenta registró ese correo mientras llegaba el código, no se guarda', async () => {
    await usuarioController.editarPerfilPropio(reqPerfil({ correo: 'nueva@colegiojc.cl' }), nuevoRes());
    base.usuarios.push({ Usuario_Id: 9, Docente_Correo_Institucional: 'nueva@colegiojc.cl' });

    const res = nuevoRes();
    await usuarioController.confirmarCorreoPropio(reqPerfil({ codigo: ultimoCodigoEnviado() }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(respuesta(res)).toEqual({ mensaje: 'El correo ingresado ya se encuentra registrado' });
    expect(base.usuarios[0].Docente_Correo_Institucional).toBe('an.torres@colegiojc.cl');
  });

  test('Un correo de un dominio que no es del colegio se rechaza sin enviar código', async () => {
    const res = nuevoRes();
    await usuarioController.editarPerfilPropio(reqPerfil({ correo: 'ana@jacquescousteau.edu' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mailer.enviarCodigoVerificacion).not.toHaveBeenCalled();
  });
});

describe('Correo del bot (utils/mailer.js)', () => {
  test('Sale de EMAIL_FROM, marcado como automático, con el código y sin enlaces', async () => {
    const nodemailer = require('nodemailer');
    const sendMail = jest.fn().mockResolvedValue({});
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail });
    const real = jest.requireActual('../utils/mailer');
    process.env.EMAIL_FROM = 'SIGAE <noreply@colegiojc.cl>';
    process.env.SMTP_HOST = 'smtp.gmail.com';

    await real.enviarCodigoVerificacion({
      para: 'an.torres@colegiojc.cl', nombre: 'Ana <b>', codigo: '012345', minutos: 10, proposito: 'Activacion',
    });

    const correo = sendMail.mock.calls[0][0];
    expect(correo).toMatchObject({
      from: 'SIGAE <noreply@colegiojc.cl>', to: 'an.torres@colegiojc.cl',
      subject: 'Código para activar tu cuenta - SIGAE',
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    });
    expect(correo.text).toContain('012345');
    expect(correo.text).toContain('No respondas a este mensaje');
    expect(correo.html).toContain('Ana &lt;b&gt;');
    expect(correo.html).not.toMatch(/<a /);
    await expect(real.enviarCodigoVerificacion({ para: 'x@y.cl', codigo: '1', minutos: 1, proposito: 'Otro' }))
      .rejects.toThrow('Propósito de código desconocido');
    delete process.env.EMAIL_FROM;
    delete process.env.SMTP_HOST;
  });
});
