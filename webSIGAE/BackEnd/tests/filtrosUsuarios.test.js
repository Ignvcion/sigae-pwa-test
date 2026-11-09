const usuarioController = require('../controllers/usuarioController');
const db = require('../config/db');

jest.mock('../config/db');

describe('Pruebas Unitarias - CU29 a CU33: Listados y Filtros de Usuarios, Docentes y Apoderados', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // CU30 y CU31: Listado y filtro de Docentes
  describe('CU30 y CU31 - getDocentes', () => {
    test('CU107: calcula las horas adeudadas con la disponibilidad del período vigente', async () => {
      db.query.mockResolvedValueOnce([[
        { Usuario_Id: 5, Docente_Carga_Horaria_Semanal: 32, Horas_Disponibles: '12.0000' },
        { Usuario_Id: 6, Docente_Carga_Horaria_Semanal: 30, Horas_Disponibles: '40.5' },
      ]]);
      await usuarioController.getDocentes(req, res);
      expect(res.json.mock.calls[0][0].map((d) => [d.Horas_Disponibles, d.Horas_Adeudadas])).toEqual([[12, 20], [40.5, 0]]);
    });

    test('CU30: Debe retornar el listado completo de docentes', async () => {
      const mockDocentes = [
        {
          Usuario_Id: 1,
          Usuario_Nombre_Completo: 'Carlos Ruiz',
          Docente_Especialidad: 'Matemáticas',
          Usuario_Estado_Cuenta: 1,
          Es_Docente: 1,
        },
      ];

      db.query.mockResolvedValueOnce([mockDocentes]);

      await usuarioController.getDocentes(req, res);

      // CU107: cada docente trae además sus horas disponibles y adeudadas
      expect(res.json).toHaveBeenCalledWith(mockDocentes.map((d) => ({ ...d, Horas_Disponibles: null, Horas_Adeudadas: 0 })));
    });

    test('CU31: Debe filtrar docentes por especialidad y estado de cuenta', async () => {
      req.query = { especialidad: 'Historia', estado: '1' };

      const mockDocentesFiltrados = [
        {
          Usuario_Id: 2,
          Usuario_Nombre_Completo: 'Ana Rojas',
          Docente_Especialidad: 'Historia',
          Usuario_Estado_Cuenta: 1,
        },
      ];

      db.query.mockResolvedValueOnce([mockDocentesFiltrados]);

      await usuarioController.getDocentes(req, res);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('AND Docente_Especialidad LIKE ?'),
        expect.arrayContaining(['%Historia%', 1])
      );
      // CU107: cada docente trae además sus horas disponibles y adeudadas
      expect(res.json).toHaveBeenCalledWith(mockDocentesFiltrados.map((d) => ({ ...d, Horas_Disponibles: null, Horas_Adeudadas: 0 })));
    });

    test('CU31 - Excepción "Sin coincidencias": Retorna mensaje si no hay coincidencias con los filtros', async () => {
      req.query = { especialidad: 'Inexistente' };
      db.query.mockResolvedValueOnce([[]]);

      await usuarioController.getDocentes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mensaje: 'No existen docentes asociados a los filtros aplicados',
          docentes: [],
        })
      );
    });

    test('CU31 - Excepción "Problema técnico": con filtros aplicados retorna 500 con mensaje distinto al de CU30', async () => {
      req.query = { especialidad: 'Historia' };
      db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

      await usuarioController.getDocentes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        mensaje: 'No fue posible completar la operación',
      });
    });

    test('CU30 - Excepción: sin filtros, retorna mensaje de que no existen docentes registrados', async () => {
      db.query.mockResolvedValueOnce([[]]);

      await usuarioController.getDocentes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mensaje: 'No existen docentes registrados',
          docentes: [],
        })
      );
    });

    test('CU30 - Excepción: error técnico retorna 500 con mensaje de reintento', async () => {
      db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

      await usuarioController.getDocentes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        mensaje: 'No fue posible obtener el listado, reintente posteriormente',
      });
    });
  });

  // CU32 y CU33: Listado y filtro de Apoderados
  describe('CU32 y CU33 - getApoderados', () => {
    test('CU32: Debe retornar el listado completo de apoderados con sus estudiantes vinculados', async () => {
      const mockFilas = [
        {
          Usuario_Id: 10,
          Usuario_Nombre_Completo: 'Pedro Morales',
          Total_Estudiantes_Asociados: 2,
          Es_Apoderado: 1,
          Estudiantes_Asociados_Raw: 'Juan Perez::Regular::Titular||Ana Perez::Irregular::Suplente',
        },
      ];

      db.query.mockResolvedValueOnce([mockFilas]);

      await usuarioController.getApoderados(req, res);

      // RF57: cuenta y lista a los estudiantes donde es titular y donde es suplente
      expect(db.query.mock.calls[0][0]).toContain('apoderado_suplente');
      expect(res.json).toHaveBeenCalledWith([
        {
          Usuario_Id: 10,
          Usuario_Nombre_Completo: 'Pedro Morales',
          Total_Estudiantes_Asociados: 2,
          Es_Apoderado: 1,
          Estudiantes: [
            { Estudiante_Nombre_Completo: 'Juan Perez', Estudiante_Estado_Academico: 'Regular', Rol_Apoderado: 'Titular' },
            { Estudiante_Nombre_Completo: 'Ana Perez', Estudiante_Estado_Academico: 'Irregular', Rol_Apoderado: 'Suplente' },
          ],
        },
      ]);
    });

    test('CU32: Un apoderado sin estudiantes asociados recibe una lista vacía de Estudiantes', async () => {
      const mockFilas = [
        {
          Usuario_Id: 12,
          Usuario_Nombre_Completo: 'Marta Soto',
          Total_Estudiantes_Asociados: 0,
          Estudiantes_Asociados_Raw: null,
        },
      ];

      db.query.mockResolvedValueOnce([mockFilas]);

      await usuarioController.getApoderados(req, res);

      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({ Usuario_Id: 12, Estudiantes: [] }),
      ]);
    });

    test('CU33: Debe filtrar apoderados por cantidad de estudiantes asociados (operador por defecto "=")', async () => {
      req.query = { cantidadEstudiantes: '2' };

      const mockFilas = [
        {
          Usuario_Id: 10,
          Usuario_Nombre_Completo: 'Pedro Morales',
          Total_Estudiantes_Asociados: 2,
          Estudiantes_Asociados_Raw: 'Juan Perez::Regular||Ana Perez::Regular',
        },
      ];

      db.query.mockResolvedValueOnce([mockFilas]);

      await usuarioController.getApoderados(req, res);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('HAVING Total_Estudiantes_Asociados = ?'),
        expect.arrayContaining([2])
      );
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({ Usuario_Id: 10, Total_Estudiantes_Asociados: 2 }),
      ]);
    });

    test('CU33: Debe filtrar apoderados usando el operador indicado', async () => {
      req.query = { operador: '>=', cantidadEstudiantes: '3' };

      const mockFilas = [
        {
          Usuario_Id: 11,
          Usuario_Nombre_Completo: 'Laura Soto',
          Total_Estudiantes_Asociados: 4,
          Estudiantes_Asociados_Raw: null,
        },
      ];

      db.query.mockResolvedValueOnce([mockFilas]);

      await usuarioController.getApoderados(req, res);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('HAVING Total_Estudiantes_Asociados >= ?'),
        expect.arrayContaining([3])
      );
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({ Usuario_Id: 11, Total_Estudiantes_Asociados: 4 }),
      ]);
    });

    test('CU33 - Excepción "Valor no entero o negativo": rechaza sin consultar la base de datos', async () => {
      req.query = { operador: '=', cantidadEstudiantes: '-1' };

      await usuarioController.getApoderados(req, res);

      expect(db.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Ingrese un número entero válido' });
    });

    test('CU33 - Excepción "Valor no entero o negativo": rechaza un valor decimal', async () => {
      req.query = { cantidadEstudiantes: '2.5' };

      await usuarioController.getApoderados(req, res);

      expect(db.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Ingrese un número entero válido' });
    });

    test('CU33 - Excepción "Valor no entero o negativo": rechaza un operador desconocido', async () => {
      req.query = { operador: '<>', cantidadEstudiantes: '2' };

      await usuarioController.getApoderados(req, res);

      expect(db.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Ingrese un número entero válido' });
    });

    test('CU33 - Excepción "Sin resultados coincidentes": Retorna mensaje si no hay coincidencias de apoderados', async () => {
      req.query = { cantidadEstudiantes: '99' };
      db.query.mockResolvedValueOnce([[]]);

      await usuarioController.getApoderados(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mensaje: 'No existen usuarios con rol apoderado que cumplan los criterios seleccionados',
          apoderados: [],
        })
      );
    });

    test('CU32 - Excepción: sin filtros, retorna mensaje de que no existen apoderados registrados', async () => {
      db.query.mockResolvedValueOnce([[]]);

      await usuarioController.getApoderados(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mensaje: 'No existen apoderados registrados',
          apoderados: [],
        })
      );
    });

    test('CU32 - Excepción "Interrupción técnica crítica": sin filtros, retorna 500 con mensaje de reintento', async () => {
      db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

      await usuarioController.getApoderados(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        mensaje: 'Los datos no pudieron ser cargados, reintente más tarde',
      });
    });
  });

  // CU29: Búsqueda de usuarios con filtros avanzados por rol y estado de cuenta
  describe('CU29 - getUsuariosPorFiltro', () => {
    test('Flujo correcto: Super Admin filtra por rol y estado', async () => {
      req.query = { rol: 'Docente', estado: '1' };
      req.user = { id: 1, administradorTipo: 'Super Admin' };

      const mockUsuarios = [
        { Usuario_Id: 5, Usuario_Nombre_Completo: 'Carlos Ruiz', Es_Docente: 1, Usuario_Estado_Cuenta: 1 },
      ];
      db.query.mockResolvedValueOnce([mockUsuarios]);

      await usuarioController.getUsuariosPorFiltro(req, res);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('AND Es_Docente = 1'),
        expect.arrayContaining([1])
      );
      expect(res.json).toHaveBeenCalledWith(mockUsuarios);
    });

    test('Flujo correcto: un Administrador normal puede filtrar por Docente o Apoderado', async () => {
      req.query = { rol: 'Apoderado' };
      req.user = { id: 2, administradorTipo: 'Administrador Normal' };

      db.query.mockResolvedValueOnce([[{ Usuario_Id: 6, Es_Apoderado: 1 }]]);

      await usuarioController.getUsuariosPorFiltro(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith([{ Usuario_Id: 6, Es_Apoderado: 1 }]);
    });

    test('Excepción "Sin coincidencias": retorna mensaje si no hay usuarios con esos filtros', async () => {
      req.query = { rol: 'Docente', estado: '0' };
      req.user = { id: 1, administradorTipo: 'Super Admin' };
      db.query.mockResolvedValueOnce([[]]);

      await usuarioController.getUsuariosPorFiltro(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          mensaje: 'No se encontraron usuarios con esos filtros',
          usuarios: [],
        })
      );
    });

    test('Excepción "Filtros fuera de privilegios": Administrador normal no puede filtrar por rol Administrador', async () => {
      req.query = { rol: 'Administrador' };
      req.user = { id: 2, administradorTipo: 'Administrador Normal' };

      await usuarioController.getUsuariosPorFiltro(req, res);

      expect(db.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Filtros no autorizados' });
    });

    test('Un Super Admin sí puede filtrar por rol Administrador', async () => {
      req.query = { rol: 'Administrador' };
      req.user = { id: 1, administradorTipo: 'Super Admin' };
      db.query.mockResolvedValueOnce([[{ Usuario_Id: 1, Es_Administrador: 1 }]]);

      await usuarioController.getUsuariosPorFiltro(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith([{ Usuario_Id: 1, Es_Administrador: 1 }]);
    });

    test('Excepción "Problema técnico": retorna 500 si la consulta falla', async () => {
      req.query = { rol: 'Docente' };
      req.user = { id: 1, administradorTipo: 'Super Admin' };
      db.query.mockRejectedValueOnce(new Error('Fallo de conexión'));

      await usuarioController.getUsuariosPorFiltro(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ mensaje: 'Ocurrió un problema técnico' });
    });
  });
});