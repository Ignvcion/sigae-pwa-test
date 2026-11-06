// El limitador de login cuenta solo los intentos fallidos.
const express = require('express');
const request = require('supertest');
const { loginLimiter } = require('../middleware/rateLimiter');

function app(status) {
  const a = express();
  a.post('/login', loginLimiter, (req, res) => res.status(status()).json({}));
  return a;
}

describe('loginLimiter', () => {
  test('Los inicios de sesión correctos no consumen el cupo', async () => {
    const a = app(() => 200);
    for (let i = 0; i < 8; i += 1) {
      const r = await request(a).post('/login');
      expect(r.status).toBe(200);
    }
  });

  test('Al sexto intento fallido en la ventana responde 429', async () => {
    const a = app(() => 401);
    const codigos = [];
    for (let i = 0; i < 6; i += 1) codigos.push((await request(a).post('/login')).status);
    expect(codigos).toEqual([401, 401, 401, 401, 401, 429]);
  });
});
