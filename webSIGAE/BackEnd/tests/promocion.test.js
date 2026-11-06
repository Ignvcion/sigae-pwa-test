// RF61: reglas de situación final, promoción y limpieza al cambiar de período.
const pool = require('../config/db');
const { valoresPermitidos, normalizarValor, normalizarRut, EFECTOS } = require('../utils/situacionFinal');
const { ejecutarLimpieza } = require('../utils/limpiezaPeriodo');
const { promoverCurso } = require('../controllers/promocionController');
const { iniciarNuevoPeriodo } = require('../controllers/periodoController');

jest.mock('../config/db');

describe('utils/situacionFinal', () => {
  test('Valores según el nivel: el último nivel tiene Egresado y En práctica', () => {
    expect(valoresPermitidos(3, 14)).toEqual(['Promovido', 'Repitente', 'Retirado']);
    expect(valoresPermitidos(14, 14)).toEqual(['Egresado', 'En práctica', 'Repitente', 'Retirado']);
  });

  test('normalizarValor acepta mayúsculas, tildes y espacios de más', () => {
    const v = valoresPermitidos(14, 14);
    expect(normalizarValor('  en   PRACTICA ', v)).toBe('En práctica');
    expect(normalizarValor('egresado', v)).toBe('Egresado');
    expect(normalizarValor('Promovido', v)).toBeNull(); // no es valor de 4to medio
    expect(normalizarValor('', v)).toBeNull();
  });

  test('normalizarRut quita puntos y deja la K en mayúscula', () => {
    expect(normalizarRut('12.345.678-k')).toBe('12345678-K');
    expect(normalizarRut(' 5158743-K ')).toBe('5158743-K');
    expect(normalizarRut('12345678')).toBeNull();
  });

  test('Efectos: promovido y repitente cambian de curso; el resto cambia el estado académico', () => {
    expect(EFECTOS.Promovido.destino).toBe('siguiente');
    expect(EFECTOS.Repitente.destino).toBe('mismo');
    expect(EFECTOS.Egresado).toEqual({ destino: null, estadoAcademico: 'Egresado' });
    expect(EFECTOS.Retirado.estadoAcademico).toBe('Retirado');
  });
});

/** Conexión simulada que responde por patrón de SQL. */
function mockConexion(respuestas) {
  const conn = {
    query: jest.fn(async (sql, params) => {
      for (const [patron, valor] of respuestas) {
        if (patron.test(sql)) return typeof valor === 'function' ? valor(sql, params) : valor;
      }
      return [{ affectedRows: 1, insertId: 900 }];
    }),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  pool.getConnection = jest.fn().mockResolvedValue(conn);
  return conn;
}

const CURSO = [[{
  Curso_Id: 222, Curso_Nombre: '1ero Básico A', Curso_Seccion: 'A', Curso_Periodo_Lectivo: '2026', Nivel_Educativo_Id: 24,
  Curso_Profesor_Jefe_Usuario_Id: 3, Nivel_Educativo_Nombre: '1ero Básico', Nivel_Educativo_Orden: 3, Orden_Maximo: 14,
}]];
const periodos = (siguiente) => [[{ Parametro_Institucional_Id: 1, Parametro_Institucional_Periodo_Vigente: '2026', Parametro_Institucional_Periodo_Siguiente: siguiente }]];
const sit = (id, valor) => ({ Situacion_Final_Id: id, Situacion_Final_Valor: valor, Estudiante_Id: id, Estudiante_Nombre_Completo: `E${id}`, Estudiante_Estado_Academico: 'Regular', Curso_Id: 222 });

describe('CU100: promover curso', () => {
  let res;
  const req = (body = {}) => ({ params: { cursoId: '222' }, body, user: { id: 1, roles: ['Administrador'] } });
  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  });

  test('Sin cierre iniciado, promovidos y repitentes no se aplican (409)', async () => {
    const conn = mockConexion([
      [/FROM curso c\s+JOIN nivel_educativo n/, CURSO],
      [/FROM parametro_institucional/, periodos(null)],
      [/FROM situacion_final sf/, [[sit(1, 'Promovido')]]],
    ]);
    await promoverCurso(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('Sin cierre, un retiro sí se aplica: cambia el estado académico y queda Aplicado', async () => {
    const conn = mockConexion([
      [/FROM curso c\s+JOIN nivel_educativo n/, CURSO],
      [/FROM parametro_institucional/, periodos(null)],
      [/FROM situacion_final sf/, [[sit(1, 'Retirado')]]],
    ]);
    await promoverCurso(req({ estudianteIds: [1] }), res);
    const sqls = conn.query.mock.calls.map((c) => c[0]);
    expect(sqls).toContain('UPDATE estudiante SET Estudiante_Estado_Academico = ? WHERE Estudiante_Id = ?');
    expect(sqls).toContain('UPDATE situacion_final SET Situacion_Final_Estado = ? WHERE Situacion_Final_Id = ?');
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].aplicadas.Retirado).toBe(1);
  });

  test('Exc. 2: si falta el curso de destino, ofrece crearlo sin modificar nada', async () => {
    const conn = mockConexion([
      [/WHERE n.Nivel_Educativo_Orden = \? AND c.Curso_Seccion = \?/, [[]]],
      [/FROM curso c\s+JOIN nivel_educativo n/, CURSO],
      [/FROM parametro_institucional/, periodos('2027')],
      [/FROM situacion_final sf/, [[sit(1, 'Promovido')]]],
      [/FROM nivel_educativo WHERE Nivel_Educativo_Orden = \?/, [[{ Nivel_Educativo_Id: 25, Nivel_Educativo_Nombre: '2do Básico' }]]],
    ]);
    await promoverCurso(req(), res);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({
      requiereCrearCursos: true,
      cursos: [{ Curso_Nombre: '2do Básico A', Curso_Periodo_Lectivo: '2027' }],
    }));
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('Crea el curso de destino, hereda el profesor jefe y mueve al estudiante', async () => {
    const conn = mockConexion([
      [/WHERE n.Nivel_Educativo_Orden = \? AND c.Curso_Seccion = \?/, [[]]],
      [/FROM curso c\s+JOIN nivel_educativo n/, CURSO],
      [/FROM parametro_institucional/, periodos('2027')],
      [/FROM situacion_final sf/, [[sit(1, 'Promovido')]]],
      [/FROM nivel_educativo WHERE Nivel_Educativo_Orden = \?/, [[{ Nivel_Educativo_Id: 25, Nivel_Educativo_Nombre: '2do Básico' }]]],
      [/INSERT INTO curso/, [{ insertId: 500 }]],
      [/FROM usuario WHERE Usuario_Id = \?/, [[{ Usuario_Id: 3, Usuario_RUT: '3-3', Usuario_Nombre_Completo: 'María', Es_Docente: 1, Usuario_Estado_Cuenta: 1 }]]],
      [/WHERE Curso_Profesor_Jefe_Usuario_Id = \? AND Curso_Periodo_Lectivo = \?/, [[]]],
    ]);
    await promoverCurso(req({ crearCursosFaltantes: true }), res);
    const llamadas = conn.query.mock.calls;
    expect(llamadas.find(([s]) => /INSERT INTO curso/.test(s))[1]).toEqual(['A', '2do Básico A', 25, '2027']);
    expect(llamadas.find(([s]) => /UPDATE curso SET Curso_Profesor_Jefe_Usuario_Id = \?/.test(s))[1]).toEqual([3, 500]);
    expect(llamadas.find(([s]) => /UPDATE estudiante SET Curso_Id/.test(s))[1]).toEqual([500, 1]);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ cursosCreados: ['2do Básico A (2027)'], advertencias: [] }));
  });

  test('Si el jefe ya tiene 2 jefaturas en el período nuevo, no se hereda y se advierte', async () => {
    mockConexion([
      [/WHERE n.Nivel_Educativo_Orden = \? AND c.Curso_Seccion = \?/, [[{ Curso_Id: 501, Curso_Nombre: '2do Básico A', Curso_Seccion: 'A', Curso_Periodo_Lectivo: '2027', Curso_Profesor_Jefe_Usuario_Id: null }]]],
      [/FROM curso c\s+JOIN nivel_educativo n/, CURSO],
      [/FROM parametro_institucional/, periodos('2027')],
      [/FROM situacion_final sf/, [[sit(1, 'Promovido')]]],
      [/FROM nivel_educativo WHERE Nivel_Educativo_Orden = \?/, [[{ Nivel_Educativo_Id: 25, Nivel_Educativo_Nombre: '2do Básico' }]]],
      [/FROM usuario WHERE Usuario_Id = \?/, [[{ Usuario_Id: 3, Usuario_Nombre_Completo: 'María', Es_Docente: 1, Usuario_Estado_Cuenta: 1 }]]],
      [/WHERE Curso_Profesor_Jefe_Usuario_Id = \? AND Curso_Periodo_Lectivo = \?/, [[{ Curso_Nombre: 'X' }, { Curso_Nombre: 'Y' }]]],
    ]);
    await promoverCurso(req(), res);
    expect(res.json.mock.calls[0][0].advertencias[0]).toContain('No se heredó el profesor jefe');
    expect(res.json.mock.calls[0][0].aplicadas.Promovido).toBe(1);
  });

  test('Sin situaciones registradas no hay nada que promover (400)', async () => {
    mockConexion([
      [/FROM curso c\s+JOIN nivel_educativo n/, CURSO],
      [/FROM parametro_institucional/, periodos('2027')],
      [/FROM situacion_final sf/, [[]]],
    ]);
    await promoverCurso(req(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Cambio de período', () => {
  test('Iniciar nuevo período exige confirmar el respaldo', async () => {
    jest.clearAllMocks();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await iniciarNuevoPeriodo({ body: {}, user: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('La limpieza borra en orden de llaves foráneas y desactiva a los apoderados nuevos', async () => {
    const conn = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await ejecutarLimpieza(conn, {
      cursoIds: [10], estudianteIds: [20], horarioIds: [30], citacionIds: [40],
      apoderados: { eliminar: [50], desactivar: [60], quitarRol: [70] },
    }, '2028');
    const sqls = conn.query.mock.calls.map((c) => c[0].replace(/\s+/g, ' '));
    const pos = (texto) => sqls.findIndex((s) => s.includes(texto));
    expect(pos('DELETE FROM historial')).toBeLessThan(pos('DELETE FROM citacion'));
    expect(pos('DELETE FROM citacion')).toBeLessThan(pos('DELETE FROM estudiante'));
    expect(pos('DELETE FROM horario_asignatura')).toBeLessThan(pos('DELETE FROM curso'));
    expect(pos('DELETE FROM estudiante')).toBeLessThan(pos('DELETE FROM curso'));
    expect(pos('DELETE FROM conversacion')).toBeLessThan(pos('DELETE FROM usuario'));
    const desactivar = conn.query.mock.calls.find(([s]) => /SET Usuario_Estado_Cuenta = 0/.test(s));
    expect(desactivar[1]).toEqual(['2028', [60]]);
    expect(conn.query.mock.calls.find(([s]) => /SET Es_Apoderado = 0/.test(s))[1]).toEqual([[70]]);
  });
});
