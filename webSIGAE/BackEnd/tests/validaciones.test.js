const {
  validateCrearUsuario,
  validarTelefonoChileno,
  normalizarTelefono,
  validarNombreCompleto,
  validarFortalezaContrasena,
  validarDireccion,
  validarCorreoInstitucional,
} = require('../middleware/validation');

// Ejecuta la cadena de middlewares de express-validator como lo haría Express
async function ejecutarCadena(cadena, body) {
  const req = { body };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  let llegoAlFinal = false;
  for (const middleware of cadena) {
    let siguio = false;
    await middleware(req, res, () => { siguio = true; });
    if (!siguio) return { res, llegoAlFinal };
  }
  llegoAlFinal = true;
  return { res, llegoAlFinal };
}

describe('Glosario 6.1.2 - Validaciones de datos de entrada', () => {
  describe('Correo institucional (docentes y administradores)', () => {
    test.each([
      'ma.morales@colegiojc.cl',
      'ma.morales@colegiojacquescousteau.cl',
      ' Ma.Morales@ColegioJC.cl ',
    ])('acepta %p', (correo) => {
      expect(validarCorreoInstitucional(correo)).toBe(true);
    });

    test.each([
      'ma.morales@jacquescousteau.edu', // dominio anterior
      'ma.morales@gmail.com',
      'ma.morales@otro.colegiojc.cl', // subdominio
      'ma.moralescolegiojc.cl',
      '@colegiojc.cl',
      'ma morales@colegiojc.cl',
      '',
    ])('rechaza %p', (correo) => {
      expect(validarCorreoInstitucional(correo)).toBe(false);
    });
  });

  describe('Número telefónico', () => {
    test.each(['912345678', '+56912345678', '56912345678', ' 912345678 '])('acepta %p', (tel) => {
      expect(validarTelefonoChileno(tel)).toBe(true);
    });

    test.each(['12345', '9123456789', '+56 9 1234 5678', '9-1234-5678', '91234567a', '+1912345678', ''])(
      'rechaza %p',
      (tel) => {
        expect(validarTelefonoChileno(tel)).toBe(false);
      }
    );

    test('normaliza siempre a 9 dígitos', () => {
      expect(normalizarTelefono('+56912345678')).toBe('912345678');
      expect(normalizarTelefono('56912345678')).toBe('912345678');
      expect(normalizarTelefono('912345678')).toBe('912345678');
    });
  });

  describe('Nombre completo', () => {
    test.each(['Juan Pérez', 'María José Ñúñez Díaz', '  Ana   Torres  '])('acepta %p', (nombre) => {
      expect(validarNombreCompleto(nombre)).toBe(true);
    });

    test.each(['Juan', 'Juan P3rez', 'Juan Pérez!', 'Juan_Pérez', `Juan ${'a'.repeat(100)}`])('rechaza %p', (nombre) => {
      expect(validarNombreCompleto(nombre)).toBe(false);
    });
  });

  describe('Contraseña', () => {
    test('acepta una contraseña con 8+ caracteres, mayúscula y número', () => {
      expect(validarFortalezaContrasena('Segura123')).toBeNull();
    });

    test.each([
      ['Corta1', 'La contraseña debe tener al menos 8 caracteres'],
      ['sinmayuscula1', 'La contraseña debe contener al menos una mayúscula'],
      ['SinNumeros', 'La contraseña debe contener al menos un número'],
    ])('rechaza %p', (pwd, mensaje) => {
      expect(validarFortalezaContrasena(pwd)).toBe(mensaje);
    });
  });

  describe('Dirección particular', () => {
    const valida = { calle: 'Avenida Concha y Toro', numero: '134', comuna: 'Puente Alto' };

    test('acepta calle, número y comuna, con depto opcional', () => {
      expect(validarDireccion(valida)).toBeNull();
      expect(validarDireccion({ ...valida, depto: '45B' })).toBeNull();
      expect(validarDireccion({ ...valida, numero: '134B' })).toBeNull();
    });

    test.each([
      [{ ...valida, calle: '' }, 'La calle es obligatoria'],
      [{ ...valida, numero: undefined }, 'El número de la dirección es obligatorio'],
      [{ ...valida, numero: 'S/N' }, 'El número de la dirección debe ser numérico (ej: 134 o 134B)'],
      [{ ...valida, comuna: '  ' }, 'La comuna es obligatoria'],
      [{ ...valida, comuna: 'Comuna 7' }, 'La comuna solo puede contener letras y espacios'],
      [{ ...valida, depto: 'x'.repeat(21) }, 'El departamento/casa no puede superar los 20 caracteres'],
    ])('rechaza %p', (direccion, mensaje) => {
      expect(validarDireccion(direccion)).toBe(mensaje);
    });

    test('modo parcial solo valida los campos presentes', () => {
      expect(validarDireccion({ comuna: 'Maipú' }, { parcial: true })).toBeNull();
      expect(validarDireccion({ numero: 'abc' }, { parcial: true })).toBe(
        'El número de la dirección debe ser numérico (ej: 134 o 134B)'
      );
    });
  });
});

describe('validateCrearUsuario', () => {
  const docenteValido = {
    Usuario_RUT: '3483606-k',
    Usuario_Nombre_Completo: 'María Morales',
    Usuario_Telefono: '+56946789765',
    Usuario_Contraseña: 'Segura123',
    Es_Docente: 1,
    Docente_Correo_Institucional: 'ma.morales@colegiojc.cl',
    Usuario_Direccion_Calle: 'Los Aromos',
    Usuario_Direccion_Numero: '45',
    Usuario_Direccion_Comuna: 'Ñuñoa',
  };

  const apoderadoValido = {
    Usuario_RUT: '5738925-7',
    Usuario_Nombre_Completo: 'Pedro Fernandez',
    Usuario_Telefono: '944706559',
    Usuario_Contraseña: 'Segura123',
    Es_Apoderado: 1,
    Apoderado_Correo_Natural: 'pedro@gmail.com',
    Usuario_Direccion_Calle: 'Avenida Concha y Toro',
    Usuario_Direccion_Numero: '134',
    Usuario_Direccion_Comuna: 'Puente Alto',
  };

  test('deja pasar un docente válido (teléfono con +56)', async () => {
    const { llegoAlFinal, res } = await ejecutarCadena(validateCrearUsuario, docenteValido);
    expect(res.status).not.toHaveBeenCalled();
    expect(llegoAlFinal).toBe(true);
  });

  test('deja pasar un apoderado válido con dirección estructurada', async () => {
    const { llegoAlFinal } = await ejecutarCadena(validateCrearUsuario, apoderadoValido);
    expect(llegoAlFinal).toBe(true);
  });

  test.each([
    [{ Usuario_Contraseña: '1234' }, 'La contraseña debe tener al menos 8 caracteres'],
    [{ Usuario_Telefono: '12345' }, 'El número telefónico debe tener 9 dígitos, opcionalmente con prefijo +56'],
    [{ Usuario_Nombre_Completo: 'María M0rales' }, 'El nombre completo debe contener solo letras y espacios (nombre y apellido, máx. 100 caracteres)'],
  ])('rechaza un docente con %p', async (cambio, mensaje) => {
    const { res, llegoAlFinal } = await ejecutarCadena(validateCrearUsuario, { ...docenteValido, ...cambio });
    expect(llegoAlFinal).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje }));
  });

  test.each([
    [{ Apoderado_Correo_Natural: 'pedro-sin-arroba' }, 'El correo del apoderado debe tener el formato usuario@dominio'],
    [{ Usuario_Direccion_Comuna: '' }, 'La comuna es obligatoria'],
    [{ Usuario_Direccion_Numero: undefined }, 'El número de la dirección es obligatorio'],
  ])('rechaza un apoderado con %p', async (cambio, mensaje) => {
    const { res, llegoAlFinal } = await ejecutarCadena(validateCrearUsuario, { ...apoderadoValido, ...cambio });
    expect(llegoAlFinal).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje }));
  });

  test.each([
    [{ Usuario_Direccion_Calle: undefined }, 'La calle es obligatoria'],
    [{ Usuario_Direccion_Comuna: 'Ñuñoa 2' }, 'La comuna solo puede contener letras y espacios'],
  ])('exige la dirección también a un docente: %p', async (cambio, mensaje) => {
    const { res, llegoAlFinal } = await ejecutarCadena(validateCrearUsuario, { ...docenteValido, ...cambio });
    expect(llegoAlFinal).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensaje }));
  });

  test('exige la dirección a un administrador', async () => {
    const admin = {
      Usuario_RUT: '9343727-6',
      Usuario_Nombre_Completo: 'Carlos Gonzales',
      Usuario_Telefono: '979746782',
      Usuario_Contraseña: 'Segura123',
      Es_Administrador: 1,
      Administrador_Correo_Institucional: 'ca.gonzales@colegiojc.cl',
    };
    const sinDireccion = await ejecutarCadena(validateCrearUsuario, admin);
    expect(sinDireccion.llegoAlFinal).toBe(false);
    const conDireccion = await ejecutarCadena(validateCrearUsuario, {
      ...admin,
      Usuario_Direccion_Calle: 'Av. Matta',
      Usuario_Direccion_Numero: '1020',
      Usuario_Direccion_Comuna: 'Santiago',
    });
    expect(conDireccion.llegoAlFinal).toBe(true);
  });
});
