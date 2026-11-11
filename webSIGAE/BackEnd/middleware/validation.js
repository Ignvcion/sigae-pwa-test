const { body, validationResult } = require('express-validator');

const { DOMINIOS_INSTITUCIONALES, TEXTO_DOMINIOS_INSTITUCIONALES } = require('../config/institucion');

function validarRut(rutCompleto) {
  if (!/^\d{7,8}-[\dkK]$/.test(rutCompleto)) return false;
  const [cuerpo, dvIngresado] = rutCompleto.split('-');
  let suma = 0;
  let multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }
  const dvEsperado = 11 - (suma % 11);
  const dv = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'k' : String(dvEsperado);
  return dv === dvIngresado.toLowerCase();
}

// Correo con formato usuario@dominio y de alguno de los dominios del colegio
// (config/institucion.js). La comparación incluye la @: "x@otro.colegiojc.cl" no pasa.
function validarCorreoInstitucional(correo) {
  const normalizado = String(correo ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)
    && DOMINIOS_INSTITUCIONALES.some((dominio) => normalizado.endsWith(dominio));
}

const COLUMNAS_CORREO_USUARIO = ['Docente_Correo_Institucional', 'Administrador_Correo_Institucional', 'Apoderado_Correo_Natural'];

// Quita los espacios de los extremos de los correos del cuerpo (en el mismo
// objeto), para que se guarde exactamente lo que se validó.
function normalizarCorreosCuerpo(body) {
  if (!body || typeof body !== 'object') return body;
  for (const columna of COLUMNAS_CORREO_USUARIO) {
    if (typeof body[columna] === 'string') body[columna] = body[columna].trim();
  }
  return body;
}

// Los espacios no cuentan como caracteres del teléfono: "+56 9 1234 5678" = "+56912345678"
function quitarEspacios(texto) {
  return String(texto ?? '').replace(/\s+/g, '');
}

// Formato chileno: 9 dígitos, opcionalmente con prefijo internacional +56 (o 56).
// Solo números (se ignoran los espacios): sin guiones ni letras.
function validarTelefonoChileno(telefono) {
  return /^(\+?56)?\d{9}$/.test(quitarEspacios(telefono));
}

// Deja el teléfono siempre como 9 dígitos, sin espacios (quita el prefijo +56/56 si viene)
function normalizarTelefono(telefono) {
  const digitos = quitarEspacios(telefono).replace(/^\+/, '');
  return digitos.length === 11 ? digitos.slice(2) : digitos;
}

// Nombre completo: solo letras (incluye tildes y ñ) y espacios, al menos dos palabras, máx. 100
function validarNombreCompleto(nombre) {
  const limpio = String(nombre).trim();
  return limpio.length <= 100 && /^\p{L}+(\s+\p{L}+)+$/u.test(limpio);
}

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarCorreo(correo) {
  return REGEX_CORREO.test(String(correo).trim());
}

// Contraseña: mínimo 8 caracteres, al menos una mayúscula y un número.
// Devuelve el mensaje de error o null si es válida.
function validarFortalezaContrasena(pwd) {
  if (typeof pwd !== 'string' || pwd.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(pwd)) return 'La contraseña debe contener al menos una mayúscula';
  if (!/[0-9]/.test(pwd)) return 'La contraseña debe contener al menos un número';
  return null;
}

// Dirección particular: calle, número y comuna obligatorios; depto/casa opcional.
// Aplica a todo usuario (Super Admin, Administrador, Docente y Apoderado) y a la
// ficha del estudiante, cada uno con sus propias columnas.
// Con { parcial: true } solo se validan los campos presentes (edición campo a campo).
// Devuelve el mensaje de error o null si es válida.
const CAMPOS_DIRECCION = {
  calle : 'Usuario_Direccion_Calle',
  numero: 'Usuario_Direccion_Numero',
  depto : 'Usuario_Direccion_Depto',
  comuna: 'Usuario_Direccion_Comuna',
};

// Incremento 3 (sección 3.3): dirección separada del estudiante
const CAMPOS_DIRECCION_ESTUDIANTE = {
  calle : 'Estudiante_Calle',
  numero: 'Estudiante_Numero',
  depto : 'Estudiante_Depto',
  comuna: 'Estudiante_Comuna',
};

function validarDireccion({ calle, numero, depto, comuna } = {}, { parcial = false } = {}) {
  const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

  if (!parcial || calle !== undefined) {
    if (vacio(calle)) return 'La calle es obligatoria';
    if (String(calle).trim().length > 100) return 'La calle no puede superar los 100 caracteres';
  }
  if (!parcial || numero !== undefined) {
    if (vacio(numero)) return 'El número de la dirección es obligatorio';
    if (!/^\d{1,6}[A-Za-z]?$/.test(String(numero).trim())) return 'El número de la dirección debe ser numérico (ej: 134 o 134B)';
  }
  if (!vacio(depto) && String(depto).trim().length > 20) {
    return 'El departamento/casa no puede superar los 20 caracteres';
  }
  if (!parcial || comuna !== undefined) {
    if (vacio(comuna)) return 'La comuna es obligatoria';
    if (String(comuna).trim().length > 60 || !/^\p{L}+(\s+\p{L}+)*$/u.test(String(comuna).trim())) {
      return 'La comuna solo puede contener letras y espacios';
    }
  }
  return null;
}

// Extrae la dirección desde un objeto con las columnas de la BD
// (por defecto las del usuario; CAMPOS_DIRECCION_ESTUDIANTE para la ficha estudiantil)
function direccionDesdeColumnas(obj = {}, campos = CAMPOS_DIRECCION) {
  return Object.fromEntries(Object.entries(campos).map(([clave, columna]) => [clave, obj[columna]]));
}

// Convierte { calle, numero, depto, comuna } en pares columna/valor para el UPDATE/INSERT.
// Los valores vacíos se guardan como NULL.
function columnasDireccion(direccion = {}, campos = CAMPOS_DIRECCION) {
  return Object.entries(campos).map(([clave, columna]) => {
    const valor = direccion[clave];
    const limpio = valor === undefined || valor === null ? null : String(valor).trim();
    return [columna, limpio === '' ? null : limpio];
  });
}

const validateLogin = [
  body('rut')
    .notEmpty()
    .withMessage('El RUT es requerido')
    .custom((value) => {
      if (!validarRut(value)) throw new Error('RUT inválido');
      return true;
    }),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 1 })
    .withMessage('La contraseña no puede estar vacía'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

const validateCrearUsuario = [
  body('Usuario_RUT')
    .notEmpty().withMessage('El RUT es requerido')
    .custom((value) => {
      if (!validarRut(value)) throw new Error('RUT inválido (verifique el dígito verificador)');
      return true;
    }),
  body('Usuario_Nombre_Completo')
    .notEmpty().withMessage('El nombre completo es requerido')
    .custom((value) => {
      if (!validarNombreCompleto(value)) {
        throw new Error('El nombre completo debe contener solo letras y espacios (nombre y apellido, máx. 100 caracteres)');
      }
      return true;
    }),
  body('Usuario_Telefono')
    .notEmpty().withMessage('El teléfono es requerido')
    .custom((value) => {
      if (!validarTelefonoChileno(value)) {
        throw new Error('El número telefónico debe tener 9 dígitos, opcionalmente con prefijo +56');
      }
      return true;
    }),
  // Sin Usuario_Contraseña: SIGAE genera una aleatoria y la envía al correo del
  // usuario (utils/contrasenaInicial.js). Si llega una en el cuerpo, se ignora.
  body('Apoderado_Correo_Natural')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value, { req }) => {
      if (req.body.Es_Apoderado && !validarCorreo(value)) {
        throw new Error('El correo del apoderado debe tener el formato usuario@dominio');
      }
      return true;
    }),
  // La dirección es obligatoria para todo usuario, sin importar su rol
  body('Usuario_Direccion_Calle')
    .custom((value, { req }) => {
      const error = validarDireccion(direccionDesdeColumnas(req.body));
      if (error) throw new Error(error);
      return true;
    }),
  body('Docente_Correo_Institucional')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value, { req }) => {
      if (req.body.Es_Docente && value && !validarCorreoInstitucional(value)) {
        throw new Error(`El correo institucional del docente debe pertenecer al dominio ${TEXTO_DOMINIOS_INSTITUCIONALES}`);
      }
      return true;
    }),
  body('Administrador_Correo_Institucional')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value, { req }) => {
      if (req.body.Es_Administrador && value && !validarCorreoInstitucional(value)) {
        throw new Error(`El correo institucional del administrador debe pertenecer al dominio ${TEXTO_DOMINIOS_INSTITUCIONALES}`);
      }
      return true;
    }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // `mensaje` con el primer error para que el frontend lo muestre en lenguaje natural
      return res.status(400).json({ mensaje: errors.array()[0].msg, errors: errors.array() });
    }
    next();
  }
];

module.exports = {
  validateLogin,
  validateCrearUsuario,
  validarRut,
  validarCorreoInstitucional,
  TEXTO_DOMINIOS_INSTITUCIONALES,
  normalizarCorreosCuerpo,
  validarTelefonoChileno,
  normalizarTelefono,
  validarNombreCompleto,
  validarCorreo,
  validarFortalezaContrasena,
  validarDireccion,
  direccionDesdeColumnas,
  columnasDireccion,
  CAMPOS_DIRECCION,
  CAMPOS_DIRECCION_ESTUDIANTE,
};
