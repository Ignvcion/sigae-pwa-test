const citacionController = require('../controllers/citacionController');
const pool = require('../config/db');

jest.mock('../config/db');

// Fecha hábil futura (YYYY-MM-DD) para no depender del día en que se ejecutan las pruebas
function fechaHabil(dias = 7) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const FECHA = fechaHabil();

const filaCitacion = (extra = {}) => ({
  Citacion_Id: 50,
  Citacion_Fecha: FECHA,
  Citacion_Tramo_Horario: '10:00 - 10:30',
  Citacion_Motivo: 'Rendimiento académico',
  Citacion_Modalidad: 'Presencial',
  Citacion_Estado: 'Pendiente de confirmación',
  Citacion_Fecha_Confirmacion: null,
  Citacion_Motivo_Cancelacion: null,
  Citacion_Observaciones_Posteriores: null,
  Estudiante_Id: 222222222,
  Estudiante_Nombre_Completo: 'Diego Martin Perez Castro',
  Curso_Nombre: '1ero Básico A',
  Apoderado_Usuario_Id: 4,
  Apoderado_Nombre: 'Pedro Fernandez',
  Docente_Usuario_Id: 3,
  Docente_Nombre: 'María Morales',
  Ultimo_Reprogramador_Id: null,
  ...extra,
});

describe('Pruebas Unitarias - CU74–CU79: Módulo de Citaciones', () => {
  let req;
  let res;
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    conn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
    };
    pool.getConnection = jest.fn().mockResolvedValue(conn);
    pool.query = jest.fn();
  });

  // ── CU78 ──
  test('CU78 Excepción 1: sin citaciones asociadas retorna 200 con mensaje informativo', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    pool.query.mockResolvedValueOnce([[]]);

    await citacionController.getCitaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No existen citaciones asociadas al usuario', citaciones: [] });
  });

  test('CU78: un usuario sin rol Docente, Apoderado ni Administrador recibe 403', async () => {
    req.user = { id: 99, roles: [] };

    await citacionController.getCitaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('CU78: el Administrador ve las citaciones de toda la institución', async () => {
    req.user = { id: 2, roles: ['Administrador'] };
    req.query.rol = 'Administrador';
    pool.query.mockResolvedValueOnce([[filaCitacion(), filaCitacion({ Citacion_Id: 51, Docente_Usuario_Id: 5 })]]);

    await citacionController.getCitaciones(req, res);

    expect(pool.query.mock.calls[0][0]).not.toMatch(/(Docente|Apoderado)_Usuario_Id = \?/);
    expect(pool.query.mock.calls[0][1]).toBeUndefined();
    const lista = res.json.mock.calls[0][0];
    expect(lista).toHaveLength(2);
    // No le corresponde confirmar citaciones ajenas
    expect(lista.every((c) => c.Puede_Confirmar === false)).toBe(true);
  });

  test('CU78: usa el rol activo enviado por el frontend para filtrar la agenda', async () => {
    req.user = { id: 10, roles: ['Docente', 'Apoderado'] };
    req.query.rol = 'Apoderado';
    pool.query.mockResolvedValueOnce([[filaCitacion()]]);

    await citacionController.getCitaciones(req, res);

    expect(pool.query.mock.calls[0][0]).toContain('c.Apoderado_Usuario_Id = ?');
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ Citacion_Id: 50, Requiere_Confirmacion_De: 'Apoderado' }),
    ]);
  });

  // ── CU74 ──
  test('CU74 Excepción 1: datos incompletos retornan 400 con errores por campo', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.body = { Citacion_Motivo: '' };

    await citacionController.crearCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta.mensaje).toBe('Datos incompletos o inválidos en el formulario');
    expect(Object.keys(respuesta.errores)).toEqual(
      expect.arrayContaining(['fecha', 'tramo', 'estudianteId', 'motivo', 'modalidad'])
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('CU74 Excepción 2: sin disponibilidad horaria retorna 409', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.body = {
      Estudiante_Id: 222222222,
      Citacion_Fecha: FECHA,
      Citacion_Tramo_Horario: '10:00 - 10:30',
      Citacion_Motivo: 'Rendimiento académico',
      Citacion_Modalidad: 'Presencial',
    };
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[{ Citacion_Id: 33 }]]);

    await citacionController.crearCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No existe disponibilidad para la fecha y tramo seleccionado' });
  });

  test('CU74 Flujo correcto: registra la citación en estado "Pendiente de confirmación"', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.body = {
      Estudiante_Id: 222222222,
      Citacion_Fecha: FECHA,
      Citacion_Tramo_Horario: '10:00 - 10:30',
      Citacion_Motivo: '  Rendimiento académico  ',
      Citacion_Modalidad: 'Online',
    };
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[]]) // sin otra citación en el tramo
      .mockResolvedValueOnce([[]]) // C-11: sin clases del docente en el tramo
      .mockResolvedValueOnce([{ insertId: 50 }])
      .mockResolvedValueOnce([[filaCitacion({ Citacion_Modalidad: 'Online' })]]);

    await citacionController.crearCitacion(req, res);

    const insert = pool.query.mock.calls[3];
    expect(insert[0]).toContain('INSERT INTO citacion');
    expect(insert[1]).toEqual([
      '10:00 - 10:30', FECHA, 'Rendimiento académico', 'Pendiente de confirmación', 'Online', 222222222, 4, 3,
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      mensaje: 'Citación creada, pendiente de confirmación',
    }));
  });

  test('CU74: un Administrador puede citar a cualquier estudiante y queda como citador', async () => {
    req.user = { id: 2, roles: ['Administrador'] };
    req.body = {
      Estudiante_Id: 222222226,
      Citacion_Fecha: FECHA,
      Citacion_Tramo_Horario: '09:00 - 09:30',
      Citacion_Motivo: 'Reunión con dirección',
      Citacion_Modalidad: 'Presencial',
    };
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222226, Apoderado_Usuario_Id: 8 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 60 }])
      .mockResolvedValueOnce([[filaCitacion({ Citacion_Id: 60, Docente_Usuario_Id: 2 })]]);

    await citacionController.crearCitacion(req, res);

    // Sin restricción por cursos para el administrador
    expect(pool.query.mock.calls[0][0]).not.toContain('horario_asignatura');
    // Docente_Usuario_Id (último valor del INSERT) = el administrador
    expect(pool.query.mock.calls[3][1].at(-1)).toBe(2);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('C-11: no se crea una citación que coincide con una clase del docente', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.body = {
      Estudiante_Id: 222222222,
      Citacion_Fecha: FECHA,
      Citacion_Tramo_Horario: '09:30 - 10:00',
      Citacion_Motivo: 'Rendimiento académico',
      Citacion_Modalidad: 'Presencial',
    };
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{
        id: 222222, curso: '1ero Básico A', asignatura: 'Matemática', horaInicio: '09:15:00', horaFin: '10:00:00',
      }]]);

    await citacionController.crearCitacion(req, res);

    // La consulta de clases filtra por docente, día de la fecha y superposición con el tramo
    const [sql, params] = pool.query.mock.calls[2];
    expect(sql).toContain('FROM horario_asignatura');
    expect(params[0]).toBe(3);
    expect(params.slice(2, 4)).toEqual(['10:00', '09:30']);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].mensaje).toBe(
      'El tramo seleccionado coincide con una clase del docente: 1ero Básico A — Matemática (09:15–10:00)'
    );
    expect(pool.query).toHaveBeenCalledTimes(3); // no hubo INSERT
  });

  test('CU74: un Apoderado no puede crear citaciones', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };

    await citacionController.crearCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ── CU75 ──
  test('CU75 Flujo correcto: confirma, registra la fecha y el historial en una transacción', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '50';
    pool.query.mockResolvedValueOnce([[filaCitacion()]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{}]);

    await citacionController.confirmarCitacion(req, res);

    expect(conn.query.mock.calls[0][0]).toContain('Citacion_Fecha_Confirmacion = CURDATE()');
    expect(conn.query.mock.calls[1][0]).toContain('INSERT INTO historial');
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      mensaje: 'Citación confirmada correctamente. Se notificó el cambio de estado a la contraparte.',
    });
  });

  test('CU75 Excepción 2: error al registrar la confirmación hace rollback y retorna 500', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '50';
    pool.query.mockResolvedValueOnce([[filaCitacion()]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockRejectedValueOnce(new Error('fallo BD'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await citacionController.confirmarCitacion(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    console.error.mockRestore();
  });

  test('CU75/CU77: si el apoderado reprogramó, la confirmación le corresponde al docente', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '50';
    pool.query.mockResolvedValueOnce([[filaCitacion({ Ultimo_Reprogramador_Id: 4 })]]);

    await citacionController.confirmarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('CU89/CU75: una solicitud del apoderado la confirma el docente', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.query.rol = 'Docente';
    pool.query.mockResolvedValueOnce([[filaCitacion({ Citacion_Solicitante_Rol: 'Apoderado' })]]);

    await citacionController.getCitacionesPendientes(req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ Citacion_Id: 50, Requiere_Confirmacion_De: 'Docente', Puede_Confirmar: true }),
    ]);
  });

  test('CU89/CU77: si el docente reprograma una solicitud del apoderado, confirma el apoderado', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.query.rol = 'Apoderado';
    pool.query.mockResolvedValueOnce([[filaCitacion({ Citacion_Solicitante_Rol: 'Apoderado', Ultimo_Reprogramador_Id: 3 })]]);

    await citacionController.getCitacionesPendientes(req, res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ Requiere_Confirmacion_De: 'Apoderado', Puede_Confirmar: true }),
    ]);
  });

  test('CU89/CU75: el apoderado que solicitó la citación no puede confirmarla él mismo', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '50';
    pool.query.mockResolvedValueOnce([[filaCitacion({ Citacion_Solicitante_Rol: 'Apoderado' })]]);

    await citacionController.confirmarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'La confirmación de esta citación le corresponde a la contraparte' });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('CU75: el Administrador no puede confirmar en nombre del apoderado', async () => {
    req.user = { id: 2, roles: ['Administrador'] };
    req.params.id = '50';
    pool.query.mockResolvedValueOnce([[filaCitacion()]]);

    await citacionController.confirmarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  // ── CU76 ──
  test('CU76 Excepción 2: motivo de cancelación vacío retorna 400', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.params.id = '50';
    req.body = { Citacion_Motivo_Cancelacion: '   ' };

    await citacionController.cancelarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Debe ingresar un motivo de cancelación válido' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('CU76: el Administrador puede cancelar cualquier citación de la institución', async () => {
    req.user = { id: 2, roles: ['Administrador'] };
    req.params.id = '50';
    req.body = { Citacion_Motivo_Cancelacion: 'Suspensión de actividades' };
    pool.query.mockResolvedValueOnce([[filaCitacion()]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{}]);

    await citacionController.cancelarCitacion(req, res);

    // Busca la citación sin restringir por participante
    expect(pool.query.mock.calls[0][0]).not.toContain('Apoderado_Usuario_Id = ?');
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Citación cancelada correctamente' });
  });

  test('CU76 Excepción 1: citación inexistente o ajena retorna 404', async () => {
    req.user = { id: 8, roles: ['Apoderado'] };
    req.params.id = '50';
    req.body = { Citacion_Motivo_Cancelacion: 'No puedo asistir' };
    pool.query.mockResolvedValueOnce([[]]);

    await citacionController.cancelarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  // ── CU77 ──
  test('CU77 Excepción 2: conflicto de disponibilidad retorna 409', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '50';
    req.body = { Citacion_Fecha: FECHA, Citacion_Tramo_Horario: '11:00 - 11:30' };
    pool.query
      .mockResolvedValueOnce([[filaCitacion()]])
      .mockResolvedValueOnce([[{ Citacion_Id: 51 }]]);

    await citacionController.reprogramarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Los nuevos datos generan conflicto de disponibilidad horaria' });
  });

  test('C-11: no se reprograma a un tramo que coincide con una clase del docente', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '50';
    req.body = { Citacion_Fecha: FECHA, Citacion_Tramo_Horario: '11:00 - 11:30' };
    pool.query
      .mockResolvedValueOnce([[filaCitacion()]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 1, curso: '1ero Básico B', asignatura: 'Lenguaje', horaInicio: '11:00:00', horaFin: '11:45:00' }]]);

    await citacionController.reprogramarCitacion(req, res);

    // Se valida contra el horario del docente citado, no contra quien reprograma
    expect(pool.query.mock.calls[2][1][0]).toBe(3);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('CU77 Excepción 1: una citación cancelada no está disponible para edición', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '50';
    req.body = { Citacion_Fecha: FECHA, Citacion_Tramo_Horario: '11:00 - 11:30' };
    pool.query.mockResolvedValueOnce([[filaCitacion({ Citacion_Estado: 'Cancelada' })]]);

    await citacionController.reprogramarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  // ── CU79 ──
  test('CU79: un apoderado no puede consultar el historial de un estudiante ajeno', async () => {
    req.user = { id: 8, roles: ['Apoderado'] };
    req.params.estudianteId = '222222222';
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Curso_Id: 222, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[]]); // tampoco es suplente

    await citacionController.getHistorialCitaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('RF57/CU79: un apoderado suplente puede consultar el historial del estudiante', async () => {
    req.user = { id: 8, roles: ['Apoderado'] };
    req.params.estudianteId = '222222222';
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Curso_Id: 222, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[{ 1: 1 }]]) // es suplente
      .mockResolvedValueOnce([[]]);        // sin citaciones

    await citacionController.getHistorialCitaciones(req, res);

    expect(pool.query.mock.calls[1][1]).toEqual([222222222, 8, 8]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('CU79 Flujo correcto: devuelve las citaciones con sus registros de historial', async () => {
    req.user = { id: 1, roles: ['Administrador'] };
    req.params.estudianteId = '222222222';
    const historial = [{ Historial_Id: 1, Citacion_Id: 50, Historial_Descripcion_Cambio: 'Confirmación de citación' }];
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222222, Curso_Id: 222, Apoderado_Usuario_Id: 4 }]])
      .mockResolvedValueOnce([[filaCitacion(), filaCitacion({ Citacion_Id: 51 })]])
      .mockResolvedValueOnce([historial]);

    await citacionController.getHistorialCitaciones(req, res);

    const { citaciones } = res.json.mock.calls[0][0];
    expect(citaciones).toHaveLength(2);
    expect(citaciones[0].historial).toEqual(historial);
    expect(citaciones[1].historial).toEqual([]);
  });

  test('CU79 Excepción 1: estudiante sin citaciones retorna mensaje informativo', async () => {
    req.user = { id: 1, roles: ['Administrador'] };
    req.params.estudianteId = '222222227';
    pool.query
      .mockResolvedValueOnce([[{ Estudiante_Id: 222222227, Curso_Id: 225, Apoderado_Usuario_Id: 10 }]])
      .mockResolvedValueOnce([[]]);

    await citacionController.getHistorialCitaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      mensaje: 'No existen citaciones registradas para el estudiante seleccionado',
      citaciones: [],
    }));
  });

  test('CU79 Excepción 2: error de base de datos retorna 500', async () => {
    req.user = { id: 1, roles: ['Administrador'] };
    req.params.estudianteId = '222222222';
    pool.query.mockRejectedValueOnce(new Error('fallo BD'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await citacionController.getHistorialCitaciones(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No fue posible recuperar el historial de citaciones' });
    console.error.mockRestore();
  });
});
