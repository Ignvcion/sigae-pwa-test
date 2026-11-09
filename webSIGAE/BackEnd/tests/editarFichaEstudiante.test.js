const estudianteController = require('../controllers/estudianteController');
const db = require('../config/db');

jest.mock('../config/db');

describe('Pruebas Unitarias - CU38: Editando curso asociado y estado académico de un estudiante', () => {
  let req;
  let res;

  const estudianteActual = {
    Estudiante_Id: 1,
    Estudiante_Nombre_Completo: 'Diego Perez',
    Estudiante_RUT: '1-9',
    Estudiante_Estado_Academico: 'Regular',
    Curso_Id: 222,
    Apoderado_Usuario_Id: 4,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { id: '1' }, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test('Flujo correcto: actualiza el curso y el estado académico', async () => {
    req.body = { Curso_Id: 223, Estudiante_Estado_Academico: 'Retirado' };

    db.query
      .mockResolvedValueOnce([[estudianteActual]]) // SELECT estudiante actual
      .mockResolvedValueOnce([[{ Curso_Id: 223 }]]) // SELECT curso válido
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([[{ ...estudianteActual, Curso_Id: 223, Estudiante_Estado_Academico: 'Retirado' }]]); // SELECT actualizado

    await estudianteController.updateEstudiante(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mensaje: 'Ficha actualizada correctamente',
        estudiante: expect.objectContaining({ Curso_Id: 223, Estudiante_Estado_Academico: 'Retirado' }),
      })
    );
  });

  test('Excepción "Curso no existe o inactivo": rechaza sin ejecutar el UPDATE', async () => {
    req.body = { Curso_Id: 9999 };

    db.query
      .mockResolvedValueOnce([[estudianteActual]]) // SELECT estudiante actual
      .mockResolvedValueOnce([[]]); // SELECT curso -> no existe

    await estudianteController.updateEstudiante(req, res);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'El curso seleccionado no existe o no está activo en el período vigente ni en el siguiente' });
  });

  test('Excepción "Sin modificaciones": los valores enviados son iguales a los actuales', async () => {
    req.body = { Curso_Id: 222, Estudiante_Estado_Academico: 'Regular' };

    db.query.mockResolvedValueOnce([[estudianteActual]]); // SELECT estudiante actual (Curso_Id no cambió, no valida curso de nuevo)

    await estudianteController.updateEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No existen cambios para actualizar' });
  });

  test('Retorna 404 si el estudiante no existe', async () => {
    req.body = { Estudiante_Estado_Academico: 'Retirado' };
    db.query.mockResolvedValueOnce([[]]);

    await estudianteController.updateEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Estudiante no encontrado' });
  });

  test('Retorna 400 si no se envía ningún campo editable', async () => {
    req.body = { Campo_Invalido: 'x' };

    await estudianteController.updateEstudiante(req, res);

    expect(db.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'No hay campos válidos para actualizar' });
  });

  test('Excepción: error técnico retorna 500', async () => {
    req.body = { Estudiante_Estado_Academico: 'Retirado' };
    db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

    await estudianteController.updateEstudiante(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Error al actualizar el estudiante' });
  });

  test('Glosario 6.1.2: rechaza un nombre con números sin tocar la base de datos', async () => {
    req.body = { Estudiante_Nombre_Completo: 'Diego P3rez' };

    await estudianteController.updateEstudiante(req, res);

    expect(db.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
