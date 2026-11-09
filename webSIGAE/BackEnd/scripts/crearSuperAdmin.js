#!/usr/bin/env node
// scripts/crearSuperAdmin.js
// Crea una cuenta de Super Administrador (punto abierto 7 del documento de ajustes del
// Incremento 4: ningún RF ni CU crea super administradores; se crean por script en el
// despliegue). Sirve para el primer administrador real y para los dos o tres adicionales.
//
// Uso (desde webSIGAE/BackEnd, con el .env de la base a usar):
//   node scripts/crearSuperAdmin.js --rut 12345678-9 --nombre "Ana Pérez" \
//        --telefono 912345678 --correo an.perez@jacquescousteau.edu
// La contraseña se pide por consola sin mostrarla, o se toma de SUPERADMIN_PASSWORD.
//
// Reglas: RUT y correo institucional válidos, contraseña fuerte (8+ caracteres, una
// mayúscula y un número). Un administrador no puede ser además docente ni apoderado
// (punto abierto 13), así que el RUT no debe existir. La contraseña se guarda con bcrypt.
const bcrypt = require('bcrypt');
const readline = require('readline');
const {
  validarRut,
  validarNombreCompleto,
  validarTelefonoChileno,
  normalizarTelefono,
  validarCorreoInstitucional,
  validarFortalezaContrasena,
} = require('../middleware/validation');

function leerArgumentos(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

/** Pide la contraseña por consola sin mostrarla. */
function pedirContrasena(pregunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = (texto) => { if (!rl.stdoutMuted || texto.includes(pregunta)) rl.output.write(texto); };
    rl.question(pregunta, (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(respuesta);
    });
  });
}

/** Valida los datos; devuelve la lista de errores (vacía si están bien). */
function validarDatos({ rut, nombre, telefono, correo, contrasena }) {
  const errores = [];
  if (!rut || !validarRut(rut)) errores.push('RUT inválido (formato 12345678-9, con dígito verificador correcto)');
  if (!nombre || !validarNombreCompleto(nombre)) errores.push('Nombre completo inválido (nombre y apellido, solo letras)');
  if (!telefono || !validarTelefonoChileno(telefono)) errores.push('Teléfono inválido (9 dígitos, opcionalmente con +56)');
  if (!correo || !validarCorreoInstitucional(correo)) errores.push('El correo debe ser institucional');
  const errorContrasena = validarFortalezaContrasena(contrasena);
  if (errorContrasena) errores.push(errorContrasena);
  return errores;
}

/** Inserta la cuenta. Lanza un Error con mensaje si el RUT o el correo ya existen. */
async function crearSuperAdmin(db, { rut, nombre, telefono, correo, contrasena }) {
  const [existentes] = await db.query(
    'SELECT Usuario_Id FROM usuario WHERE Usuario_RUT = ? OR Administrador_Correo_Institucional = ?',
    [rut, correo]
  );
  if (existentes.length > 0) {
    throw new Error('Ya existe un usuario con ese RUT o correo. Un administrador no puede tener otros roles '
      + '(punto abierto 13); si es la misma persona, cambia sus roles desde Gestión de roles.');
  }
  const hash = await bcrypt.hash(contrasena, 10);
  const [resultado] = await db.query(
    `INSERT INTO usuario (
       Usuario_RUT, Usuario_Telefono, Usuario_Nombre_Completo, Usuario_Estado_Cuenta, Usuario_Contraseña,
       Es_Docente, Es_Administrador, Administrador_Tipo, Administrador_Correo_Institucional, Es_Apoderado
     ) VALUES (?, ?, ?, 1, ?, 0, 1, 'Super Admin', ?, 0)`,
    [rut, normalizarTelefono(telefono), nombre.trim(), hash, correo.trim()]
  );
  return resultado.insertId;
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  const contrasena = process.env.SUPERADMIN_PASSWORD
    || await pedirContrasena('Contraseña del super administrador: ');
  const datos = { rut: args.rut, nombre: args.nombre, telefono: args.telefono, correo: args.correo, contrasena };

  const errores = validarDatos(datos);
  if (errores.length > 0) {
    console.error(`❌ No se creó la cuenta:\n - ${errores.join('\n - ')}`);
    process.exit(1);
  }

  const db = require('../config/db');
  try {
    const id = await crearSuperAdmin(db, datos);
    console.log(`✅ Super administrador creado (Usuario_Id ${id}). Ya puede iniciar sesión con su RUT.`);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

if (require.main === module) main();

module.exports = { validarDatos, crearSuperAdmin };
