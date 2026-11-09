const horarioController = require('../controllers/horarioController');
const pool = require('../config/db');

jest.mock('../config/db');

describe('Pruebas Unitarias - CU67, CU68, CU69: Consultas y filtros de horario', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: { id: 1, roles: ['Administrador'] } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    pool.execute = jest.fn();
  });

  // ── CU68 ──
  test('CU68: aplica los filtros recibidos como parámetros de la consulta', async () => {
    req.query = { docente_id: '3', dia_semana: 'Lunes', jornada: 'Mañana' };
    pool.execute.mockResolvedValueOnce([[{ Horario_Asignatura_Id: 222222 }]]);

    await horarioController.filtrarHorarios(req, res);

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain('ha.Usuario_Id = ?');
    expect(sql).toContain('bh.Bloque_Horario_Jornada = ?');
    expect(sql).toContain('ha.Horario_Asignatura_Dia_Semana = ?');
    // Clases regulares y, con los mismos filtros, los electivos de 3° y 4° medio (CU106)
    expect(sql).toContain('FROM clase_electivo ce');
    expect(params).toEqual(['Activo', '3', 'Mañana', 'Lunes', '3', 'Mañana', 'Lunes']);
    expect(res.json).toHaveBeenCalledWith([{ Horario_Asignatura_Id: 222222 }]);
  });

  test('CU68 Excepción 2: sin resultados responde 200 con mensaje informativo', async () => {
    pool.execute.mockResolvedValueOnce([[]]);

    await horarioController.filtrarHorarios(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ horarios: [] }));
  });

  // ── CU67 ──
  // 2026-10-05 es lunes
  test('CU67: sin curso ni docente considera las asignaciones de toda la institución', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ bloqueId: 1, tipo: 'Clase' }, { bloqueId: 2, tipo: 'Clase' }]])
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 1, Horario_Asignatura_Dia_Semana: 'Lunes' }]])
      .mockResolvedValueOnce([[]]);
    req.query = { fecha: '2026-10-05' };

    await horarioController.getBloquesLibres(req, res);

    expect(pool.execute.mock.calls[1][0]).not.toContain('Curso_Id = ?');
    expect(res.json).toHaveBeenCalledWith([{ dia: 'Lunes', fecha: '2026-10-05', bloqueId: 2, tipo: 'Clase' }]);
  });

  test('CU67: un bloque con una actividad institucional en la fecha evaluada no está libre', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ bloqueId: 1, tipo: 'Clase' }, { bloqueId: 2, tipo: 'Clase' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 1, fecha: '2026-10-05', evento: 'Acto' }]]);
    req.query = { fecha: '2026-10-05' };

    await horarioController.getBloquesLibres(req, res);

    const [sql, params] = pool.execute.mock.calls[2];
    expect(sql).toContain('FROM afecta af');
    expect(params).toEqual(['2026-10-05']);
    expect(res.json).toHaveBeenCalledWith([{ dia: 'Lunes', fecha: '2026-10-05', bloqueId: 2, tipo: 'Clase' }]);
  });

  test('CU67: sin fecha evalúa la próxima ocurrencia de cada día hábil', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ bloqueId: 1, tipo: 'Clase' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await horarioController.getBloquesLibres(req, res);

    const fechas = pool.execute.mock.calls[2][1];
    expect(fechas).toHaveLength(5);
    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta.map((b) => b.dia)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']);
    respuesta.forEach((b) => expect(fechas).toContain(b.fecha));
  });

  test('CU67: una fecha de fin de semana o con formato inválido responde 400', async () => {
    req.query = { fecha: '2026-10-04' }; // domingo
    await horarioController.getBloquesLibres(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    req.query = { fecha: '2026-02-30' };
    await horarioController.getBloquesLibres(req, res);
    expect(res.status).toHaveBeenCalledTimes(2);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('CU67: con curso y docente, un bloque usado por cualquiera de los dos queda ocupado', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ bloqueId: 1, tipo: 'Clase' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    req.query = { curso_id: '222', docente_id: '3' };

    await horarioController.getBloquesLibres(req, res);

    const [sql, params] = pool.execute.mock.calls[1];
    // El docente ocupa el bloque solo con clases del mismo período que el curso consultado
    expect(sql).toContain('(Curso_Id = ? OR (Usuario_Id = ? AND');
    expect(sql).toContain('Curso_Periodo_Lectivo');
    expect(params).toEqual(['222', '3', '222']);
  });

  test('CU67 Excepción 1: sin bloques libres responde con mensaje informativo', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ bloqueId: 1, tipo: 'Clase' }]])
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 1, Horario_Asignatura_Dia_Semana: 'Lunes' }]])
      .mockResolvedValueOnce([[]]);
    req.query = { curso_id: '222', dia_semana: 'Lunes' };

    await horarioController.getBloquesLibres(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ bloquesLibres: [] }));
  });

  // ── CU69 ──
  test('CU69 Excepción 1: bloque inexistente responde 404', async () => {
    req.params.id = '999';
    pool.execute.mockResolvedValueOnce([[]]);

    await horarioController.getDetalleBloqueHorario(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('CU69 Excepción 1: identificador inválido responde 404 sin consultar la BD', async () => {
    req.params.id = 'abc';

    await horarioController.getDetalleBloqueHorario(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('CU69: el detalle incluye eventos institucionales y observaciones', async () => {
    req.params.id = '222227';
    pool.execute
      .mockResolvedValueOnce([[{
        horarioId: 222227, dia: 'Lunes', estado: 'Suspendido', bloqueId: 11111112, docenteId: 10,
      }]])
      .mockResolvedValueOnce([[{
        eventoId: 7, nombre: 'Acto', fecha: '2026-12-14', impacto: 'Suspensión total', estadoBloque: 'Suspendido',
      }]]);

    await horarioController.getDetalleBloqueHorario(req, res);

    expect(pool.execute.mock.calls[1][1]).toEqual([11111112, 'Lunes']);
    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta.eventos).toHaveLength(1);
    expect(respuesta.observaciones).toEqual([
      'El bloque se encuentra suspendido en el horario semanal del curso.',
      'Suspendido el 2026-12-14 por el evento institucional "Acto" (Suspensión total).',
    ]);
  });

  test('CU69 Excepción 2: error de base de datos responde 500', async () => {
    req.params.id = '222227';
    pool.execute.mockRejectedValueOnce(new Error('Fallo de conexión'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await horarioController.getDetalleBloqueHorario(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
  // ── Control de acceso a las consultas de horario ──
  test('CU69: un docente puede ver el detalle de su propia clase', async () => {
    req.user = { id: 10, roles: ['Docente'] };
    req.params.id = '222227';
    pool.execute
      .mockResolvedValueOnce([[{ horarioId: 222227, dia: 'Lunes', estado: 'Activo', bloqueId: 11111112, docenteId: 10 }]])
      .mockResolvedValueOnce([[]]);

    await horarioController.getDetalleBloqueHorario(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ horarioId: 222227 }));
  });

  test('CU69: un docente no puede ver el detalle de la clase de otro docente', async () => {
    req.user = { id: 3, roles: ['Docente'] };
    req.params.id = '222227';
    pool.execute.mockResolvedValueOnce([[{ horarioId: 222227, dia: 'Lunes', bloqueId: 11111112, docenteId: 10 }]]);

    await horarioController.getDetalleBloqueHorario(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  test('CU69: un apoderado no puede consultar el detalle de bloques', async () => {
    req.user = { id: 4, roles: ['Apoderado'] };
    req.params.id = '222227';

    await horarioController.getDetalleBloqueHorario(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});
