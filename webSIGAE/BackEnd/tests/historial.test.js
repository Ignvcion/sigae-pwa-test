// Convención del historial: personas como "RUT sin dígito verificador (Nombre)".
const { rutSinDV, refPersona, refPersonas, buscarPersonas, SIN_VALOR } = require('../utils/historial');

describe('utils/historial: referencias a personas', () => {
  test('rutSinDV quita puntos y el dígito verificador (también K)', () => {
    expect(rutSinDV('12.345.678-5')).toBe('12345678');
    expect(rutSinDV('5158743-k')).toBe('5158743');
    expect(rutSinDV('9999999-K')).toBe('9999999');
    expect(rutSinDV(null)).toBeNull();
  });

  test('refPersona acepta filas de usuario y de estudiante', () => {
    expect(refPersona({ Usuario_RUT: '3483606-k', Usuario_Nombre_Completo: 'María Morales' })).toBe('3483606 (María Morales)');
    expect(refPersona({ Estudiante_RUT: '22.333.444-1', Estudiante_Nombre_Completo: 'Diego Perez' })).toBe('22333444 (Diego Perez)');
    expect(refPersona({ Usuario_Nombre_Completo: 'Sin RUT' })).toBe('Sin RUT');
    expect(refPersona(null)).toBe(SIN_VALOR);
  });

  test('refPersonas separa con "; " y sin personas devuelve "—"', () => {
    expect(refPersonas([
      { Usuario_RUT: '1-9', Usuario_Nombre_Completo: 'Ana' },
      { Usuario_RUT: '2-7', Usuario_Nombre_Completo: 'Luis' },
    ])).toBe('1 (Ana); 2 (Luis)');
    expect(refPersonas([])).toBe('—');
  });

  test('buscarPersonas hace una sola consulta e ignora ids nulos', async () => {
    const conn = { query: jest.fn().mockResolvedValue([[{ Usuario_Id: 4, Usuario_RUT: '4-4', Usuario_Nombre_Completo: 'Pedro' }]]) };
    const mapa = await buscarPersonas(conn, [4, null, 4, undefined]);
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query.mock.calls[0][1]).toEqual([[4]]);
    expect(refPersona(mapa.get(4))).toBe('4 (Pedro)');
    expect((await buscarPersonas(conn, [null])).size).toBe(0);
    expect(conn.query).toHaveBeenCalledTimes(1);
  });
});
