// CU105 y RF23: ruta de formación del estudiante (2°, 3° y 4° medio).
const pool = require('../config/db');
const { asignarRutaFormacion } = require('../controllers/profesorJefeController');
const { normalizarRuta, RUTAS_ELECTIVO } = require('../utils/rutaFormacion');

jest.mock('../config/db');

function mockConn(respuestas) {
  const conn = {
    query: jest.fn(async (sql) => {
      for (const [patron, valor] of respuestas) if (patron.test(sql)) return valor;
      return [{ affectedRows: 1 }];
    }),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
  };
  pool.getConnection = jest.fn().mockResolvedValue(conn);
  return conn;
}

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const req = (body) => ({ params: { id: '226' }, body, user: { id: 2, roles: ['Administrador'] } });

describe('CU105: ruta de formación', () => {
  test('normaliza rutas sin tildes; los electivos solo admiten Científica y Humanística', () => {
    expect(normalizarRuta('cientifica')).toBe('Científica');
    expect(normalizarRuta('TÉCNICA')).toBe('Técnica');
    expect(normalizarRuta('Artística')).toBeNull();
    expect(normalizarRuta('Técnica', RUTAS_ELECTIVO)).toBeNull();
  });

  test('Excepción 2: una ruta no permitida se rechaza', async () => {
    const r = res();
    await asignarRutaFormacion(req({ estudianteIds: [1], ruta: 'Deportiva' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  test('Excepción 1: un curso anterior a 2° medio no admite ruta', async () => {
    const conn = mockConn([[/FROM curso c JOIN nivel_educativo n/, [[{ Curso_Id: 225, Curso_Nombre: '1ero Medio A', Permite_Ruta: 0 }]]]]);
    const r = res();
    await asignarRutaFormacion(req({ estudianteIds: [1], ruta: 'Científica' }), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('registra la ruta de los estudiantes del curso y deja el valor anterior en el historial', async () => {
    const conn = mockConn([
      [/FROM curso c JOIN nivel_educativo n/, [[{ Curso_Id: 226, Curso_Nombre: '2do Medio A', Curso_Periodo_Lectivo: '2026', Permite_Ruta: 1 }]]],
      [/FROM estudiante\s+WHERE Estudiante_Id IN/, [[
        { Estudiante_Id: 1, Estudiante_Ruta_Formacion: null },
        { Estudiante_Id: 2, Estudiante_Ruta_Formacion: 'Científica' },
      ]]],
    ]);
    const r = res();
    await asignarRutaFormacion(req({ estudianteIds: [1, 2], ruta: 'cientifica' }), r);
    const updates = conn.query.mock.calls.filter(([s]) => /UPDATE estudiante SET Estudiante_Ruta_Formacion/.test(s));
    expect(updates).toHaveLength(1); // el 2 ya tenía la ruta
    expect(updates[0][1]).toEqual(['Científica', 1]);
    const historial = conn.query.mock.calls.find(([s]) => /INSERT INTO historial/.test(s));
    expect(historial[1].slice(0, 4)).toEqual(['—', 'CU105: ruta de formación (2do Medio A (2026))', 'Estudiante_Ruta_Formacion', 'Científica']);
    expect(conn.commit).toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].cambiados).toBe(1);
  });

  test('rechaza estudiantes que no son del curso', async () => {
    mockConn([
      [/FROM curso c JOIN nivel_educativo n/, [[{ Curso_Id: 226, Curso_Nombre: '2do Medio A', Permite_Ruta: 1 }]]],
      [/FROM estudiante\s+WHERE Estudiante_Id IN/, [[{ Estudiante_Id: 1, Estudiante_Ruta_Formacion: null }]]],
    ]);
    const r = res();
    await asignarRutaFormacion(req({ estudianteIds: [1, 99], ruta: 'Humanística' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});
