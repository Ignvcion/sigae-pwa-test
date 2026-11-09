// Punto abierto 7: los super administradores se crean por script en el despliegue.
const bcrypt = require('bcrypt');
const { validarDatos, crearSuperAdmin } = require('../scripts/crearSuperAdmin');

const DATOS = {
  rut: '11111111-1', nombre: 'Rosa Muñoz', telefono: '912345678',
  correo: 'ro.munoz@jacquescousteau.edu', contrasena: 'Clave1234',
};

describe('scripts/crearSuperAdmin', () => {
  test('valida RUT, nombre, teléfono, correo institucional y contraseña fuerte', () => {
    expect(validarDatos(DATOS)).toEqual([]);
    expect(validarDatos({ ...DATOS, rut: '11111111-2' })).toHaveLength(1);
    expect(validarDatos({ ...DATOS, correo: 'rosa@gmail.com' })[0]).toContain('institucional');
    expect(validarDatos({ ...DATOS, contrasena: 'clave' })[0]).toContain('8 caracteres');
  });

  test('crea la cuenta como Super Admin con la contraseña hasheada', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 42 }]) };
    expect(await crearSuperAdmin(db, DATOS)).toBe(42);
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain("'Super Admin'");
    expect(params[0]).toBe('11111111-1');
    expect(await bcrypt.compare('Clave1234', params[3])).toBe(true);
  });

  test('no crea la cuenta si el RUT o el correo ya existen (punto abierto 13)', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce([[{ Usuario_Id: 3 }]]) };
    await expect(crearSuperAdmin(db, DATOS)).rejects.toThrow('Ya existe un usuario');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
