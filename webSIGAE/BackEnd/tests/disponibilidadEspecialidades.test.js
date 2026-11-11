// RF04 (especialidades como etiquetas) y CU107 (disponibilidad laboral semanal del docente).
const pool = require('../config/db');
const {
  normalizarEspecialidades,
  especialidadesDelCuerpo,
  guardarEspecialidadesDocente,
  coincideEspecialidad,
  sugerenciaEspecialidad,
} = require('../utils/especialidades');
const {
  normalizarTramos,
  unirTramos,
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

  test('CU56: coincidencia de especialidad sin distinguir tildes ni plural (solo sugerencia)', () => {
    expect(coincideEspecialidad('Matemáticas', 'Matemática')).toBe(true);
    expect(coincideEspecialidad('Historia, Lenguaje', 'Lenguaje y Comunicación')).toBe(true);
    expect(coincideEspecialidad('Ingles', 'Inglés')).toBe(true);
    expect(coincideEspecialidad('Historia', 'Matemática')).toBe(false);
    expect(coincideEspecialidad('', 'Matemática')).toBe(false);
    expect(sugerenciaEspecialidad('Ana', 'Historia', 'Matemática'))
      .toBe('Sugerencia: la especialidad de Ana (Historia) no coincide con Matemática. Se puede asignar igual.');
    expect(sugerenciaEspecialidad('Ana', null, 'Matemática')).toContain('no tiene especialidad registrada');
    expect(sugerenciaEspecialidad('Ana', 'Matemáticas', 'Matemática')).toBeNull();
  });

  test('crear un docente sin especialidades responde 400', async () => {
    const req = {
      body: {
        Usuario_RUT: '11111111-1', Usuario_Telefono: '912345678', Usuario_Nombre_Completo: 'Ana Pérez', Es_Docente: 1, Docente_Correo_Institucional: 'a@colegiojc.cl',
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

describe('CU107: disponibilidad laboral semanal del docente (tramos desde–hasta)', () => {
  beforeEach(() => jest.clearAllMocks());

  // Ana: lunes 08:00–12:00 y 13:00–17:00; martes 08:00–10:00 y 10:00–12:00 (contiguos)
  const filas = [
    { Docente_Usuario_Id: 5, periodo: '2026', dia: 'Lunes', hora_inicio: '08:00:00', hora_fin: '12:00:00' },
    { Docente_Usuario_Id: 5, periodo: '2026', dia: 'Lunes', hora_inicio: '13:00:00', hora_fin: '17:00:00' },
    { Docente_Usuario_Id: 5, periodo: '2026', dia: 'Martes', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
    { Docente_Usuario_Id: 5, periodo: '2026', dia: 'Martes', hora_inicio: '10:00:00', hora_fin: '12:00:00' },
  ];
  const mapaDe = async () => mapaDisponibilidad({ query: jest.fn().mockResolvedValue([filas]) }, [5, 6], ['2026']);

  test('un docente sin tramos registrados no tiene restricción', async () => {
    const mapa = await mapaDe();
    expect(estaDisponible(mapa, { docenteId: 6, periodo: '2026', dia: 'Viernes', horaInicio: '18:00', horaFin: '18:45' })).toBe(true);
    // Otro período sin registro: sin restricción
    expect(estaDisponible(mapa, { docenteId: 5, periodo: '2027', dia: 'Viernes', horaInicio: '09:15', horaFin: '10:00' })).toBe(true);
  });

  test('un bloque de 45 minutos está disponible solo si cae completo dentro de un tramo', async () => {
    const mapa = await mapaDe();
    const lunes = (horaInicio, horaFin) => estaDisponible(mapa, { docenteId: 5, periodo: '2026', dia: 'Lunes', horaInicio, horaFin });
    expect(lunes('09:15:00', '10:00:00')).toBe(true);
    expect(lunes('11:45', '12:30')).toBe(false); // termina después del tramo de la mañana
    expect(lunes('12:15', '13:00')).toBe(false); // en la pausa entre tramos
    expect(lunes('16:15', '17:00')).toBe(true);
    expect(estaDisponible(mapa, { docenteId: 5, periodo: '2026', dia: 'Viernes', horaInicio: '09:15', horaFin: '10:00' })).toBe(false);
  });

  test('los tramos contiguos se unen: un bloque puede cruzar el límite entre ellos', async () => {
    const mapa = await mapaDe();
    expect(estaDisponible(mapa, { docenteId: 5, periodo: '2026', dia: 'Martes', horaInicio: '09:45', horaFin: '10:30' })).toBe(true);
    expect(unirTramos([{ inicio: 600, fin: 660 }, { inicio: 480, fin: 600 }])).toEqual([{ inicio: 480, fin: 660 }]);
  });

  test('validarDisponibilidad explica el bloqueo con los tramos disponibles de ese día', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([filas])
        .mockResolvedValueOnce([[{ Bloque_Horario_Hora_Inicio: '12:15:00', Bloque_Horario_Hora_Fin: '13:00:00' }]]),
    };
    const mensaje = await validarDisponibilidad(db, { docenteId: 5, periodo: '2026', dia: 'Lunes', bloqueId: 4 });
    expect(mensaje).toContain('Lunes 12:15–13:00');
    expect(mensaje).toContain('08:00–12:00 y 13:00–17:00');
  });

  test('validarDisponibilidad no consulta el bloque si el docente no tiene restricción', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([[]]) };
    expect(await validarDisponibilidad(db, { docenteId: 9, periodo: '2026', dia: 'Lunes', bloqueId: 4 })).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('horas adeudadas = carga semanal − horas de los tramos (incluyen recreos y horas sin clases)', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ Docente_Carga_Horaria_Semanal: 32 }]])
        .mockResolvedValueOnce([[{ tramos: 4, horas: '12.0000' }]])
        .mockResolvedValueOnce([[{ horas: '1.5' }]]),
    };
    const r = await resumenSemanal(db, 5, '2026');
    expect(r).toMatchObject({ cargaSemanal: 32, configurada: true, tramos: 4, horasDisponibles: 12, horasAsignadas: 1.5, horasAdeudadas: 20 });
    expect(advertenciaHorasAdeudadas(r)).toContain('debe 20 h');
  });

  test('sin disponibilidad registrada no hay horas adeudadas', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ Docente_Carga_Horaria_Semanal: 32 }]])
        .mockResolvedValueOnce([[{ tramos: 0, horas: 0 }]])
        .mockResolvedValueOnce([[{ horas: 0 }]]),
    };
    const r = await resumenSemanal(db, 5, '2026');
    expect(r.horasAdeudadas).toBe(0);
    expect(advertenciaHorasAdeudadas(r)).toBeNull();
  });

  test('normalizarTramos valida día, formato, orden, superposición y límites', () => {
    expect(normalizarTramos([
      { dia: 'Martes', hora_inicio: '13:00', hora_fin: '17:30' },
      { dia: 'Lunes', hora_inicio: '07:30', hora_fin: '12:00' },
    ])).toEqual({ ok: true, tramos: [{ dia: 'Lunes', inicio: 450, fin: 720 }, { dia: 'Martes', inicio: 780, fin: 1050 }] });
    expect(normalizarTramos([{ dia: 'Sábado', hora_inicio: '08:00', hora_fin: '12:00' }]).ok).toBe(false);
    expect(normalizarTramos([{ dia: 'Lunes', hora_inicio: '8', hora_fin: '12:00' }]).ok).toBe(false);
    expect(normalizarTramos([{ dia: 'Lunes', hora_inicio: '12:00', hora_fin: '08:00' }]).ok).toBe(false);
    expect(normalizarTramos([{ dia: 'Lunes', hora_inicio: '05:00', hora_fin: '08:00' }]).ok).toBe(false);
    expect(normalizarTramos([
      { dia: 'Lunes', hora_inicio: '08:00', hora_fin: '12:00' },
      { dia: 'Lunes', hora_inicio: '11:00', hora_fin: '14:00' },
    ]).mensaje).toContain('se superponen');
    expect(normalizarTramos(undefined).ok).toBe(false);
  });

  test('leerDisponibilidad acepta { periodo, tramos } y una lista vacía quita la restricción', () => {
    expect(leerDisponibilidad({ periodo: '2027', tramos: [] })).toEqual({ ok: true, periodo: '2027', tramos: [] });
    expect(leerDisponibilidad({ tramos: [{ dia: 'Lunes', hora_inicio: '08:00', hora_fin: '09:00' }] }).tramos)
      .toEqual([{ dia: 'Lunes', inicio: 480, fin: 540 }]);
    expect(leerDisponibilidad({}).ok).toBe(false);
  });

  test('editar la disponibilidad de alguien que no es docente responde 400', async () => {
    pool.query = jest.fn().mockResolvedValueOnce([[{ Es_Administrador: 0, Administrador_Tipo: null, Es_Apoderado: 1, Es_Docente: 0 }]]);
    const req = {
      params: { id: '8' },
      body: { Docente_Disponibilidad: { tramos: [] } },
      user: { id: 2, roles: ['Administrador'], administradorTipo: 'Administrador Normal' },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await usuarioController.updateUsuario(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain('Solo un docente');
  });
});
