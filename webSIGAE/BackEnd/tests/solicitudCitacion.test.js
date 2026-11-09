const controller = require('../controllers/solicitudCitacionController');
const pool = require('../config/db');

jest.mock('../config/db');

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Fecha futura (YYYY-MM-DD) que cae en el día de la semana indicado (1 = lunes … 5 = viernes)
function proximoDia(diaSemana) {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() !== diaSemana) d.setDate(d.getDate() + 1);
  return iso(d);
}

const MARTES = proximoDia(2);
const ESTUDIANTE = { Estudiante_Id: 222222222, Estudiante_Nombre_Completo: 'Diego Perez', Curso_Id: 222, Curso_Nombre: '1ero Básico A', Rol_Apoderado: 'Titular' };
const BLOQUE = { Horario_Atencion_Id: 1, Horario_Atencion_Dia_Semana: 'Martes', Horario_Atencion_Hora_Inicio: '14:00:00', Horario_Atencion_Hora_Fin: '15:30:00', Docente_Usuario_Id: 3 };

const bodyValido = (extra = {}) => ({
  Estudiante_Id: 222222222,
  Docente_Usuario_Id: 3,
  Citacion_Fecha: MARTES,
  Citacion_Tramo_Horario: '14:30 - 15:00',
  Citacion_Motivo: 'Consultar por rendimiento',
  Citacion_Modalidad: 'Presencial',
  ...extra,
});

describe('Pruebas Unitarias - CU89: Solicitud de citación por el apoderado (RF56)', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: { id: 8, roles: ['Apoderado'] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    pool.query = jest.fn();
  });

  test('tramosDelBloque: solo tramos de 30 minutos completamente dentro del bloque', () => {
    expect(controller.tramosDelBloque(BLOQUE)).toEqual(['14:00 - 14:30', '14:30 - 15:00', '15:00 - 15:30']);
  });

  test('solo un apoderado puede solicitar citaciones', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    await controller.solicitarCitacion(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('los estudiantes incluyen aquellos donde el apoderado es suplente', async () => {
    pool.query.mockResolvedValueOnce([[ESTUDIANTE, { ...ESTUDIANTE, Estudiante_Id: 1, Rol_Apoderado: 'Suplente' }]]);

    await controller.getEstudiantesSolicitud(req, res);

    expect(pool.query.mock.calls[0][0]).toContain('apoderado_suplente');
    expect(pool.query.mock.calls[0][1]).toEqual([8, 8, 8]);
    expect(res.json.mock.calls[0][0]).toHaveLength(2);
  });

  test('CU89 paso 2: docentes del estudiante con indicador de horario de atención', async () => {
    req.params.estudianteId = '222222222';
    pool.query
      .mockResolvedValueOnce([[ESTUDIANTE]])
      .mockResolvedValueOnce([[{ Usuario_Id: 3, Usuario_Nombre_Completo: 'María Morales', Asignaturas: 'Matemática', Tiene_Horario_Atencion: 1 }]]);

    await controller.getDocentesSolicitud(req, res);

    // El propio apoderado (si también es docente del curso) no aparece: [curso, apoderado]
    expect(pool.query.mock.calls[1][1]).toEqual([222, 8]);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ Usuario_Id: 3, Tiene_Horario_Atencion: true })]);
  });

  test('un estudiante no asociado al apoderado retorna 404', async () => {
    req.params.estudianteId = '222222223';
    pool.query.mockResolvedValueOnce([[]]);

    await controller.getDocentesSolicitud(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('CU89 Excepción 1: el docente no tiene horario de atención', async () => {
    req.query = { estudianteId: '222222222', docenteId: '3' };
    pool.query
      .mockResolvedValueOnce([[ESTUDIANTE]])
      .mockResolvedValueOnce([[{ 1: 1 }]]) // imparte en el curso
      .mockResolvedValueOnce([[]]);        // sin bloques

    await controller.getDisponibilidadSolicitud(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({
      mensaje: 'El docente aún no registra horario de atención de apoderados',
      sinHorarioAtencion: true,
      dias: [],
    }));
  });

  test('el docente debe impartir clases al estudiante', async () => {
    req.query = { estudianteId: '222222222', docenteId: '99' };
    pool.query.mockResolvedValueOnce([[ESTUDIANTE]]).mockResolvedValueOnce([[]]);

    await controller.getDisponibilidadSolicitud(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'El docente seleccionado no imparte clases al estudiante' });
  });

  describe('calcularDisponibilidad', () => {
    // Desde un lunes a medianoche, para que todos los tramos de la ventana sean futuros
    const lunes = (() => {
      const [y, m, d] = MARTES.split('-').map(Number);
      return iso(new Date(y, m - 1, d - 1));
    })();

    test('descarta tramos que chocan con clases y los ya ocupados por citaciones', async () => {
      pool.query
        .mockResolvedValueOnce([[{ dia: 'Martes', horaInicio: '15:00:00', horaFin: '15:45:00' }]])
        .mockResolvedValueOnce([[{ fecha: MARTES, tramo: '14:00 - 14:30' }]]);

      const dias = await controller.calcularDisponibilidad(pool, {
        docenteId: 3, apoderadoId: 8, bloques: [BLOQUE], desde: { fecha: lunes, minuto: 0 },
      });

      // 4 semanas desde un lunes = 4 martes; el primero pierde 14:00 (ocupado) y 15:00 (clase)
      expect(dias).toHaveLength(controller.SEMANAS_DISPONIBILIDAD);
      expect(dias[0]).toEqual({ fecha: MARTES, dia: 'Martes', tramos: ['14:30 - 15:00'] });
      expect(dias[1].tramos).toEqual(['14:00 - 14:30', '14:30 - 15:00']);
      // Ocupación consultada para el docente y el apoderado dentro de la ventana
      expect(pool.query.mock.calls[1][1].slice(2)).toEqual(['Cancelada', 3, 8]);
    });

    test('hoy solo se ofrecen tramos que aún no comienzan', async () => {
      pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

      const dias = await controller.calcularDisponibilidad(pool, {
        docenteId: 3, apoderadoId: 8, bloques: [BLOQUE], desde: { fecha: MARTES, minuto: 14 * 60 + 10 },
      });

      expect(dias[0]).toEqual({ fecha: MARTES, dia: 'Martes', tramos: ['14:30 - 15:00', '15:00 - 15:30'] });
    });
  });

  test('CU89 Excepción 3: datos incompletos retornan 400 con errores por campo', async () => {
    req.body = {};

    await controller.solicitarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Object.keys(res.json.mock.calls[0][0].errores)).toEqual(
      expect.arrayContaining(['fecha', 'tramo', 'estudianteId', 'docenteId', 'motivo', 'modalidad'])
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('no se puede solicitar un tramo fuera del horario de atención del docente', async () => {
    req.body = bodyValido({ Citacion_Tramo_Horario: '16:00 - 16:30' });
    pool.query
      .mockResolvedValueOnce([[ESTUDIANTE]])
      .mockResolvedValueOnce([[{ 1: 1 }]])
      .mockResolvedValueOnce([[BLOQUE]]);

    await controller.solicitarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'El tramo seleccionado no está dentro del horario de atención del docente' });
  });

  test('C-11: no se puede solicitar un tramo que coincide con una clase del docente', async () => {
    req.body = bodyValido();
    pool.query
      .mockResolvedValueOnce([[ESTUDIANTE]])
      .mockResolvedValueOnce([[{ 1: 1 }]])
      .mockResolvedValueOnce([[BLOQUE]])
      .mockResolvedValueOnce([[{ id: 1, curso: '2do Medio A', asignatura: 'Física', horaInicio: '14:30:00', horaFin: '15:15:00' }]]);

    await controller.solicitarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].mensaje).toContain('coincide con una clase del docente');
  });

  test('un tramo tomado por otra citación ya no está disponible', async () => {
    req.body = bodyValido();
    pool.query
      .mockResolvedValueOnce([[ESTUDIANTE]])
      .mockResolvedValueOnce([[{ 1: 1 }]])
      .mockResolvedValueOnce([[BLOQUE]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Citacion_Id: 40 }]]);

    await controller.solicitarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'El tramo seleccionado ya no está disponible. Elige otro.' });
  });

  test('Un apoderado que también es docente del estudiante no puede citarse a sí mismo', async () => {
    req.user = { id: 3, roles: ['Docente', 'Apoderado'] };
    req.body = bodyValido({ Docente_Usuario_Id: 3 });

    await controller.solicitarCitacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No puedes solicitarte una citación a ti mismo' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('CU89 Flujo correcto: registra la solicitud pendiente a nombre del apoderado (también suplente)', async () => {
    req.body = bodyValido({ Citacion_Motivo: '  Consultar por rendimiento  ' });
    pool.query
      .mockResolvedValueOnce([[{ ...ESTUDIANTE, Rol_Apoderado: 'Suplente' }]])
      .mockResolvedValueOnce([[{ 1: 1 }]])
      .mockResolvedValueOnce([[BLOQUE]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 70 }])
      .mockResolvedValueOnce([[{
        Citacion_Id: 70, Citacion_Fecha: MARTES, Citacion_Tramo_Horario: '14:30 - 15:00', Citacion_Estado: 'Pendiente de confirmación',
        Apoderado_Usuario_Id: 8, Docente_Usuario_Id: 3, Citacion_Solicitante_Rol: 'Apoderado', Ultimo_Reprogramador_Id: null,
      }]]);

    await controller.solicitarCitacion(req, res);

    const [sql, params] = pool.query.mock.calls[5];
    expect(sql).toContain("Citacion_Solicitante_Rol");
    expect(sql).toContain("'Apoderado'");
    expect(params).toEqual([
      '14:30 - 15:00', MARTES, 'Consultar por rendimiento', 'Pendiente de confirmación', 'Presencial', 222222222, 8, 3,
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
    // La confirmación le corresponde al docente, no al apoderado que la solicitó
    expect(res.json.mock.calls[0][0].citacion).toEqual(expect.objectContaining({
      Requiere_Confirmacion_De: 'Docente',
      Puede_Confirmar: false,
    }));
  });
});
