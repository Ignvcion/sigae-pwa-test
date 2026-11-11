const bloquesController = require('../controllers/bloquesController');
const pool = require('../config/db');

jest.mock('../config/db');

const BLOQUE_VALIDO = {
  Bloque_Horario_Hora_Inicio: '09:00',
  Bloque_Horario_Hora_Fin: '09:45',
  Bloque_Horario_Jornada: 'Mañana',
  Bloque_Horario_Tipo: 'Clase',
};

const PARAMETRO_INSTITUCIONAL = {
  Parametro_Institucional_Id: 1,
  Parametro_Institucional_Inicio_Jornada: '08:00:00',
  Parametro_Institucional_Fin_Jornada: '17:00:00',
};

describe('Pruebas Unitarias - CU49: Modificando Bloques Horarios', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { id: '3' }, body: { ...BLOQUE_VALIDO } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('Flujo correcto: actualiza el bloque y retorna el mensaje de éxito', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 3, Parametro_Institucional_Id: 1 }]]) // existe
      .mockResolvedValueOnce([[PARAMETRO_INSTITUCIONAL]]) // parametro_institucional
      .mockResolvedValueOnce([[]]) // conflicto
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

    await bloquesController.updateBloque(req, res);

    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Bloque actualizado correctamente' });
  });

  test('Sin parámetros institucionales configurados: no permite guardar los cambios', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 3, Parametro_Institucional_Id: 1 }]]) // existe
      .mockResolvedValueOnce([[]]); // parametro_institucional vacío

    await bloquesController.updateBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });

  test('Excepción "Datos inválidos o fuera de rango": faltan campos obligatorios', async () => {
    req.body = { Bloque_Horario_Hora_Inicio: '09:00' };

    await bloquesController.updateBloque(req, res);

    expect(pool.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Datos inválidos o fuera de rango' });
  });

  test('Excepción "Datos inválidos o fuera de rango": hora de inicio posterior o igual a la de fin', async () => {
    req.body = { ...BLOQUE_VALIDO, Bloque_Horario_Hora_Inicio: '10:00', Bloque_Horario_Hora_Fin: '09:00' };

    await bloquesController.updateBloque(req, res);

    expect(pool.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Datos inválidos o fuera de rango' });
  });

  test('Excepción "Datos inválidos o fuera de rango": fuera del rango institucional', async () => {
    req.body = { ...BLOQUE_VALIDO, Bloque_Horario_Hora_Inicio: '07:00', Bloque_Horario_Hora_Fin: '07:45' };
    pool.execute
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 3, Parametro_Institucional_Id: 1 }]]) // existe
      .mockResolvedValueOnce([[PARAMETRO_INSTITUCIONAL]]); // parametro_institucional

    await bloquesController.updateBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Datos inválidos o fuera de rango' });
  });

  test('Excepción "Conflicto con bloque existente"', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 3, Parametro_Institucional_Id: 1 }]]) // existe
      .mockResolvedValueOnce([[PARAMETRO_INSTITUCIONAL]]) // parametro_institucional
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 9 }]]); // conflicto

    await bloquesController.updateBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Conflicto con bloque existente' });
  });

  test('Retorna 404 si el bloque a modificar no existe', async () => {
    pool.execute.mockResolvedValueOnce([[]]); // existe: vacío

    await bloquesController.updateBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bloque no encontrado' });
  });

  test('Retorna 500 si ocurre un error de base de datos', async () => {
    pool.execute.mockRejectedValueOnce(new Error('Fallo de conexión'));

    await bloquesController.updateBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error interno del servidor' });
  });
});

describe('Pruebas Unitarias - CU50: Eliminando Bloques Horarios Individuales', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { id: '3' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('Flujo correcto: elimina el bloque y retorna el mensaje de éxito', async () => {
    pool.execute
      .mockResolvedValueOnce([[]]) // horario_asignatura: sin uso
      .mockResolvedValueOnce([[]]) // afecta: sin uso
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE

    await bloquesController.deleteBloque(req, res);

    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Bloque eliminado exitosamente' });
  });

  test('Excepción "Bloque horario no existe"', async () => {
    pool.execute
      .mockResolvedValueOnce([[]]) // horario_asignatura: sin uso
      .mockResolvedValueOnce([[]]) // afecta: sin uso
      .mockResolvedValueOnce([{ affectedRows: 0 }]); // DELETE: no encontrado

    await bloquesController.deleteBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'El bloque horario no existe' });
  });

  test('Excepción "Bloque posee asignaciones activas"', async () => {
    pool.execute.mockResolvedValueOnce([[{ Horario_Asignatura_Id: 1 }, { Horario_Asignatura_Id: 2 }]]); // horario_asignatura: con clases

    await bloquesController.deleteBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    // El panel de avisos usa codigo/clases para ofrecer reubicarlas antes de quitar el bloque
    expect(res.json).toHaveBeenCalledWith({ error: 'El bloque posee asignaciones activas', codigo: 'TIENE_CLASES', clases: 2 });
  });

  test('Retorna 409 si el bloque está asociado a un evento institucional', async () => {
    pool.execute
      .mockResolvedValueOnce([[]]) // horario_asignatura: sin uso
      .mockResolvedValueOnce([[{ Afecta_Id: 1 }]]); // afecta: en uso

    await bloquesController.deleteBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'No se puede eliminar: el bloque está asociado a un evento institucional' });
  });

  test('Excepción "Error durante la eliminación en BD"', async () => {
    pool.execute.mockRejectedValueOnce(new Error('Fallo de conexión'));

    await bloquesController.deleteBloque(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Ocurrió un error al eliminar' });
  });
});

describe('Pruebas Unitarias - CU51: Eliminando Múltiples Bloques Horarios', () => {
  let req;
  let res;

  function crearConnMock() {
    return {
      beginTransaction: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: { bloques_id: [3, 4] } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('Excepción: rechaza sin consultar la base de datos si no se seleccionan bloques', async () => {
    req.body = { bloques_id: [] };

    await bloquesController.deleteMultiplesBloques(req, res);

    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Debe seleccionar al menos un bloque horario' });
  });

  test('Flujo correcto: elimina todos los bloques seleccionados en una sola transacción', async () => {
    const conn = crearConnMock();
    conn.query
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 3 }, { Bloque_Horario_Id: 4 }]]) // existentes
      .mockResolvedValueOnce([[]]) // horario_asignatura: sin uso
      .mockResolvedValueOnce([[]]) // afecta: sin uso
      .mockResolvedValueOnce([{ affectedRows: 2 }]); // DELETE
    pool.getConnection.mockResolvedValueOnce(conn);

    await bloquesController.deleteMultiplesBloques(req, res);

    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Bloques eliminados exitosamente' });
  });

  test('Excepción "Uno o más bloques horarios no existen": no elimina ninguno', async () => {
    const conn = crearConnMock();
    conn.query.mockResolvedValueOnce([[{ Bloque_Horario_Id: 3 }]]); // solo uno de los dos existe

    pool.getConnection.mockResolvedValueOnce(conn);

    await bloquesController.deleteMultiplesBloques(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Uno o más bloques horarios no existen' });
  });

  test('Excepción "Tienen asignaciones o restricciones" por asignación activa: no elimina ninguno', async () => {
    const conn = crearConnMock();
    conn.query
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 3 }, { Bloque_Horario_Id: 4 }]]) // existentes
      .mockResolvedValueOnce([[{ Horario_Asignatura_Id: 1 }]]); // horario_asignatura: en uso
    pool.getConnection.mockResolvedValueOnce(conn);

    await bloquesController.deleteMultiplesBloques(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Uno o más bloques poseen asignaciones activas o restricciones asociadas' });
  });

  test('Excepción "Tienen asignaciones o restricciones" por evento institucional: no elimina ninguno', async () => {
    const conn = crearConnMock();
    conn.query
      .mockResolvedValueOnce([[{ Bloque_Horario_Id: 3 }, { Bloque_Horario_Id: 4 }]]) // existentes
      .mockResolvedValueOnce([[]]) // horario_asignatura: sin uso
      .mockResolvedValueOnce([[{ Afecta_Id: 1 }]]); // afecta: en uso
    pool.getConnection.mockResolvedValueOnce(conn);

    await bloquesController.deleteMultiplesBloques(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Uno o más bloques poseen asignaciones activas o restricciones asociadas' });
  });

  test('Excepción "Error durante la eliminación en BD": hace rollback y retorna 500', async () => {
    const conn = crearConnMock();
    conn.query.mockRejectedValueOnce(new Error('Fallo de conexión'));
    pool.getConnection.mockResolvedValueOnce(conn);

    await bloquesController.deleteMultiplesBloques(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Ocurrió un error al eliminar' });
  });
});

// Base de producción recién creada (schema_base.sql + catalogos_base.sql): la tabla
// parametro_institucional está vacía. El administrador debe poder crearlos desde la
// pestaña "Parámetros institucionales" (antes la pantalla solo mostraba el error).
describe('Parámetros institucionales sin configurar (primera vez)', () => {
  const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
  const PARAMETROS = {
    Parametro_Institucional_Inicio_Jornada: '08:00',
    Parametro_Institucional_Fin_Jornada: '16:30',
    Parametro_Institucional_Duracion_Bloque: '45',
    Parametro_Institucional_Duracion_Recreo: '15',
    Parametro_Institucional_Bloques_Maximos_Diarios: '8',
  };

  beforeEach(() => jest.clearAllMocks());

  test('GET responde 404 con el código SIN_PARAMETROS', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    const res = nuevoRes();
    await bloquesController.getParametros({}, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'SIN_PARAMETROS' }));
  });

  test('PUT crea la fila cuando no existe (con el período vigente = año actual)', async () => {
    pool.execute
      .mockResolvedValueOnce([[]]) // no hay parámetros
      .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT
    const res = nuevoRes();
    await bloquesController.updateParametros({ body: { ...PARAMETROS } }, res);

    const [sql, valores] = pool.execute.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO parametro_institucional/);
    expect(valores).toEqual(['08:00', '16:30', 45, 15, 8, String(new Date().getFullYear())]);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Parámetros actualizados correctamente' });
  });

  test('PUT rechaza valores no numéricos sin escribir', async () => {
    const res = nuevoRes();
    await bloquesController.updateParametros({ body: { ...PARAMETROS, Parametro_Institucional_Duracion_Bloque: 'abc' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.execute).not.toHaveBeenCalled();
  });
});
