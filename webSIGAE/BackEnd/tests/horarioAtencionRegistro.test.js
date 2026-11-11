// RF55: el administrador puede dejar el horario de atención de apoderados al registrar
// a un docente (createUsuario, Docente_Horario_Atencion). Mismas reglas que la edición
// del propio docente: 08:00–18:00, sin superponerse, con espacio para una citación y
// dentro de la disponibilidad laboral del mismo registro. Se sugieren tramos de 1 y 2 horas.
const usuarioController = require('../controllers/usuarioController');
const db = require('../config/db');
const mailer = require('../utils/mailer');
const {
  DURACIONES_SUGERIDAS,
  opcionesAtencion,
  normalizarHorarioAtencion,
  tramosFueraDeDisponibilidad,
} = require('../utils/horarioAtencion');

jest.mock('../config/db');
jest.mock('../utils/mailer');

const nuevoRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const SUPER_ADMIN = { id: 1, roles: ['Administrador'], administradorTipo: 'Super Admin' };

let consultas;
function simularBase() {
  consultas = [];
  const responder = async (sql, valores) => {
    consultas.push({ sql, valores });
    if (/^\s*INSERT INTO usuario/.test(sql)) return [{ insertId: 77, affectedRows: 1 }];
    if (/FROM especialidad WHERE Especialidad_Nombre = \?/.test(sql)) return [[{ Especialidad_Id: 1, Especialidad_Nombre: valores[0] }]];
    if (/SELECT \* FROM usuario WHERE Usuario_Id = \?/.test(sql)) return [[{ Usuario_Id: 77 }]];
    return [[]];
  };
  db.query.mockImplementation(responder);
  const conn = {
    query: jest.fn(responder),
    beginTransaction: jest.fn(async () => {}), commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}), release: jest.fn(),
  };
  db.getConnection.mockResolvedValue(conn);
  return conn;
}

const docente = (extra = {}) => ({
  body: {
    Usuario_RUT: '11111111-1', Usuario_Telefono: '912345678', Usuario_Nombre_Completo: 'Ana Pérez',
    Es_Docente: 1, Docente_Correo_Institucional: 'an.perez@colegiojc.cl', Docente_Carga_Horaria_Semanal: 30,
    Docente_Especialidades: ['Matemáticas'],
    Usuario_Direccion_Calle: 'Los Aromos', Usuario_Direccion_Numero: '45', Usuario_Direccion_Comuna: 'Ñuñoa',
    ...extra,
  },
  user: SUPER_ADMIN,
});

const insercionesAtencion = () => consultas.filter((c) => /INSERT INTO horario_atencion/.test(c.sql));

beforeEach(() => {
  jest.resetAllMocks();
  mailer.correoConfigurado.mockReturnValue(true);
  mailer.enviarContrasenaInicial.mockResolvedValue();
});

describe('Reglas compartidas del horario de atención', () => {
  test('sugiere tramos de 1 hora y 2 horas', () => {
    expect(DURACIONES_SUGERIDAS).toEqual([60, 120]);
    expect(opcionesAtencion()).toEqual({
      limites: { minimo: '08:00', maximo: '18:00' },
      duracionCitacion: 30,
      duracionesSugeridas: [60, 120],
    });
  });

  test.each([
    [[{ dia: 'Lunes', hora_inicio: '07:00', hora_fin: '08:00' }], 'entre las 08:00 y las 18:00'],
    [[{ dia: 'Lunes', hora_inicio: '10:00', hora_fin: '11:00' }, { dia: 'Lunes', hora_inicio: '10:30', hora_fin: '12:30' }], 'se superponen'],
    [[{ dia: 'Lunes', hora_inicio: '10:10', hora_fin: '10:50' }], 'ninguna citación de 30 minutos'],
    [[{ dia: 'Sábado', hora_inicio: '10:00', hora_fin: '11:00' }], 'día hábil'],
  ])('rechaza %j', (tramos, mensaje) => {
    const r = normalizarHorarioAtencion({ tramos });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain(mensaje);
  });

  test('detecta tramos fuera de la disponibilidad laboral', () => {
    const disponibilidad = [{ dia: 'Lunes', inicio: 8 * 60, fin: 13 * 60 }];
    const tramos = [{ dia: 'Lunes', inicio: 12 * 60, fin: 14 * 60 }, { dia: 'Lunes', inicio: 9 * 60, fin: 10 * 60 }];
    const fuera = tramosFueraDeDisponibilidad(tramos, disponibilidad);
    expect(fuera).toHaveLength(1);
    expect(fuera[0]).toMatchObject({ tramo: { inicio: 12 * 60 }, libres: '08:00–13:00' });
    expect(tramosFueraDeDisponibilidad(tramos, [])).toEqual([]);
  });
});

describe('createUsuario: horario de atención al registrar un docente', () => {
  test('guarda los tramos de 1 hora y 2 horas en la misma transacción', async () => {
    const conn = simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario(docente({
      Docente_Horario_Atencion: {
        tramos: [
          { dia: 'Martes', hora_inicio: '15:00', hora_fin: '17:00' },
          { dia: 'Lunes', hora_inicio: '14:00', hora_fin: '15:00' },
        ],
      },
    }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const [insercion] = insercionesAtencion();
    expect(insercion.valores[0]).toEqual([
      ['Lunes', '14:00', '15:00', 77],
      ['Martes', '15:00', '17:00', 77],
    ]);
    expect(conn.query.mock.calls.some(([sql]) => /INSERT INTO horario_atencion/.test(sql))).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('sin horario de atención (o vacío) no escribe tramos', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario(docente({ Docente_Horario_Atencion: { tramos: [] } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(insercionesAtencion()).toHaveLength(0);
  });

  test('rechaza un tramo inválido sin crear al docente', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario(docente({
      Docente_Horario_Atencion: { tramos: [{ dia: 'Lunes', hora_inicio: '17:00', hora_fin: '19:00' }] },
    }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toContain('entre las 08:00 y las 18:00');
    expect(consultas.some((c) => /INSERT INTO usuario/.test(c.sql))).toBe(false);
  });

  test('rechaza un tramo fuera de la disponibilidad laboral del mismo registro', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario(docente({
      Docente_Disponibilidad: { tramos: [{ dia: 'Lunes', hora_inicio: '08:00', hora_fin: '13:00' }] },
      Docente_Horario_Atencion: { tramos: [{ dia: 'Lunes', hora_inicio: '14:00', hora_fin: '15:00' }] },
    }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].mensaje).toBe(
      'El tramo de atención Lunes 14:00–15:00 queda fuera de la disponibilidad laboral del docente (ese día está disponible 08:00–13:00)'
    );
    expect(consultas.some((c) => /INSERT INTO usuario/.test(c.sql))).toBe(false);
  });

  test('se ignora en un registro que no es de docente', async () => {
    simularBase();
    const res = nuevoRes();
    await usuarioController.createUsuario({
      body: {
        Usuario_RUT: '5738925-7', Usuario_Telefono: '912345678', Usuario_Nombre_Completo: 'Pedro Fernández',
        Es_Apoderado: 1, Apoderado_Correo_Natural: 'pedro@gmail.com',
        Docente_Horario_Atencion: { tramos: [{ dia: 'Lunes', hora_inicio: '14:00', hora_fin: '15:00' }] },
      },
      user: SUPER_ADMIN,
    }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(insercionesAtencion()).toHaveLength(0);
  });
});
