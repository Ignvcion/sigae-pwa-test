// RF54 / CU85, CU86: recepción de mensajes de apoderados.
const mensajeController = require('../controllers/mensajeController');
const { finDeCitacion, cerrarPorCitacion, moverPorCitacion, camposRecepcion } = require('../utils/recepcionMensajes');
const pool = require('../config/db');

jest.mock('../config/db');

const conversacion = (extra = {}) => ({
  Conversacion_Id: 1112,
  Docente_Usuario_Id: 5,
  Apoderado_Usuario_Id: 4,
  Conversacion_Estado: 1,
  Recepcion_General: 1,
  Habilitada_Hasta: null,
  Apoderado_Puede_Responder: 1,
  ...extra,
});

describe('RF54: recepción de mensajes de apoderados', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    pool.query = jest.fn();
  });

  test('CU85 Excepción 2: con la recepción deshabilitada el apoderado no puede enviar', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '1112';
    req.body.contenido = 'Hola profesora';
    pool.query.mockResolvedValueOnce([[conversacion({ Recepcion_General: 0, Apoderado_Puede_Responder: 0 })]]);

    await mensajeController.enviarMensaje(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ sinRecepcion: true }));
    expect(res.json.mock.calls[0][0].mensaje).toContain('no está recibiendo mensajes');
    expect(pool.query).toHaveBeenCalledTimes(1); // sin INSERT
  });

  test('El docente siempre puede escribir aunque su recepción esté deshabilitada', async () => {
    req.user = { id: 5, roles: ['Docente'] };
    req.params.id = '1112';
    req.body.contenido = 'Le recuerdo la reunión';
    pool.query
      .mockResolvedValueOnce([[conversacion({ Recepcion_General: 0, Apoderado_Puede_Responder: 0 })]])
      .mockResolvedValueOnce([{ insertId: 9 }]);

    await mensajeController.enviarMensaje(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('CU86: con un período habilitado el apoderado sí responde', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '1112';
    req.body.contenido = 'Gracias, ahí estaré';
    pool.query
      .mockResolvedValueOnce([[conversacion({ Recepcion_General: 0, Habilitada_Hasta: '2026-11-12T16:00', Apoderado_Puede_Responder: 1 })]])
      .mockResolvedValueOnce([{ insertId: 10 }]);

    await mensajeController.enviarMensaje(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('CU85: solo un docente cambia la recepción y el valor debe ser booleano', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.body = { habilitada: false };
    await mensajeController.actualizarRecepcion(req, res);
    expect(res.status).toHaveBeenCalledWith(403);

    res.status.mockClear();
    req.user = { id: 5, roles: ['Docente'] };
    req.body = { habilitada: 'no' };
    await mensajeController.actualizarRecepcion(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    res.status.mockClear();
    req.body = { habilitada: false };
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await mensajeController.actualizarRecepcion(req, res);
    expect(pool.query.mock.calls[0][1]).toEqual([0, 5]);
    expect(res.json.mock.calls.at(-1)[0].recepcion).toBe(false);
  });

  test('CU85 Excepción 1: si falla al guardar, informa que se mantiene el estado anterior', async () => {
    req.user = { id: 5, roles: ['Docente'] };
    req.body = { habilitada: true };
    pool.query.mockRejectedValueOnce(new Error('BD caída'));
    await mensajeController.actualizarRecepcion(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].mensaje).toContain('Se mantiene el estado anterior');
  });

  test('CU86: solo el docente de la conversación habilita respuestas', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '1112';
    req.body = { hasta: '2030-01-01T10:00' };
    pool.query.mockResolvedValueOnce([[conversacion()]]);
    await mensajeController.habilitarConversacion(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('CU86 Excepción 1: la fecha de término anterior a la actual se rechaza', async () => {
    req.user = { id: 5, roles: ['Docente'] };
    req.params.id = '1112';
    req.body = { hasta: '2020-01-01T10:00' };
    pool.query
      .mockResolvedValueOnce([[conversacion()]])
      .mockResolvedValueOnce([[{ futuro: 0, limite: 1 }]]);
    await mensajeController.habilitarConversacion(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain('posterior a la fecha y hora actual');
  });

  test('CU86: habilita hasta la fecha indicada y la quita con hasta = null', async () => {
    req.user = { id: 5, roles: ['Docente'] };
    req.params.id = '1112';
    req.body = { hasta: '2030-01-01T10:00' };
    pool.query
      .mockResolvedValueOnce([[conversacion()]])
      .mockResolvedValueOnce([[{ futuro: 1, limite: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await mensajeController.habilitarConversacion(req, res);
    expect(pool.query.mock.calls[2][1]).toEqual(['2030-01-01 10:00:00', 1112]);

    pool.query.mockClear();
    req.body = { hasta: null };
    pool.query.mockResolvedValueOnce([[conversacion()]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await mensajeController.habilitarConversacion(req, res);
    expect(pool.query.mock.calls[1][0]).toContain('Conversacion_Habilitada_Hasta = NULL');
  });

  test('Un apoderado no abre una conversación nueva con un docente que no recibe mensajes', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.body = { rol: 'Apoderado', contactoId: 5 };
    pool.query
      .mockResolvedValueOnce([[{ Contacto_Id: 5, Contacto_Nombre: 'Ana', Recibe_Mensajes: 0, Estudiante_Nombre_Completo: 'Diego', Curso_Nombre: '1A' }]])
      .mockResolvedValueOnce([[]])                                    // sin conversación abierta
      .mockResolvedValueOnce([[{ Docente_Recepcion_Mensajes: 0 }]]);
    await mensajeController.iniciarConversacion(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).toHaveBeenCalledTimes(3); // sin INSERT
  });

  test('camposRecepcion normaliza los valores de la base', () => {
    expect(camposRecepcion({ Recepcion_General: '0', Habilitada_Hasta: '2026-11-12T16:00', Habilitada_Citacion_Id: 35, Apoderado_Puede_Responder: '1' }))
      .toEqual({ Recepcion_General: false, Habilitada_Hasta: '2026-11-12T16:00', Habilitada_Por_Citacion: 35, Apoderado_Puede_Responder: true });
  });

  test('CU86: desde una citación, el período termina con el tramo; se cierra o se mueve con la citación', async () => {
    expect(finDeCitacion('2026-11-12', '15:30 - 16:00')).toBe('2026-11-12 16:00:00');
    expect(finDeCitacion('2026-11-12', 'mal')).toBeNull();
    const conn = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await cerrarPorCitacion(conn, 35);
    expect(conn.query.mock.calls[0][0]).toContain('Conversacion_Habilitada_Hasta = NULL');
    expect(conn.query.mock.calls[0][1]).toEqual([35]);
    await moverPorCitacion(conn, 35, '2026-11-14', '10:00 - 10:30');
    expect(conn.query.mock.calls[1][1]).toEqual(['2026-11-14 10:30:00', 35]);
  });
});
