const conflictos = require('../controllers/conflictosHorarioController');
const bloquesController = require('../controllers/bloquesController');
const pool = require('../config/db');

jest.mock('../config/db');

const crearConnMock = () => ({
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(),
  execute: jest.fn(),
});

const CLASE_PENDIENTE = {
  Horario_Asignatura_Id: 222222,
  Curso_Id: 222,
  Usuario_Id: 3,
  Dia: 'Lunes',
  Bloque_Horario_Id: 11111111,
  Desajustado: 1,
};

const DESTINO_VIGENTE = {
  Bloque_Horario_Id: 11111115,
  Bloque_Horario_Tipo: 'Clase',
  Bloque_Horario_Hora_Inicio: '08:30:00',
  Bloque_Horario_Hora_Fin: '10:00:00',
  Desajustado: 0,
};

describe('Reubicación de clases tras redefinir la jornada o los bloques', () => {
  let req;
  let res;
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { horarioId: '222222' }, body: { bloqueDestinoId: 11111115 }, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    conn = crearConnMock();
    pool.getConnection = jest.fn().mockResolvedValue(conn);
    pool.query = jest.fn();
    pool.execute = jest.fn();
  });

  // ── Sugerencia de destino ──
  test('Sugiere el bloque vigente que contiene la hora original de la clase', () => {
    const clase = { Bloque_Horario_Id: 1, Hora_Inicio: '09:15:00', Hora_Fin: '10:00:00', Jornada: 'Mañana' };
    const destinos = [
      { Bloque_Horario_Id: 2, Bloque_Horario_Hora_Inicio: '10:00:00', Bloque_Horario_Hora_Fin: '10:45:00', Bloque_Horario_Jornada: 'Mañana' },
      { Bloque_Horario_Id: 3, Bloque_Horario_Hora_Inicio: '08:30:00', Bloque_Horario_Hora_Fin: '10:00:00', Bloque_Horario_Jornada: 'Mañana' },
    ];

    expect(conflictos.sugerirDestino(clase, destinos)).toBe(3);
  });

  test('Sin bloque que la contenga, sugiere el de inicio más cercano', () => {
    const clase = { Bloque_Horario_Id: 1, Hora_Inicio: '08:00:00', Hora_Fin: '08:45:00', Jornada: 'Mañana' };
    const destinos = [
      { Bloque_Horario_Id: 2, Bloque_Horario_Hora_Inicio: '11:00:00', Bloque_Horario_Hora_Fin: '11:45:00', Bloque_Horario_Jornada: 'Mañana' },
      { Bloque_Horario_Id: 3, Bloque_Horario_Hora_Inicio: '09:00:00', Bloque_Horario_Hora_Fin: '09:45:00', Bloque_Horario_Jornada: 'Mañana' },
    ];

    expect(conflictos.sugerirDestino(clase, destinos)).toBe(3);
  });

  // ── Listado ──
  test('Lista las clases pendientes con su destino sugerido y los bloques vigentes', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        Horario_Asignatura_Id: 222222, Bloque_Horario_Id: 11111111,
        Hora_Inicio: '09:15:00', Hora_Fin: '10:00:00', Jornada: 'Mañana', Motivo: 'Bloque reemplazado',
      }]])
      .mockResolvedValueOnce([[{
        Bloque_Horario_Id: 11111115, Bloque_Horario_Hora_Inicio: '08:30:00',
        Bloque_Horario_Hora_Fin: '10:00:00', Bloque_Horario_Jornada: 'Mañana',
      }]]);

    await conflictos.getConflictos(req, res);

    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta.clases[0]).toEqual(expect.objectContaining({ Horario_Asignatura_Id: 222222, Sugerido_Id: 11111115 }));
    expect(respuesta.destinos).toHaveLength(1);
  });

  // ── Migrar ──
  test('Migra la clase al bloque elegido y limpia el bloque viejo si quedó vacío', async () => {
    conn.query
      .mockResolvedValueOnce([[CLASE_PENDIENTE]])   // clase FOR UPDATE
      .mockResolvedValueOnce([[DESTINO_VIGENTE]])   // destino
      .mockResolvedValueOnce([[]])                  // choque curso
      .mockResolvedValueOnce([[]])                  // choque docente
      .mockResolvedValueOnce([[{ Curso_Periodo_Lectivo: '2026' }]]) // período del curso (CU107)
      .mockResolvedValueOnce([[]])                  // disponibilidad laboral: sin restricción
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[{ Desajustado: 1, Clases: 0, Eventos: 0 }]]) // bloque viejo
      .mockResolvedValueOnce([{ affectedRows: 0 }]) // DELETE clases eliminadas del bloque viejo
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE bloque viejo

    await conflictos.migrarClase(req, res);

    expect(conn.query.mock.calls[6][1]).toEqual([11111115, 222222]);
    expect(conn.query.mock.calls[8][1]).toEqual([[11111111], 'Eliminado']);
    expect(conn.query.mock.calls[9][1]).toEqual([11111111]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Clase migrada al nuevo bloque', bloqueEliminado: true });
  });

  test('Si otro administrador ya la resolvió, responde 409 sin modificar nada', async () => {
    conn.query.mockResolvedValueOnce([[{ ...CLASE_PENDIENTE, Desajustado: 0 }]]);

    await conflictos.migrarClase(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'YA_RESUELTA' }));
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledTimes(1);
  });

  test('Una clase de un bloque por eliminar (?bloque) también se puede migrar', async () => {
    req.body.bloque = 11111111;
    conn.query
      .mockResolvedValueOnce([[{ ...CLASE_PENDIENTE, Desajustado: 0 }]])
      .mockResolvedValueOnce([[DESTINO_VIGENTE]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Curso_Periodo_Lectivo: '2026' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ Desajustado: 0, Clases: 0, Eventos: 0 }]]);

    await conflictos.migrarClase(req, res);

    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Clase migrada al nuevo bloque', bloqueEliminado: false });
  });

  test('CU107: no migra si el destino queda fuera de la disponibilidad laboral del docente', async () => {
    conn.query
      .mockResolvedValueOnce([[CLASE_PENDIENTE]])
      .mockResolvedValueOnce([[DESTINO_VIGENTE]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Curso_Periodo_Lectivo: '2026' }]])
      .mockResolvedValueOnce([[ // el lunes solo está disponible de 10:00 a 13:00; el destino es 08:30–10:00
        { Docente_Usuario_Id: 3, periodo: '2026', dia: 'Lunes', hora_inicio: '10:00:00', hora_fin: '13:00:00' },
      ]]);

    await conflictos.migrarClase(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toContain('disponibilidad laboral de 2026');
    expect(res.json.mock.calls[0][0].error).toContain('10:00–13:00');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('Rechaza un destino desajustado o de recreo', async () => {
    conn.query
      .mockResolvedValueOnce([[CLASE_PENDIENTE]])
      .mockResolvedValueOnce([[{ ...DESTINO_VIGENTE, Bloque_Horario_Tipo: 'Recreo' }]]);

    await conflictos.migrarClase(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('Rechaza migrar si el curso ya tiene otra clase en ese horario', async () => {
    conn.query
      .mockResolvedValueOnce([[CLASE_PENDIENTE]])
      .mockResolvedValueOnce([[DESTINO_VIGENTE]])
      .mockResolvedValueOnce([[{ Asignatura_Nombre: 'Lenguaje y Comunicación' }]]);

    await conflictos.migrarClase(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'El curso ya tiene Lenguaje y Comunicación en ese horario el Lunes' });
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('Rechaza migrar si el docente ya tiene clase en ese horario', async () => {
    conn.query
      .mockResolvedValueOnce([[CLASE_PENDIENTE]])
      .mockResolvedValueOnce([[DESTINO_VIGENTE]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Curso_Nombre: '1ero Básico B' }]]);

    await conflictos.migrarClase(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'El docente ya tiene clase con 1ero Básico B en ese horario el Lunes' });
  });

  test('Sin bloque de destino responde 400', async () => {
    req.body = {};

    await conflictos.migrarClase(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  // ── Eliminar ──
  test('Elimina la clase pendiente del horario', async () => {
    conn.query
      .mockResolvedValueOnce([[CLASE_PENDIENTE]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ Desajustado: 1, Clases: 1, Eventos: 0 }]]);

    await conflictos.eliminarClase(req, res);

    expect(conn.query.mock.calls[1][1]).toEqual([222222]);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Clase eliminada del horario', bloqueEliminado: false });
  });

  test('Si la clase tiene registros en el historial, responde 409 y no la borra', async () => {
    const errorFk = Object.assign(new Error('fk'), { code: 'ER_ROW_IS_REFERENCED_2' });
    conn.query
      .mockResolvedValueOnce([[CLASE_PENDIENTE]])
      .mockRejectedValueOnce(errorFk);

    await conflictos.eliminarClase(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'No se puede eliminar: la clase tiene registros asociados en el historial' });
  });

  // ── Impacto de cambiar la jornada ──
  test('Calcula cuántas clases quedarían fuera de la nueva jornada', async () => {
    req.body = { Parametro_Institucional_Inicio_Jornada: '09:00', Parametro_Institucional_Fin_Jornada: '16:30' };
    pool.query.mockResolvedValueOnce([[
      { Bloque_Horario_Id: 1, Clases: '2' },
      { Bloque_Horario_Id: 2, Clases: '0' },
    ]]);

    await conflictos.getImpactoParametros(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual(['09:00', '16:30']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ clases: 2 }));
  });

  test('Impacto: jornada inválida responde 400', async () => {
    req.body = { Parametro_Institucional_Inicio_Jornada: '17:00', Parametro_Institucional_Fin_Jornada: '08:00' };

    await conflictos.getImpactoParametros(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Redefinir bloques: crear un bloque que se superpone', () => {
  let req;
  let res;
  let conn;

  const PARAMETROS = {
    Parametro_Institucional_Id: 111111,
    Parametro_Institucional_Inicio_Jornada: '08:30:00',
    Parametro_Institucional_Fin_Jornada: '16:30:00',
  };
  const BLOQUE_VIEJO = {
    Bloque_Horario_Id: 11111111, Bloque_Horario_Hora_Inicio: '09:15:00',
    Bloque_Horario_Hora_Fin: '10:00:00', Bloque_Horario_Tipo: 'Clase', clases: 2, eventos: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {
        Bloque_Horario_Hora_Inicio: '08:30',
        Bloque_Horario_Hora_Fin: '10:00',
        Bloque_Horario_Jornada: 'Mañana',
        Bloque_Horario_Tipo: 'Clase',
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    conn = crearConnMock();
    pool.getConnection = jest.fn().mockResolvedValue(conn);
    pool.execute = jest.fn();
  });

  test('Un bloque que parte justo al inicio de la jornada ("08:30" vs "08:30:00") no se rechaza', async () => {
    pool.execute
      .mockResolvedValueOnce([[PARAMETROS]])
      .mockResolvedValueOnce([[]]); // sin superposición
    conn.execute.mockResolvedValueOnce([{ insertId: 11111115 }]);

    await bloquesController.createBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('Sin confirmar, informa los bloques superpuestos y sus clases (409 SUPERPOSICION)', async () => {
    pool.execute
      .mockResolvedValueOnce([[PARAMETROS]])
      .mockResolvedValueOnce([[BLOQUE_VIEJO]]);

    await bloquesController.createBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      codigo: 'SUPERPOSICION',
      bloques: [expect.objectContaining({ Bloque_Horario_Id: 11111111, clases: 2 })],
    }));
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('Con reemplazar=true crea el bloque, borra los reemplazados vacíos y deja pendientes las clases', async () => {
    req.body.reemplazar = true;
    const recreoVacio = { ...BLOQUE_VIEJO, Bloque_Horario_Id: 11111120, Bloque_Horario_Tipo: 'Recreo', clases: 0, eventos: 0 };
    pool.execute
      .mockResolvedValueOnce([[PARAMETROS]])
      .mockResolvedValueOnce([[BLOQUE_VIEJO, recreoVacio]]);
    conn.execute
      .mockResolvedValueOnce([{ insertId: 11111115 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await bloquesController.createBloque(req, res);

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.execute.mock.calls[1][1]).toEqual([11111120]);
    expect(conn.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 11111115, clasesPendientes: 2 }));
  });
});
