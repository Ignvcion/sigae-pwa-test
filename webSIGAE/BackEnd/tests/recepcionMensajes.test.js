// Pruebas unitarias — Grupo 1 (RF54 / CU85 y CU86): recepción de mensajes de apoderados
const pool = require('../config/db');
const {
  obtenerRecepcion,
  actualizarRecepcion,
  habilitarConversacion,
  enviarMensaje,
  iniciarConversacion,
} = require('../controllers/mensajeController');

jest.mock('../config/db');

const nuevoRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('RF54 / CU85: Configuración general de recepción de mensajes', () => {
  test('GET /recepcion rechaza usuarios que no tienen rol Docente (403)', async () => {
    const req = { user: { id: 10, roles: ['Apoderado'] } };
    const res = nuevoRes();

    await obtenerRecepcion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /recepcion devuelve estado de recepción y cantidad de conversaciones habilitadas', async () => {
    pool.query.mockResolvedValueOnce([[{ recepcion: 0, habilitadas: 2 }]]);
    const req = { user: { id: 5, roles: ['Docente'] } };
    const res = nuevoRes();

    await obtenerRecepcion(req, res);

    expect(res.json).toHaveBeenCalledWith({
      recepcion: false,
      conversacionesHabilitadas: 2,
    });
  });

  test('PUT /recepcion valida que habilitada sea booleano (400)', async () => {
    const req = { user: { id: 5, roles: ['Docente'] }, body: { habilitada: 'si' } };
    const res = nuevoRes();

    await actualizarRecepcion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PUT /recepcion deshabilita recepción general correctamente', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const req = { user: { id: 5, roles: ['Docente'] }, body: { habilitada: false } };
    const res = nuevoRes();

    await actualizarRecepcion(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE usuario SET Docente_Recepcion_Mensajes'),
      [0, 5]
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ recepcion: false })
    );
  });

  test('PUT /recepcion maneja error de BD manteniendo estado anterior (500 - Excepción 1)', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB error'));
    const req = { user: { id: 5, roles: ['Docente'] }, body: { habilitada: true } };
    const res = nuevoRes();

    await actualizarRecepcion(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mensaje: expect.stringContaining('Se mantiene el estado anterior'),
      })
    );
  });
});

describe('RF54 / CU86: Habilitar respuestas en conversación puntual', () => {
  test('Rechaza ID de conversación inválido (400)', async () => {
    const req = { params: { id: 'abc' }, user: { id: 5, roles: ['Docente'] }, body: { hasta: null } };
    const res = nuevoRes();

    await habilitarConversacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Rechaza formato de fecha inválido (400)', async () => {
    const req = {
      params: { id: '12' },
      user: { id: 5, roles: ['Docente'] },
      body: { hasta: '15-11-2026 18:00' },
    };
    const res = nuevoRes();

    await habilitarConversacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Rechaza si quien habilita es el Apoderado de la conversación (403)', async () => {
    pool.query.mockResolvedValueOnce([[{
      Conversacion_Id: 12,
      Docente_Usuario_Id: 5,
      Apoderado_Usuario_Id: 20,
      Conversacion_Estado: 1,
      Recepcion_General: 0,
      Habilitada_Hasta: null,
      Habilitada_Citacion_Id: null,
      Apoderado_Puede_Responder: 0,
    }]]);

    const req = {
      params: { id: '12' },
      user: { id: 20, roles: ['Apoderado'] },
      body: { hasta: '2026-12-01T18:00' },
    };
    const res = nuevoRes();

    await habilitarConversacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('Rechaza fecha anterior o igual a la actual (400 - Excepción 1)', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        Conversacion_Id: 12,
        Docente_Usuario_Id: 5,
        Apoderado_Usuario_Id: 20,
        Conversacion_Estado: 1,
        Recepcion_General: 0,
        Habilitada_Hasta: null,
        Habilitada_Citacion_Id: null,
        Apoderado_Puede_Responder: 0,
      }]])
      .mockResolvedValueOnce([[{ futuro: 0, limite: 1 }]]);

    const req = {
      params: { id: '12' },
      user: { id: 5, roles: ['Docente'] },
      body: { hasta: '2026-10-01T10:00' },
    };
    const res = nuevoRes();

    await habilitarConversacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mensaje: expect.stringContaining('posterior a la fecha y hora actual'),
      })
    );
  });

  test('Habilita respuestas hasta fecha futura válida (200)', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        Conversacion_Id: 12,
        Docente_Usuario_Id: 5,
        Apoderado_Usuario_Id: 20,
        Conversacion_Estado: 1,
        Recepcion_General: 0,
        Habilitada_Hasta: null,
        Habilitada_Citacion_Id: null,
        Apoderado_Puede_Responder: 0,
      }]])
      .mockResolvedValueOnce([[{ futuro: 1, limite: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const req = {
      params: { id: '12' },
      user: { id: 5, roles: ['Docente'] },
      body: { hasta: '2026-12-01T18:00' },
    };
    const res = nuevoRes();

    await habilitarConversacion(req, res);

    expect(res.json).toHaveBeenCalledWith({
      mensaje: 'Respuestas del apoderado habilitadas hasta la fecha indicada',
      Habilitada_Hasta: '2026-12-01T18:00',
    });
  });

  test('Cierra habilitación puntual cuando hasta es null (200)', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        Conversacion_Id: 12,
        Docente_Usuario_Id: 5,
        Apoderado_Usuario_Id: 20,
        Conversacion_Estado: 1,
        Recepcion_General: 0,
        Habilitada_Hasta: '2026-12-01T18:00',
        Habilitada_Citacion_Id: null,
        Apoderado_Puede_Responder: 1,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const req = {
      params: { id: '12' },
      user: { id: 5, roles: ['Docente'] },
      body: { hasta: null },
    };
    const res = nuevoRes();

    await habilitarConversacion(req, res);

    expect(res.json).toHaveBeenCalledWith({
      mensaje: 'Se cerró la recepción de respuestas en esta conversación',
      Habilitada_Hasta: null,
    });
  });
});

describe('RF54 / CU85 Excepción 2: Bloqueo de respuesta e inicio de chat para apoderados', () => {
  test('Bloquea envío de mensaje del apoderado si recepción está deshabilitada (403)', async () => {
    pool.query.mockResolvedValueOnce([[{
      Conversacion_Id: 12,
      Docente_Usuario_Id: 5,
      Apoderado_Usuario_Id: 20,
      Conversacion_Estado: 1,
      Recepcion_General: 0,
      Habilitada_Hasta: null,
      Habilitada_Citacion_Id: null,
      Apoderado_Puede_Responder: 0,
    }]]);

    const req = {
      params: { id: '12' },
      user: { id: 20, roles: ['Apoderado'] },
      body: { contenido: 'Hola profesor' },
    };
    const res = nuevoRes();

    await enviarMensaje(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ sinRecepcion: true })
    );
  });

  test('Impide que apoderado inicie nueva conversación si docente deshabilitó recepción (403)', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        Contacto_Id: 5,
        Contacto_Nombre: 'María Morales',
        Recibe_Mensajes: 0,
        Estudiante_Nombre_Completo: 'Juan Pérez',
        Curso_Nombre: '1° Básico A',
      }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Docente_Recepcion_Mensajes: 0 }]]);

    const req = {
      user: { id: 20, roles: ['Apoderado'] },
      body: { contactoId: 5, rol: 'Apoderado' },
    };
    const res = nuevoRes();

    await iniciarConversacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ sinRecepcion: true })
    );
  });
});
