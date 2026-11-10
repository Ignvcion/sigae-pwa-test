// Lo que ocupa al docente (clases, electivos y bloques P.I.E.) para la atención de
// apoderados y las citaciones (utils/disponibilidadDocente.js).
const {
  ocupacionesDelDocente, buscarChoquesConClases, buscarClaseEnTramo, describirClase,
} = require('../utils/disponibilidadDocente');

const FILA_PIE = { id: null, tipo: 'pie', dia: 'Lunes', bloqueId: 11, curso: null, asignatura: 'Horas P.I.E.', horaInicio: '09:15:00', horaFin: '10:00:00' };
const FILA_ELECTIVO = { id: 4, tipo: 'electivo', dia: 'Lunes', bloqueId: 12, curso: '3° y 4° medio (electivo)', asignatura: 'Química · Científico', horaInicio: '10:15:00', horaFin: '11:00:00' };
const dbCon = (filas) => ({ query: jest.fn().mockResolvedValue([filas]) });

describe('ocupacionesDelDocente', () => {
  test('consulta clases, electivos y P.I.E. del período vigente, con los parámetros repetidos', async () => {
    const db = dbCon([]);
    await buscarChoquesConClases(db, { docenteId: 3, dia: 'Lunes', inicio: 555, fin: 600 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('FROM horario_asignatura');
    expect(sql).toContain('FROM clase_electivo');
    expect(sql).toContain('FROM bloque_pie_docente');
    expect(params).toEqual(Array(3).fill([3, 'Lunes', '10:00', '09:15']).flat());
  });

  test('sin filtros no agrega condiciones de día ni de hora', async () => {
    const db = dbCon([]);
    await ocupacionesDelDocente(db, 3);
    expect(db.query.mock.calls[0][1]).toEqual([3, 3, 3]);
  });

  test('normaliza las horas y conserva el tipo', async () => {
    const r = await ocupacionesDelDocente(dbCon([FILA_PIE, FILA_ELECTIVO]), 3);
    expect(r.map((o) => [o.tipo, o.horaInicio, o.horaFin])).toEqual([
      ['pie', '09:15', '10:00'], ['electivo', '10:15', '11:00'],
    ]);
  });

  test('una citación sobre un bloque P.I.E. se rechaza con el motivo', async () => {
    const choque = await buscarClaseEnTramo(dbCon([FILA_PIE]), { docenteId: 3, fecha: '2026-11-16', tramo: '09:30 - 10:00' });
    expect(choque.tipo).toBe('pie');
    expect(describirClase(choque)).toBe('Horas P.I.E. (09:15–10:00)');
  });

  test('sin docente no consulta la base', async () => {
    const db = dbCon([]);
    expect(await ocupacionesDelDocente(db, null)).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});
