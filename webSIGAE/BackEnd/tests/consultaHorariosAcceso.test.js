// La consulta y filtrado de horarios (CU68) expone el horario de toda la
// institución: la ruta solo acepta administradores y la etiqueta UTP.
const express = require('express');
const request = require('supertest');

jest.mock('../config/db');
// La exportación (puppeteer) no participa en esta prueba
jest.mock('../controllers/exportController', () => ({
  exportarMaestro: jest.fn(),
  exportarPorDocente: jest.fn(),
  exportarPorCurso: jest.fn(),
}));
jest.mock('../middleware/authMiddleware', () => ({
  verifyToken: (req, res, next) => {
    req.user = {
      id: 1,
      roles: (req.headers['x-roles'] || '').split(',').filter(Boolean),
      utp: req.headers['x-utp'] === '1',
    };
    next();
  },
  verifyAdmin: jest.requireActual('../middleware/authMiddleware').verifyAdmin,
  verifyGestionAcademica: jest.requireActual('../middleware/authMiddleware').verifyGestionAcademica,
}));

const pool = require('../config/db');
const horarioRoutes = require('../routes/horarioRoutes');

const app = express();
app.use(express.json());
app.use('/api/horarios', horarioRoutes);

describe('Acceso a la consulta de horarios (GET /api/horarios/filtrar)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.execute = jest.fn().mockResolvedValue([[]]);
  });

  test.each([['Docente'], ['Apoderado']])('Un %s recibe 403 sin consultar la base', async (rol) => {
    const res = await request(app).get('/api/horarios/filtrar').set('x-roles', rol);

    expect(res.status).toBe(403);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('Un administrador puede filtrar', async () => {
    const res = await request(app).get('/api/horarios/filtrar').set('x-roles', 'Administrador');

    expect(res.status).toBe(200);
    expect(pool.execute).toHaveBeenCalled();
  });

  // Etiqueta UTP: un administrador con UTP entra con el rol 'UTP'; un docente con UTP, con 'Docente'
  test.each([['UTP'], ['Docente']])('Un usuario con etiqueta UTP (rol %s) puede filtrar', async (rol) => {
    const res = await request(app).get('/api/horarios/filtrar').set('x-roles', rol).set('x-utp', '1');

    expect(res.status).toBe(200);
    expect(pool.execute).toHaveBeenCalled();
  });
});
