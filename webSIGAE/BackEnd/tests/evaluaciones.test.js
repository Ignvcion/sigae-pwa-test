const controller = require('../controllers/evaluacionController');
const pool = require('../config/db');

jest.mock('../config/db');

const pad = (n) => String(n).padStart(2, '0');
// Fecha hábil futura (YYYY-MM-DD)
function fechaHabil(dias = 7) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const FECHA = fechaHabil();

const bodyValido = (extra = {}) => ({
  Curso_Id: 222,
  Asignatura_Id: 2222,
  Evaluacion_Fecha: FECHA,
  Evaluacion_Tipo: 'Prueba',
  Evaluacion_Contenidos: '  Unidad 3: fracciones  ',
  ...extra,
});

const filaEvaluacion = (extra = {}) => ({
  Evaluacion_Id: 1,
  Evaluacion_Fecha: FECHA,
  Evaluacion_Tipo: 'Prueba',
  Evaluacion_Contenidos: 'Unidad 3',
  Curso_Id: 222,
  Curso_Nombre: '1ero Básico A',
  Asignatura_Id: 2222,
  Asignatura_Nombre: 'Matemática',
  Docente_Usuario_Id: 3,
  Docente_Nombre: 'María Morales',
  ...extra,
});

describe('Pruebas Unitarias - CU92/CU93/CU94: Calendario de evaluaciones (RF58, RF59)', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: { id: 3, roles: ['Docente'] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    pool.query = jest.fn();
  });

  describe('validaciones', () => {
    test('rangoDelMes calcula el último día, incluido febrero bisiesto', () => {
      expect(controller.rangoDelMes('2026-11')).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
      expect(controller.rangoDelMes('2028-02')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
      expect(controller.rangoDelMes('2026-13')).toBeNull();
      expect(controller.rangoDelMes('noviembre')).toBeNull();
    });

    test('CU92 Excepción 2: datos incompletos', () => {
      const { errores } = controller.validarEvaluacion({});
      expect(Object.keys(errores)).toEqual(['asignacion', 'fecha', 'tipo', 'contenidos']);
    });

    test('rechaza fechas pasadas, fines de semana y tipos desconocidos', () => {
      expect(controller.validarEvaluacion(bodyValido({ Evaluacion_Fecha: '2020-03-02' })).errores.fecha)
        .toBe('La fecha no puede ser anterior a hoy');
      const sabado = (() => {
        const d = new Date(); d.setDate(d.getDate() + 7);
        while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      })();
      expect(controller.validarEvaluacion(bodyValido({ Evaluacion_Fecha: sabado })).errores.fecha)
        .toBe('La evaluación debe ser en un día hábil (lunes a viernes)');
      expect(controller.validarEvaluacion(bodyValido({ Evaluacion_Tipo: 'Quiz' })).errores.tipo).toBe('Tipo de evaluación inválido');
    });

    test('normaliza los datos válidos', () => {
      expect(controller.validarEvaluacion(bodyValido()).datos).toEqual({
        cursoId: 222, asignaturaId: 2222, fecha: FECHA, tipo: 'Prueba', contenidos: 'Unidad 3: fracciones',
      });
    });
  });

  test('CU92 Excepción 1: el docente sin asignaciones recibe un mensaje', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await controller.getMisAsignaciones(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual([3]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].asignaciones).toEqual([]);
  });

  test('CU92 Flujo correcto: registra la evaluación del docente', async () => {
    req.body = bodyValido();
    pool.query
      .mockResolvedValueOnce([[{ 1: 1 }]])       // tiene la asignación
      .mockResolvedValueOnce([[]])               // sin eventos que suspendan clases
      .mockResolvedValueOnce([{ insertId: 9 }])
      .mockResolvedValueOnce([[filaEvaluacion({ Evaluacion_Id: 9 })]]);

    await controller.crearEvaluacion(req, res);

    expect(pool.query.mock.calls[0][1]).toEqual([3, 222, 2222]);
    expect(pool.query.mock.calls[2][1]).toEqual([FECHA, 'Prueba', 'Unidad 3: fracciones', 222, 2222, 3]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].evaluacion).toEqual(expect.objectContaining({ Evaluacion_Id: 9, Es_Propia: true }));
  });

  test('CU92: no se registra en un curso o asignatura que el docente no tiene', async () => {
    req.body = bodyValido({ Asignatura_Id: 2223 });
    pool.query.mockResolvedValueOnce([[]]);

    await controller.crearEvaluacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('CU92 Excepción 3: advierte si la fecha tiene un evento que suspende clases', async () => {
    req.body = bodyValido();
    pool.query
      .mockResolvedValueOnce([[{ 1: 1 }]])
      .mockResolvedValueOnce([[{ Evento_Institucional_Id: 1, Evento_Institucional_Nombre: 'Consejo de Profesores', Evento_Institucional_Impacto_Clases: 'Suspensión total' }]]);

    await controller.crearEvaluacion(req, res);

    expect(pool.query.mock.calls[1][1]).toEqual([FECHA, 'Sin impacto']);
    expect(res.status).toHaveBeenCalledWith(409);
    const respuesta = res.json.mock.calls[0][0];
    expect(respuesta.requiereConfirmacion).toBe(true);
    expect(respuesta.mensaje).toContain('Consejo de Profesores (Suspensión total)');
    expect(pool.query).toHaveBeenCalledTimes(2); // sin INSERT
  });

  test('CU92 Excepción 3: con confirmación se registra igual', async () => {
    req.body = bodyValido({ confirmar: true });
    pool.query
      .mockResolvedValueOnce([[{ 1: 1 }]])
      .mockResolvedValueOnce([[{ Evento_Institucional_Id: 1, Evento_Institucional_Nombre: 'Acto', Evento_Institucional_Impacto_Clases: 'Salida anticipada' }]])
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[filaEvaluacion({ Evaluacion_Id: 10 })]]);

    await controller.crearEvaluacion(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('CU92: solo un docente registra evaluaciones', async () => {
    req.user = { id: 2, roles: ['Administrador'] };
    await controller.crearEvaluacion(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('CU93 Excepción 1: no puede modificar la evaluación de otro docente', async () => {
    req.params.id = '2';
    req.body = bodyValido();
    pool.query.mockResolvedValueOnce([[filaEvaluacion({ Evaluacion_Id: 2, Docente_Usuario_Id: 5 })]]);

    await controller.actualizarEvaluacion(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'La evaluación pertenece a otro docente; no puedes modificarla' });
  });

  test('CU93: modifica la evaluación propia aplicando las validaciones del registro', async () => {
    req.params.id = '1';
    req.body = bodyValido({ Evaluacion_Tipo: 'Control' });
    pool.query
      .mockResolvedValueOnce([[filaEvaluacion()]])
      .mockResolvedValueOnce([[{ 1: 1 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await controller.actualizarEvaluacion(req, res);

    expect(pool.query.mock.calls[3][0]).toContain('UPDATE evaluacion');
    expect(pool.query.mock.calls[3][1]).toEqual([FECHA, 'Control', 'Unidad 3: fracciones', 222, 2222, 1, 3]);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Evaluación actualizada' });
  });

  test('CU93: elimina la evaluación propia; la ajena no', async () => {
    req.params.id = '1';
    pool.query.mockResolvedValueOnce([[filaEvaluacion()]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await controller.eliminarEvaluacion(req, res);
    expect(pool.query.mock.calls[1]).toEqual(['DELETE FROM evaluacion WHERE Evaluacion_Id = ? AND Docente_Usuario_Id = ?', [1, 3]]);

    jest.clearAllMocks();
    pool.query.mockResolvedValueOnce([[filaEvaluacion({ Docente_Usuario_Id: 5 })]]);
    await controller.eliminarEvaluacion(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('CU93: una evaluación inexistente responde 404', async () => {
    req.params.id = '99';
    pool.query.mockResolvedValueOnce([[]]);
    await controller.eliminarEvaluacion(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  describe('CU94: calendario mensual según el rol', () => {
    test('exige un mes válido', async () => {
      req.query = { mes: '2026' };
      await controller.getEvaluaciones(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('docente: cursos donde hace clases o es profesor jefe, marcando las propias', async () => {
      req.query = { mes: '2026-11', rol: 'Docente' };
      pool.query.mockResolvedValueOnce([[filaEvaluacion(), filaEvaluacion({ Evaluacion_Id: 2, Docente_Usuario_Id: 5 })]]);

      await controller.getEvaluaciones(req, res);

      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('Curso_Profesor_Jefe_Usuario_Id');
      expect(params).toEqual(['2026-11-01', '2026-11-30', 3, 3]);
      expect(res.json.mock.calls[0][0].map((e) => e.Es_Propia)).toEqual([true, false]);
    });

    test('apoderado: debe elegir un estudiante propio (titular o suplente)', async () => {
      req.user = { id: 8, roles: ['Apoderado'] };
      req.query = { mes: '2026-11', rol: 'Apoderado' };
      await controller.getEvaluaciones(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      jest.clearAllMocks();
      req.query.estudianteId = '222222225';
      pool.query.mockResolvedValueOnce([[]]); // no es su estudiante
      await controller.getEvaluaciones(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('apoderado: ve las evaluaciones del curso de su estudiante', async () => {
      req.user = { id: 8, roles: ['Apoderado'] };
      req.query = { mes: '2026-11', rol: 'Apoderado', estudianteId: '222222222', asignaturaId: '2222' };
      pool.query.mockResolvedValueOnce([[{ 1: 1 }]]).mockResolvedValueOnce([[filaEvaluacion()]]);

      await controller.getEvaluaciones(req, res);

      const [sql, params] = pool.query.mock.calls[1];
      expect(sql).toContain('SELECT e.Curso_Id FROM estudiante e WHERE e.Estudiante_Id = ?');
      expect(params).toEqual(['2026-11-01', '2026-11-30', 222222222, 2222]);
      expect(res.json.mock.calls[0][0][0].Es_Propia).toBe(false);
    });

    test('administrador: toda la institución, con filtro opcional por curso', async () => {
      req.user = { id: 2, roles: ['Administrador'] };
      req.query = { mes: '2026-11', rol: 'Administrador', cursoId: '223' };
      pool.query.mockResolvedValueOnce([[filaEvaluacion()]]);

      await controller.getEvaluaciones(req, res);

      expect(pool.query.mock.calls[0][1]).toEqual(['2026-11-01', '2026-11-30', 223]);
    });

    test('Excepción 1: sin evaluaciones en el mes se informa', async () => {
      req.query = { mes: '2026-12', rol: 'Docente' };
      pool.query.mockResolvedValueOnce([[]]);

      await controller.getEvaluaciones(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'No hay evaluaciones registradas en este mes', evaluaciones: [] });
    });
  });
});
