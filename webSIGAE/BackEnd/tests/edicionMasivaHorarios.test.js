const horarioController = require('../controllers/horarioController');
const pool = require('../config/db');

jest.mock('../config/db');

// Bloque programado seleccionado en la grilla (horario_asignatura)
const SELECCIONADO = {
  Horario_Asignatura_Id: 1,
  dia: 'Lunes',
  estado: 'Activo',
  Curso_Id: 10,
  curso: '1° Básico A',
  Bloque_Horario_Id: 5,
  hora_inicio: '09:00:00',
  hora_fin: '09:45:00',
  duracion: '0.75',
  Asignatura_Id: 3,
  asignatura: 'Matemáticas',
  Usuario_Id: 7,
  docente: 'Carlos Docente',
};

const SELECCIONADO_2 = {
  ...SELECCIONADO,
  Horario_Asignatura_Id: 2,
  dia: 'Martes',
};

const DOCENTE_NUEVO = { Usuario_Id: 8, Usuario_Nombre_Completo: 'Ana Docente' };

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function mockConn() {
  const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  pool.getConnection.mockResolvedValue(conn);
  return conn;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('Pruebas Unitarias - CU63: Reasignando docente en múltiples bloques', () => {
  test('Flujo correcto: valida sin conflictos y retorna el resumen de cambios', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO, SELECCIONADO_2]]) // bloques seleccionados
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])                // nuevo docente activo
      .mockResolvedValueOnce([[]])                              // resto de la programación
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: 30 }]]); // carga
    const req = { body: { horario_ids: [1, 2], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.mensaje).toBe('Sin conflictos');
    expect(body.resumen).toHaveLength(2);
    expect(body.resumen[0].antes.docente).toBe('Carlos Docente');
    expect(body.resumen[0].despues.docente).toBe('Ana Docente');
  });

  test('Excepción "Bloques o docente no seleccionados": sin bloques', async () => {
    const req = { body: { horario_ids: [], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Seleccione bloques y un docente válido' });
  });

  test('Excepción "Bloques o docente no seleccionados": sin docente', async () => {
    const req = { body: { horario_ids: [1, 2] } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Seleccione bloques y un docente válido' });
  });

  test('Excepción "Bloques o docente no seleccionados": el docente no existe o está inactivo', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[]]); // docente no encontrado
    const req = { body: { horario_ids: [1], Usuario_Id: 99 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Seleccione bloques y un docente válido' });
  });

  test('Excepción "Bloques o docente no seleccionados": un bloque seleccionado no existe', async () => {
    pool.query.mockResolvedValueOnce([[SELECCIONADO]]); // solo 1 de 2 existe
    const req = { body: { horario_ids: [1, 2], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Seleccione bloques y un docente válido' });
  });

  test('Excepción "Docente sin disponibilidad o con conflicto": ya tiene clase en el mismo día y bloque', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])
      .mockResolvedValueOnce([[{
        Horario_Asignatura_Id: 50, dia: 'Lunes', estado: 'Activo', Curso_Id: 11, curso: '2° Básico A',
        Bloque_Horario_Id: 5, Asignatura_Id: 4, Usuario_Id: 8, duracion: '0.75',
      }]])
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: null }]]);
    const req = { body: { horario_ids: [1], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('El docente presenta conflicto horario');
    expect(body.conflictos[0]).toContain('2° Básico A');
  });

  test('Excepción "Docente sin disponibilidad o con conflicto": dos bloques seleccionados simultáneos', async () => {
    const otroCursoMismoBloque = { ...SELECCIONADO, Horario_Asignatura_Id: 3, Curso_Id: 12, curso: '3° Básico A' };
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO, otroCursoMismoBloque]])
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: null }]]);
    const req = { body: { horario_ids: [1, 3], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].conflictos[0]).toContain('dos clases simultáneas');
  });

  test('Excepción "Docente sin disponibilidad o con conflicto": supera su máximo de clases (regla 65/35)', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO, SELECCIONADO_2]])
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])
      .mockResolvedValueOnce([[{
        Horario_Asignatura_Id: 60, dia: 'Viernes', estado: 'Activo', Curso_Id: 11, curso: '2° Básico A',
        Bloque_Horario_Id: 9, Asignatura_Id: 4, Usuario_Id: 8, duracion: '1.0',
      }]])
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: 2 }]]);
    const req = { body: { horario_ids: [1, 2], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    // Carga 2 h → máximo floor(65 % de 2) = 1 clase; ya tiene 1 y sumaría 2 más
    expect(res.json.mock.calls[0][0].conflictos[0]).toBe(
      'Ana Docente superaría su máximo semanal de 1 clase (65 % de 2 h; quedaría con 3)'
    );
  });

  test('CU56: la especialidad que no coincide es una sugerencia y no bloquea la validación', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: null, Docente_Especialidad: 'Historia, Geografía' }]]);
    const req = { body: { horario_ids: [1], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.validarReasignacion(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta.mensaje).toBe('Sin conflictos');
    expect(respuesta.sugerencias).toEqual([
      'Sugerencia: la especialidad de Ana Docente (Historia, Geografía) no coincide con Matemáticas. Se puede asignar igual.',
    ]);
  });

  test('Flujo correcto: confirma y actualiza los bloques con el nuevo docente', async () => {
    const conn = mockConn();
    conn.query
      .mockResolvedValueOnce([[SELECCIONADO, SELECCIONADO_2]])
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: null }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]); // UPDATE
    const req = { body: { horario_ids: [1, 2], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.reasignarDocente(req, res);

    const [sqlSel] = conn.query.mock.calls[0];
    expect(sqlSel).toContain('FOR UPDATE');
    const [sqlUpdate, params] = conn.query.mock.calls[4];
    expect(sqlUpdate).toContain('UPDATE horario_asignatura SET Usuario_Id = ?');
    expect(sqlUpdate).toContain('WHERE Horario_Asignatura_Id IN (?)');
    expect(params).toEqual([8, [1, 2]]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      mensaje: 'Docente reasignado en los bloques seleccionados',
      actualizados: 2,
    });
  });

  test('Conflicto detectado al confirmar: revierte y no actualiza', async () => {
    const conn = mockConn();
    conn.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])
      .mockResolvedValueOnce([[{
        Horario_Asignatura_Id: 50, dia: 'Lunes', estado: 'Activo', Curso_Id: 11, curso: '2° Básico A',
        Bloque_Horario_Id: 5, Asignatura_Id: 4, Usuario_Id: 8, duracion: '0.75',
      }]])
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: null }]]);
    const req = { body: { horario_ids: [1], Usuario_Id: 8 } };
    const res = mockRes();

    await horarioController.reasignarDocente(req, res);

    expect(conn.query).toHaveBeenCalledTimes(4);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('Pruebas Unitarias - CU64: Modificando múltiples bloques horarios', () => {
  test('Opciones de edición: retorna bloques, asignaturas y docentes activos', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 5 }]])
      .mockResolvedValueOnce([[{ Asignatura_Id: 3 }]])
      .mockResolvedValueOnce([[{ Usuario_Id: 8 }]]);
    const res = mockRes();

    await horarioController.getOpcionesEdicion({}, res);

    expect(res.json).toHaveBeenCalledWith({
      bloques: [{ Bloque_Horario_Id: 5 }],
      asignaturas: [{ Asignatura_Id: 3 }],
      docentes: [{ Usuario_Id: 8 }],
    });
  });

  test('Flujo correcto: valida el cambio de día sin conflictos', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])  // seleccionados
      .mockResolvedValueOnce([[]])               // resto de la programación
      .mockResolvedValueOnce([[{ Parametro_Institucional_Bloques_Maximos_Diarios: 8 }]]);
    const req = { body: { horario_ids: [1], cambios: { Horario_Asignatura_Dia_Semana: 'Jueves' } } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.resumen[0].antes.dia).toBe('Lunes');
    expect(body.resumen[0].despues.dia).toBe('Jueves');
  });

  test('Excepción "Bloques o campos no seleccionados": sin campos a modificar', async () => {
    const req = { body: { horario_ids: [1], cambios: {} } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Seleccione bloques y campos válidos a modificar' });
  });

  test('Excepción "Bloques o campos no seleccionados": día inválido', async () => {
    const req = { body: { horario_ids: [1], cambios: { Horario_Asignatura_Dia_Semana: 'Domingo' } } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Seleccione bloques y campos válidos a modificar' });
  });

  test('Excepción "Bloques o campos no seleccionados": el bloque horario nuevo no existe', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[]]); // bloque no encontrado
    const req = { body: { horario_ids: [1], cambios: { Bloque_Horario_Id: 999 } } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Excepción "Cambios generan conflicto de horario": el curso ya tiene clase en ese día y bloque', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[{
        Horario_Asignatura_Id: 70, dia: 'Jueves', estado: 'Activo', Curso_Id: 10, curso: '1° Básico A',
        Bloque_Horario_Id: 5, Asignatura_Id: 4, Usuario_Id: null, duracion: '0.75',
      }]])
      .mockResolvedValueOnce([[{ Parametro_Institucional_Bloques_Maximos_Diarios: 8 }]]);
    const req = { body: { horario_ids: [1], cambios: { Horario_Asignatura_Dia_Semana: 'Jueves' } } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Los cambios generan conflicto de horario');
    expect(body.conflictos[0]).toContain('ya tiene una clase programada');
  });

  test('Excepción "Cambios generan conflicto de horario": dos bloques del mismo curso quedan superpuestos', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO, SELECCIONADO_2]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ Parametro_Institucional_Bloques_Maximos_Diarios: 8 }]]);
    const req = { body: { horario_ids: [1, 2], cambios: { Horario_Asignatura_Dia_Semana: 'Jueves' } } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('Excepción "Cambios generan conflicto de horario": bloque de recreo', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[{
        Bloque_Horario_Id: 6, Bloque_Horario_Hora_Inicio: '10:00:00', Bloque_Horario_Hora_Fin: '10:15:00',
        Bloque_Horario_Tipo: 'Recreo', duracion: '0.25',
      }]])
      .mockResolvedValueOnce([[]]) // resto de la programación
      .mockResolvedValueOnce([[{ Horas_Semanales_Requeridas: 6 }]]) // plan
      .mockResolvedValueOnce([[{ Usuario_Id: 7, Usuario_Nombre_Completo: 'Carlos Docente', Docente_Carga_Horaria_Semanal: null }]]);
    const req = { body: { horario_ids: [1], cambios: { Bloque_Horario_Id: 6 } } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].conflictos).toContain('No se pueden programar clases en bloques de recreo');
  });

  test('Excepción "Cambios generan conflicto de horario": asignatura no asociada al curso', async () => {
    pool.query
      .mockResolvedValueOnce([[SELECCIONADO]])
      .mockResolvedValueOnce([[{ Asignatura_Id: 4, Asignatura_Nombre: 'Historia' }]])
      .mockResolvedValueOnce([[]]) // resto de la programación
      .mockResolvedValueOnce([[]]) // sin tieneasig/plan
      .mockResolvedValueOnce([[{ Usuario_Id: 7, Usuario_Nombre_Completo: 'Carlos Docente', Docente_Especialidad: 'Historia' }]]);
    const req = { body: { horario_ids: [1], cambios: { Asignatura_Id: 4 } } };
    const res = mockRes();

    await horarioController.validarCambiosMultiples(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].conflictos[0]).toContain('Historia no está asociada');
  });

  test('Flujo correcto: confirma y actualiza día y docente de los bloques seleccionados', async () => {
    const conn = mockConn();
    conn.query
      .mockResolvedValueOnce([[SELECCIONADO]])            // seleccionados
      .mockResolvedValueOnce([[DOCENTE_NUEVO]])            // docente nuevo
      .mockResolvedValueOnce([[]])                         // resto de la programación
      .mockResolvedValueOnce([[{ Parametro_Institucional_Bloques_Maximos_Diarios: 8 }]])
      .mockResolvedValueOnce([[{ ...DOCENTE_NUEVO, Docente_Carga_Horaria_Semanal: null }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);       // UPDATE
    const req = {
      body: { horario_ids: [1], cambios: { Horario_Asignatura_Dia_Semana: 'Jueves', Usuario_Id: 8 } },
    };
    const res = mockRes();

    await horarioController.modificarMultiplesBloques(req, res);

    const [sqlUpdate, params] = conn.query.mock.calls[5];
    expect(sqlUpdate).toContain('SET Horario_Asignatura_Dia_Semana = ?, Usuario_Id = ?');
    expect(params).toEqual(['Jueves', 8, [1]]);
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      mensaje: 'Bloques horarios actualizados correctamente',
      actualizados: 1,
    });
  });

  test('Error en BD al confirmar: revierte la transacción y retorna 500', async () => {
    const conn = mockConn();
    conn.query.mockRejectedValueOnce(new Error('DB caída'));
    const req = { body: { horario_ids: [1], cambios: { Horario_Asignatura_Dia_Semana: 'Jueves' } } };
    const res = mockRes();

    await horarioController.modificarMultiplesBloques(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
