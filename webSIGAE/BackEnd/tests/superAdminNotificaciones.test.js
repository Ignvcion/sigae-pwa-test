// - Los Super Administradores se crean solo por script (scripts/crearSuperAdmin.js):
//   ninguna ruta crea uno ni convierte a un usuario en Super Admin.
// - El Super Administrador puede corregir su propio nombre y RUT desde su perfil.
// - CU101: notificaciones de mensajes y citaciones (utils/notificaciones.js).
const db = require('../config/db');
const usuarioController = require('../controllers/usuarioController');
const notificaciones = require('../utils/notificaciones');

jest.mock('../config/db');

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const SUPER_ADMIN = { id: 1, roles: ['Administrador'], administradorTipo: 'Super Admin' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Super Administradores solo por script', () => {
  test('asignar el rol Administrador con tipo Super Admin se rechaza', async () => {
    db.query.mockResolvedValueOnce([[{ Usuario_Id: 9, Es_Administrador: 0, Es_Docente: 0, Es_Apoderado: 1, Administrador_Tipo: null }]]);
    const res = nuevoRes();
    await usuarioController.asignarRol({
      params: { id: '9' },
      body: { rol: 'Administrador', Administrador_Tipo: 'Super Admin', Administrador_Correo_Institucional: 'sa@colegiojc.cl' },
      user: SUPER_ADMIN,
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].mensaje).toMatch(/crearSuperAdmin\.js/);
    expect(db.query).toHaveBeenCalledTimes(1); // no se actualizó nada
  });

  test('registrar un usuario con tipo Super Admin se rechaza', async () => {
    const res = nuevoRes();
    await usuarioController.createUsuario({
      body: {
        Usuario_RUT: '9343727-6', Usuario_Nombre_Completo: 'Carlos Gonzales', Usuario_Telefono: '979746782',
        Es_Administrador: 1, Administrador_Tipo: 'Super Admin', Administrador_Correo_Institucional: 'ca@colegiojc.cl',
      },
      user: SUPER_ADMIN,
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('cambiar los roles no puede dejar a alguien como Super Admin', async () => {
    db.query.mockResolvedValueOnce([[{ Usuario_Id: 2, Administrador_Tipo: 'Administrador Normal' }]]);
    const res = nuevoRes();
    await usuarioController.updateRoles({
      params: { id: '2' },
      body: { Es_Administrador: 1, Es_Docente: 0, Es_Apoderado: 0, Administrador_Tipo: 'Super Admin' },
      user: SUPER_ADMIN,
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('Perfil del Super Administrador: nombre y RUT', () => {
  const superAdmin = {
    Usuario_Id: 1, Usuario_Nombre_Completo: 'Esperanza Gonzales', Usuario_RUT: '5682711-0',
    Usuario_Telefono: '961900000', Es_Administrador: 1, Administrador_Tipo: 'Super Admin',
    Es_Docente: 0, Es_Apoderado: 0, Administrador_Correo_Institucional: 'es.gonzales@colegiojc.cl',
  };

  test('corrige su nombre y su RUT, y queda en el historial', async () => {
    db.query
      .mockResolvedValueOnce([[superAdmin]])           // SELECT actual
      .mockResolvedValueOnce([[]])                     // RUT no duplicado
      .mockResolvedValueOnce([{ affectedRows: 1 }])    // UPDATE
      .mockResolvedValueOnce([{}])                     // historial nombre
      .mockResolvedValueOnce([{}])                     // historial RUT
      .mockResolvedValueOnce([[{ ...superAdmin, Usuario_Nombre_Completo: 'Esperanza Penélope Gonzales', Usuario_RUT: '12345678-5' }]]);
    const res = nuevoRes();
    await usuarioController.editarPerfilPropio({
      user: SUPER_ADMIN,
      body: { nombre: '  Esperanza   Penélope Gonzales ', rut: '12.345.678-5', telefono: '961900000' },
    }, res);

    expect(res.status).not.toHaveBeenCalled();
    const [sqlUpdate, valores] = db.query.mock.calls[2];
    expect(sqlUpdate).toContain('Usuario_Nombre_Completo = ?');
    expect(sqlUpdate).toContain('Usuario_RUT = ?');
    expect(valores).toEqual(['Esperanza Penélope Gonzales', '12345678-5', '961900000', 1]);
    expect(db.query.mock.calls.filter(([sql]) => /INSERT INTO historial/.test(sql))).toHaveLength(2);
    expect(res.json.mock.calls[0][0].mensaje).toMatch(/inicias sesión con el RUT 12345678-5/);
  });

  test('rechaza un RUT que pertenece a otra cuenta', async () => {
    db.query.mockResolvedValueOnce([[superAdmin]]).mockResolvedValueOnce([[{ Usuario_Id: 4 }]]);
    const res = nuevoRes();
    await usuarioController.editarPerfilPropio({ user: SUPER_ADMIN, body: { rut: '5738925-7' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toMatch(/otra cuenta/);
  });

  test('valida el formato antes de tocar la base', async () => {
    const res = nuevoRes();
    await usuarioController.editarPerfilPropio({ user: SUPER_ADMIN, body: { rut: '12345678-9' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    await usuarioController.editarPerfilPropio({ user: SUPER_ADMIN, body: { nombre: 'Ana123' } }, res);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('un administrador normal, un docente o un apoderado no pueden cambiar su nombre ni su RUT', async () => {
    for (const user of [
      { id: 2, roles: ['Administrador'], administradorTipo: 'Administrador Normal' },
      { id: 3, roles: ['Docente'] },
      { id: 4, roles: ['Apoderado'] },
    ]) {
      const res = nuevoRes();
      await usuarioController.editarPerfilPropio({ user, body: { nombre: 'Otro Nombre' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(db.query).not.toHaveBeenCalled();
  });

  test('si el token dice Super Admin pero la cuenta ya no lo es, se rechaza', async () => {
    db.query.mockResolvedValueOnce([[{ ...superAdmin, Administrador_Tipo: 'Administrador Normal' }]]);
    const res = nuevoRes();
    await usuarioController.editarPerfilPropio({ user: SUPER_ADMIN, body: { nombre: 'Otro Nombre' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CU101: notificaciones', () => {
  test('una citación notifica a las partes, menos a quien hizo el cambio', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);
    await notificaciones.notificarCitacion(db, {
      citacionId: 7, tipo: notificaciones.TIPOS.CITACION_CONFIRMADA, usuarioIds: [3, 4], actorId: 4,
    });
    const inserts = db.query.mock.calls.filter(([sql]) => /INSERT INTO notificacion/.test(sql));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(['Citación confirmada', 3, 7]);
  });

  test('si ya hay una sin leer de la misma citación, la actualiza en vez de crear otra', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await notificaciones.notificarCitacion(db, {
      citacionId: 7, tipo: notificaciones.TIPOS.CITACION_REPROGRAMADA, usuarioIds: [3], actorId: 1,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/^\s*UPDATE notificacion SET Notificacion_Tipo/);
  });

  test('un mensaje se agrupa por conversación', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([{ insertId: 1 }]);
    await notificaciones.notificarMensaje(db, { mensajeId: 50, conversacionId: 9, destinatarioId: 4 });
    expect(db.query.mock.calls[0][0]).toMatch(/m\.Conversacion_Id = \?/);
    expect(db.query.mock.calls[1][1]).toEqual(['Mensaje', 4, 50]);
  });

  test('un error al notificar no interrumpe la acción', async () => {
    db.query.mockRejectedValue(new Error('caída'));
    await expect(notificaciones.notificarMensaje(db, { mensajeId: 1, conversacionId: 1, destinatarioId: 2 })).resolves.toBeUndefined();
    await expect(notificaciones.notificarCitacion(db, { citacionId: 1, tipo: 'x', usuarioIds: [2], actorId: 1 })).resolves.toBeUndefined();
  });

  test('describir arma título, detalle y enlace', () => {
    expect(notificaciones.describir({
      Notificacion_Id: 1, Notificacion_Tipo: 'Mensaje', Notificacion_Fecha_Hora: '2026-11-12 10:00:00', Notificacion_Leida: 0,
      Mensaje_Id: 5, Conversacion_Id: 9, Mensaje_Extracto: 'Hola', Contraparte: 'Ana Torres', Rol_Destinatario: 'Apoderado',
    })).toMatchObject({ titulo: 'Nuevo mensaje de Ana Torres', detalle: 'Hola', enlace: '/mensajes?conversacion=9', leida: false });
    expect(notificaciones.describir({
      Notificacion_Id: 2, Notificacion_Tipo: 'Citación cancelada', Notificacion_Leida: 1, Citacion_Id: 7,
      Citacion_Fecha: '2026-11-20', Citacion_Tramo_Horario: '10:00 - 10:30', Estudiante_Nombre_Completo: 'Pedro Soto',
      Contraparte: 'Ana Torres', Rol_Destinatario: 'Apoderado',
    })).toMatchObject({
      titulo: 'Citación cancelada', detalle: 'Pedro Soto · 20-11-2026 10:00 - 10:30 · con Ana Torres', enlace: '/citaciones?citacion=7', leida: true,
    });
  });

  test('el listado filtra por el perfil y cuenta las no leídas', async () => {
    db.query
      .mockResolvedValueOnce([[{ Notificacion_Id: 1, Notificacion_Tipo: 'Mensaje', Mensaje_Id: 5, Conversacion_Id: 9, Notificacion_Leida: 0 }]])
      .mockResolvedValueOnce([[{ noLeidas: 3 }]]);
    const r = await notificaciones.listarNotificaciones(db, { usuarioId: 4, rol: 'Apoderado', limite: 500 });
    expect(r.noLeidas).toBe(3);
    expect(r.notificaciones).toHaveLength(1);
    expect(db.query.mock.calls[0][1]).toEqual([4, 'Apoderado', 'Apoderado', 100]); // tope de 100
    db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ noLeidas: 0 }]]);
    await notificaciones.listarNotificaciones(db, { usuarioId: 4, rol: 'Administrador' });
    expect(db.query.mock.calls[2][1]).toEqual([4, null, null, 20]); // rol desconocido: sin filtro
  });
});
