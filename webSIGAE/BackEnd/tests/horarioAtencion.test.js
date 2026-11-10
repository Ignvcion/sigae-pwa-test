const controller = require('../controllers/horarioAtencionController');
const pool = require('../config/db');

jest.mock('../config/db');

// Fecha futura (YYYY-MM-DD) que cae en el día de la semana indicado (1 = lunes … 5 = viernes)
function proximoDia(diaSemana) {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() !== diaSemana) d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// CU107: período vigente y disponibilidad laboral del docente (vacía = sin restricción)
const PERIODO = [[{ Parametro_Institucional_Id: 1, Parametro_Institucional_Periodo_Vigente: '2026', Parametro_Institucional_Periodo_Siguiente: null }]];
const SIN_DISPONIBILIDAD = [[]];

const bloqueBD = (extra = {}) => ({
  Horario_Atencion_Id: 1,
  Horario_Atencion_Dia_Semana: 'Martes',
  Horario_Atencion_Hora_Inicio: '14:00:00',
  Horario_Atencion_Hora_Fin: '16:00:00',
  Docente_Usuario_Id: 3,
  ...extra,
});

describe('Pruebas Unitarias - CU87/CU88: Horario de atención de apoderados (RF55)', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: { id: 3, roles: ['Docente'] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    pool.query = jest.fn();
  });

  describe('validarBloque', () => {
    test('acepta un bloque válido y normaliza las horas a minutos', () => {
      expect(controller.validarBloque({ dia: 'Martes', horaInicio: '14:00', horaFin: '15:30' })).toEqual({
        errores: null,
        datos: { dia: 'Martes', inicio: 840, fin: 930 },
      });
    });

    test('CU87 Excepción 1: datos incompletos', () => {
      const { errores } = controller.validarBloque({});
      expect(Object.keys(errores)).toEqual(['dia', 'horaInicio', 'horaFin']);
    });

    test('CU87 Excepción 1: la hora de inicio no es anterior a la de término', () => {
      const { errores } = controller.validarBloque({ dia: 'Lunes', horaInicio: '15:00', horaFin: '15:00' });
      expect(errores.horaFin).toBe('La hora de inicio debe ser anterior a la hora de término');
    });

    test('rechaza sábado, horas fuera de 08:00–18:00 y bloques sin espacio para una citación de 30 minutos', () => {
      expect(controller.validarBloque({ dia: 'Sábado', horaInicio: '10:00', horaFin: '11:00' }).errores.dia).toBeDefined();
      expect(controller.validarBloque({ dia: 'Lunes', horaInicio: '17:30', horaFin: '18:30' }).errores.horaInicio)
        .toBe('El horario de atención debe estar entre las 08:00 y las 18:00');
      // 10:15–10:50 no contiene ningún tramo 10:30–11:00
      expect(controller.validarBloque({ dia: 'Lunes', horaInicio: '10:15', horaFin: '10:50' }).errores.horaFin)
        .toBe('El bloque debe incluir al menos una citación de 30 minutos (en punto o y media)');
    });

    test('acepta tramos que no empiezan en punto ni y media (bloques de 45 minutos)', () => {
      // 09:15–10:00 contiene la citación 09:30–10:00
      expect(controller.validarBloque({ dia: 'Lunes', horaInicio: '09:15', horaFin: '10:00' }).errores).toBeNull();
      expect(controller.alcanzaParaCitacion(555, 600)).toBe(true);
      expect(controller.alcanzaParaCitacion(555, 585)).toBe(false);
    });
  });

  test('solo un docente puede gestionar su horario de atención', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    await controller.crearBloqueAtencion(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('lista los bloques del docente con horas HH:MM', async () => {
    pool.query.mockResolvedValueOnce([[bloqueBD()]]);
    await controller.getMiHorarioAtencion(req, res);
    expect(pool.query.mock.calls[0][1]).toEqual([3]);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ Horario_Atencion_Hora_Inicio: '14:00', Horario_Atencion_Hora_Fin: '16:00' }),
    ]);
  });

  test('CU87 Flujo correcto: registra el bloque si no choca con clases ni con otro bloque', async () => {
    req.body = { dia: 'Lunes', horaInicio: '15:00', horaFin: '16:00' };
    pool.query
      .mockResolvedValueOnce([[]])            // clases del docente en el intervalo
      .mockResolvedValueOnce([[bloqueBD()]])  // otros bloques (martes, no choca)
      .mockResolvedValueOnce(PERIODO)
      .mockResolvedValueOnce(SIN_DISPONIBILIDAD)
      .mockResolvedValueOnce([{ insertId: 7 }]);

    await controller.crearBloqueAtencion(req, res);

    // La consulta de choques repite sus parámetros para clases, electivos y bloques P.I.E.
    expect(pool.query.mock.calls[0][0]).toContain('FROM clase_electivo');
    expect(pool.query.mock.calls[0][0]).toContain('FROM bloque_pie_docente');
    expect(pool.query.mock.calls[0][1]).toEqual(Array(3).fill([3, 'Lunes', '16:00', '15:00']).flat());
    expect(pool.query.mock.calls[4][0]).toContain('INSERT INTO horario_atencion');
    expect(pool.query.mock.calls[4][1]).toEqual(['Lunes', '15:00', '16:00', 3]);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('CU87 Excepción 2: el bloque se superpone con una clase y no se registra', async () => {
    req.body = { dia: 'Lunes', horaInicio: '09:00', horaFin: '10:00' };
    pool.query.mockResolvedValueOnce([[{
      id: 222222, curso: '1ero Básico A', asignatura: 'Matemática', horaInicio: '09:15:00', horaFin: '10:00:00',
    }]]);

    await controller.crearBloqueAtencion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].mensaje)
      .toBe('El bloque se superpone con una clase asignada: 1ero Básico A — Matemática (09:15–10:00)');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('CU87 Excepción 3: el bloque se superpone con otro bloque de atención', async () => {
    req.body = { dia: 'Martes', horaInicio: '15:30', horaFin: '17:00' };
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[bloqueBD()]]);

    await controller.crearBloqueAtencion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].mensaje).toBe('El bloque se superpone con otro bloque de atención (Martes 14:00–16:00)');
  });

  test('CU88: un bloque contiguo (termina cuando empieza otro) no se considera superpuesto', async () => {
    req.body = { dia: 'Martes', horaInicio: '16:00', horaFin: '17:00' };
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[bloqueBD()]])
      .mockResolvedValueOnce(PERIODO).mockResolvedValueOnce(SIN_DISPONIBILIDAD).mockResolvedValueOnce([{ insertId: 8 }]);

    await controller.crearBloqueAtencion(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('CU88: no se puede modificar el bloque de otro docente', async () => {
    req.params.id = '1';
    req.body = { dia: 'Martes', horaInicio: '14:00', horaFin: '15:00' };
    pool.query.mockResolvedValueOnce([[]]);

    await controller.actualizarBloqueAtencion(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual([1, 3]);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('CU88 Excepción 1: al acortar un bloque con citaciones a futuro pide confirmación', async () => {
    const martes = proximoDia(2);
    req.params.id = '1';
    req.body = { dia: 'Martes', horaInicio: '14:00', horaFin: '15:00' };
    pool.query
      .mockResolvedValueOnce([[bloqueBD()]])  // bloque propio
      .mockResolvedValueOnce([[]])            // clases
      .mockResolvedValueOnce([[bloqueBD()]])  // bloques (se excluye a sí mismo)
      .mockResolvedValueOnce(PERIODO)
      .mockResolvedValueOnce(SIN_DISPONIBILIDAD)
      .mockResolvedValueOnce([[
        // queda dentro del nuevo intervalo: no se informa
        { Citacion_Id: 1, Citacion_Fecha: martes, Citacion_Tramo_Horario: '14:00 - 14:30', Citacion_Estado: 'Confirmada' },
        // queda fuera: se informa
        { Citacion_Id: 2, Citacion_Fecha: martes, Citacion_Tramo_Horario: '15:30 - 16:00', Citacion_Estado: 'Confirmada' },
        // otro día: no pertenece al bloque
        { Citacion_Id: 3, Citacion_Fecha: proximoDia(4), Citacion_Tramo_Horario: '15:30 - 16:00', Citacion_Estado: 'Confirmada' },
      ]]);

    await controller.actualizarBloqueAtencion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta.requiereConfirmacion).toBe(true);
    expect(respuesta.citaciones.map((c) => c.Citacion_Id)).toEqual([2]);
    expect(pool.query).toHaveBeenCalledTimes(6); // sin UPDATE
  });

  test('CU88: con confirmación se modifica el bloque aunque tenga citaciones a futuro', async () => {
    req.params.id = '1';
    req.body = { dia: 'Martes', horaInicio: '14:00', horaFin: '15:00', confirmar: true };
    pool.query
      .mockResolvedValueOnce([[bloqueBD()]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[bloqueBD()]])
      .mockResolvedValueOnce(PERIODO)
      .mockResolvedValueOnce(SIN_DISPONIBILIDAD)
      .mockResolvedValueOnce([[
        { Citacion_Id: 2, Citacion_Fecha: proximoDia(2), Citacion_Tramo_Horario: '15:30 - 16:00', Citacion_Estado: 'Confirmada' },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await controller.actualizarBloqueAtencion(req, res);

    expect(pool.query.mock.calls[6][0]).toContain('UPDATE horario_atencion');
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Bloque de atención actualizado' });
  });

  test('CU88: elimina un bloque sin citaciones a futuro', async () => {
    req.params.id = '1';
    pool.query
      .mockResolvedValueOnce([[bloqueBD()]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await controller.eliminarBloqueAtencion(req, res);

    expect(pool.query.mock.calls[2][0]).toContain('DELETE FROM horario_atencion');
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Bloque de atención eliminado' });
  });

  test('CU88 Excepción 1: eliminar un bloque con citaciones a futuro requiere ?confirmar=true', async () => {
    req.params.id = '1';
    const citacion = { Citacion_Id: 9, Citacion_Fecha: proximoDia(2), Citacion_Tramo_Horario: '14:30 - 15:00', Citacion_Estado: 'Pendiente de confirmación' };
    pool.query.mockResolvedValueOnce([[bloqueBD()]]).mockResolvedValueOnce([[citacion]]);

    await controller.eliminarBloqueAtencion(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].citaciones).toHaveLength(1);

    jest.clearAllMocks();
    req.query.confirmar = 'true';
    pool.query
      .mockResolvedValueOnce([[bloqueBD()]])
      .mockResolvedValueOnce([[citacion]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await controller.eliminarBloqueAtencion(req, res);
    expect(pool.query.mock.calls[2][0]).toContain('DELETE FROM horario_atencion');
  });

  test('CU107: un bloque de atención fuera de la disponibilidad laboral se rechaza', async () => {
    req.body = { dia: 'Lunes', horaInicio: '15:00', horaFin: '16:00' };
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce(PERIODO)
      .mockResolvedValueOnce([[{ dia: 'Lunes', hora_inicio: '08:00:00', hora_fin: '13:00:00' }]]);

    await controller.crearBloqueAtencion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].mensaje).toContain('queda fuera de tu disponibilidad laboral');
    expect(res.json.mock.calls[0][0].mensaje).toContain('08:00–13:00');
  });

  describe('Semana completa (PUT /api/horario-atencion/semana)', () => {
    const conn = () => {
      const c = {
        query: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn(),
      };
      pool.getConnection = jest.fn().mockResolvedValue(c);
      return c;
    };

    test('rechaza tramos superpuestos o sin espacio para una citación', async () => {
      req.body = { tramos: [
        { dia: 'Lunes', hora_inicio: '14:00', hora_fin: '16:00' },
        { dia: 'Lunes', hora_inicio: '15:00', hora_fin: '17:00' },
      ] };
      await controller.guardarSemanaAtencion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toContain('se superponen');

      res.status.mockClear(); res.json.mockClear();
      req.body = { tramos: [{ dia: 'Lunes', hora_inicio: '10:10', hora_fin: '10:55' }] };
      await controller.guardarSemanaAtencion(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].mensaje).toContain('ninguna citación de 30 minutos');
    });

    test('CU87 Excepción 2: informa todos los tramos que chocan con clases y no guarda', async () => {
      const c = conn();
      req.body = { tramos: [{ dia: 'Lunes', hora_inicio: '09:00', hora_fin: '10:30' }] };
      c.query
        .mockResolvedValueOnce([[{ curso: '1ero Básico A', asignatura: 'Matemática', horaInicio: '09:15:00', horaFin: '10:00:00' }]])
        .mockResolvedValueOnce(PERIODO)
        .mockResolvedValueOnce(SIN_DISPONIBILIDAD);
      await controller.guardarSemanaAtencion(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].conflictos[0]).toContain('1ero Básico A — Matemática (09:15–10:00)');
      expect(c.rollback).toHaveBeenCalled();
      expect(c.query.mock.calls.some(([sql]) => /DELETE FROM horario_atencion/.test(sql))).toBe(false);
    });

    test('CU88 Excepción 1: pide confirmación si una citación futura queda fuera y luego reemplaza la semana', async () => {
      const martes = proximoDia(2);
      const citacion = { Citacion_Id: 5, Citacion_Fecha: martes, Citacion_Tramo_Horario: '15:30 - 16:00', Citacion_Estado: 'Confirmada' };
      const preparar = () => {
        const c = conn();
        c.query
          .mockResolvedValueOnce([[]])               // clases del tramo nuevo
          .mockResolvedValueOnce(PERIODO)
          .mockResolvedValueOnce(SIN_DISPONIBILIDAD)
          .mockResolvedValueOnce([[bloqueBD()]])     // bloques actuales (martes 14:00–16:00)
          .mockResolvedValueOnce([[citacion]])       // citaciones futuras
          .mockResolvedValue([{ affectedRows: 1 }]);
        pool.query = jest.fn().mockResolvedValue([[bloqueBD({ Horario_Atencion_Hora_Fin: '15:00:00' })]]);
        return c;
      };
      req.body = { tramos: [{ dia: 'Martes', hora_inicio: '14:00', hora_fin: '15:00' }] };

      const c1 = preparar();
      await controller.guardarSemanaAtencion(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].citaciones.map((x) => x.Citacion_Id)).toEqual([5]);
      expect(c1.commit).not.toHaveBeenCalled();

      res.status.mockClear(); res.json.mockClear();
      req.body.confirmar = true;
      const c2 = preparar();
      await controller.guardarSemanaAtencion(req, res);
      const sqls = c2.query.mock.calls.map(([sql]) => sql);
      expect(sqls.some((q) => /DELETE FROM horario_atencion WHERE Docente_Usuario_Id/.test(q))).toBe(true);
      const insert = c2.query.mock.calls.find(([sql]) => /INSERT INTO horario_atencion/.test(sql));
      expect(insert[1]).toEqual([[['Martes', '14:00', '15:00', 3]]]);
      expect(c2.commit).toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].mensaje).toContain('Horario de atención guardado');
    });
  });
});
