// RF04 (especialidades como etiquetas) y CU107 (disponibilidad laboral semanal del docente).
const pool = require('../config/db');
const {
  normalizarEspecialidades,
  especialidadesDelCuerpo,
  guardarEspecialidadesDocente,
} = require('../utils/especialidades');
const {
  mapaDisponibilidad,
  estaDisponible,
  validarDisponibilidad,
  resumenSemanal,
  advertenciaHorasAdeudadas,
} = require('../utils/disponibilidadLaboral');
const { leerDisponibilidad } = require('../controllers/disponibilidadLaboralController');
const usuarioController = require('../controllers/usuarioController');

jest.mock('../config/db');

describe('RF04: especialidades del docente como etiquetas', () => {
  test('acepta un arreglo, limpia espacios y quita duplicados sin distinguir mayúsculas ni tildes', () => {
    expect(normalizarEspecialidades(['  Matemáticas ', 'matematicas', 'Física'])).toEqual({
      ok: true, nombres: ['Matemáticas', 'Física'],
    });
  });

  test('acepta el texto separado por comas de versiones anteriores', () => {
    expect(normalizarEspecialidades('Historia, Geografía')).toEqual({ ok: true, nombres: ['Historia', 'Geografía'] });
  });

  test('exige al menos una etiqueta, máximo 6 y un largo de 2 a 40 caracteres', () => {
    expect(normalizarEspecialidades([]).ok).toBe(false);
    expect(normalizarEspecialidades(['A']).ok).toBe(false);
    expect(normalizarEspecialidades(['x'.repeat(41)]).ok).toBe(false);
    expect(normalizarEspecialidades(['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete']).mensaje)
      .toContain('máximo 6');
    expect(normalizarEspecialidades(['<script>']).ok).toBe(false);
  });

  test('lee Docente_Especialidades y, si no viene, Docente_Especialidad', () => {
    expect(especialidadesDelCuerpo({ Docente_Especialidades: ['A'], Docente_Especialidad: 'B' })).toEqual(['A']);
    expect(especialidadesDelCuerpo({ Docente_Especialidad: 'B' })).toBe('B');
    expect(especialidadesDelCuerpo({})).toBeUndefined();
  });

  test('reutiliza la etiqueta existente del catálogo y guarda el resumen en el docente', async () => {
    const conn = {
      query: jest.fn(async (sql, params) => {
        if (/SELECT Especialidad_Id/.test(sql)) {
          // "matematicas" coincide con "Matemáticas" por la collation de la base
          return params[0] === 'matematicas'
            ? [[{ Especialidad_Id: 1, Especialidad_Nombre: 'Matemáticas' }]]
            : [[{ Especialidad_Id: 9, Especialidad_Nombre: params[0] }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };

    const resumen = await guardarEspecialidadesDocente(conn, 7, ['matematicas', 'Química']);

    expect(resumen).toBe('Matemáticas, Química');
    const sqls = conn.query.mock.calls.map((c) => c[0]);
    expect(sqls.filter((s) => s.includes('INSERT IGNORE INTO especialidad'))).toHaveLength(2);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO docente_especialidad'), [[[7, 1], [7, 9]]]
    );
    expect(conn.query).toHaveBeenCalledWith(
      'UPDATE usuario SET Docente_Especialidad = ? WHERE Usuario_Id = ?', ['Matemáticas, Química', 7]
    );
    expect(sqls.some((s) => s.includes('DELETE FROM especialidad'))).toBe(true);
  });

  test('crear un docente sin especialidades responde 400', async () => {
    const req = {
      body: {
        Usuario_RUT: '11111111-1', Usuario_Telefono: '912345678', Usuario_Nombre_Completo: 'Ana Pérez',
        Usuario_Contraseña: 'Clave1234', Es_Docente: 1, Docente_Correo_Institucional: 'a@jacquescousteau.edu',
        Docente_Especialidades: [],
      },
      user: { id: 2 },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await usuarioController.createUsuario(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain('al menos una especialidad');
  });
});

describe('CU107: disponibilidad laboral semanal del docente', () => {
  beforeEach(() => jest.clearAllMocks());

  const filas = [
    { Docente_Usuario_Id: 5, periodo: '2026', dia: 'Lunes', Bloque_Horario_Id: 1 },
    { Docente_Usuario_Id: 5, periodo: '2026', dia: 'Martes', Bloque_Horario_Id: 2 },
  ];

  test('un docente sin disponibilidad registrada no tiene restricción', async () => {
    const db = { query: jest.fn().mockResolvedValue([filas]) };
    const mapa = await mapaDisponibilidad(db, [5, 6], ['2026']);
    expect(estaDisponible(mapa, { docenteId: 6, periodo: '2026', dia: 'Viernes', bloqueId: 3 })).toBe(true);
  });

  test('con disponibilidad registrada solo puede asignarse en sus bloques y período', async () => {
    const db = { query: jest.fn().mockResolvedValue([filas]) };
    const mapa = await mapaDisponibilidad(db, [5], ['2026']);
    expect(estaDisponible(mapa, { docenteId: 5, periodo: '2026', dia: 'Lunes', bloqueId: 1 })).toBe(true);
    expect(estaDisponible(mapa, { docenteId: 5, periodo: '2026', dia: 'Lunes', bloqueId: 2 })).toBe(false);
    // Otro período sin registro: sin restricción
    expect(estaDisponible(mapa, { docenteId: 5, periodo: '2027', dia: 'Lunes', bloqueId: 2 })).toBe(true);
  });

  test('validarDisponibilidad explica el bloqueo con día, horario y período', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([filas])
        .mockResolvedValueOnce([[{ Bloque_Horario_Hora_Inicio: '14:00:00', Bloque_Horario_Hora_Fin: '14:45:00' }]]),
    };
    const mensaje = await validarDisponibilidad(db, { docenteId: 5, periodo: '2026', dia: 'Viernes', bloqueId: 4 });
    expect(mensaje).toContain('Viernes 14:00–14:45');
    expect(mensaje).toContain('2026');
  });

  test('horas adeudadas = carga semanal − horas disponibles; solo advierte', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ Docente_Carga_Horaria_Maxima: 32 }]])
        .mockResolvedValueOnce([[{ bloques: 12, horas: '9.0000' }]])
        .mockResolvedValueOnce([[{ horas: '1.5' }]]),
    };
    const r = await resumenSemanal(db, 5, '2026');
    expect(r).toMatchObject({ cargaSemanal: 32, configurada: true, horasDisponibles: 9, horasAsignadas: 1.5, horasAdeudadas: 23 });
    expect(advertenciaHorasAdeudadas(r)).toContain('debe 23 h');
  });

  test('sin disponibilidad registrada no hay horas adeudadas', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ Docente_Carga_Horaria_Maxima: 32 }]])
        .mockResolvedValueOnce([[{ bloques: 0, horas: 0 }]])
        .mockResolvedValueOnce([[{ horas: 0 }]]),
    };
    const r = await resumenSemanal(db, 5, '2026');
    expect(r.horasAdeudadas).toBe(0);
    expect(advertenciaHorasAdeudadas(r)).toBeNull();
  });

  test('leerDisponibilidad valida días hábiles y bloques, y quita duplicados', () => {
    expect(leerDisponibilidad({ bloques: [{ dia: 'Lunes', Bloque_Horario_Id: 1 }, { dia: 'Lunes', Bloque_Horario_Id: 1 }] }))
      .toEqual({ ok: true, periodo: undefined, bloques: [{ dia: 'Lunes', bloqueId: 1 }] });
    expect(leerDisponibilidad({ bloques: [{ dia: 'Sábado', Bloque_Horario_Id: 1 }] }).ok).toBe(false);
    expect(leerDisponibilidad({ bloques: [{ dia: 'Lunes', Bloque_Horario_Id: 'x' }] }).ok).toBe(false);
    expect(leerDisponibilidad({}).ok).toBe(false);
    expect(leerDisponibilidad({ periodo: '2027', bloques: [] })).toEqual({ ok: true, periodo: '2027', bloques: [] });
  });

  test('editar la disponibilidad de alguien que no es docente responde 400', async () => {
    pool.query = jest.fn().mockResolvedValueOnce([[{ Es_Administrador: 0, Administrador_Tipo: null, Es_Apoderado: 1, Es_Docente: 0 }]]);
    const req = {
      params: { id: '8' },
      body: { Docente_Disponibilidad: { bloques: [] } },
      user: { id: 2, roles: ['Administrador'], administradorTipo: 'Administrador Normal' },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await usuarioController.updateUsuario(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain('Solo un docente');
  });
});
