import {
  DOMINIOS_INSTITUCIONALES,
  DOMINIO_INSTITUCIONAL,
  TEXTO_DOMINIOS_INSTITUCIONALES,
} from "../config/institucion";

// Elimina espacios y puntos del RUT (acepta "12.345.678-9 " → "12345678-9")
export function normalizarRut(rut) {
  return rut.replace(/[\s.]/g, "");
}

// Quita tildes, pasa a minúsculas y recorta espacios extremos
export function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function validarRut(rutCompleto) {
  const rut = normalizarRut(rutCompleto);
  if (!/^\d{7,8}-[\dkK]$/.test(rut)) return false;
  const [cuerpo, dvIngresado] = rut.split("-");
  let suma = 0;
  let multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }
  const dvEsperado = 11 - (suma % 11);
  const dv = dvEsperado === 11 ? "0" : dvEsperado === 10 ? "k" : String(dvEsperado);
  return dv === dvIngresado.toLowerCase();
}

// Nombre completo: solo letras (incluye tildes y ñ) y espacios, al menos nombre y apellido, máx. 100
export const MAX_NOMBRE_COMPLETO = 100;

export function validarNombreCompleto(nombre) {
  const limpio = nombre.trim();
  return limpio.length <= MAX_NOMBRE_COMPLETO && /^\p{L}+(\s+\p{L}+)+$/u.test(limpio);
}

export function validarCorreoInstitucional(correo) {
  const normalizado = correo.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)
    && DOMINIOS_INSTITUCIONALES.some((dominio) => normalizado.endsWith(dominio));
}

export function validarCorreo(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
}

// Formato chileno: 9 dígitos, opcionalmente con prefijo internacional +56. Solo números.
export function validarTelefonoChileno(telefono) {
  return /^(\+?56)?\d{9}$/.test(String(telefono).trim());
}

export const MENSAJE_TELEFONO = "Ingresa 9 dígitos, opcionalmente con prefijo +56 (ej: 912345678 o +56912345678)";

// Contraseña: mínimo 8 caracteres, al menos una mayúscula y un número.
// Devuelve el mensaje de error o "" si es válida.
export function validarFortalezaContrasena(pwd) {
  if (pwd.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(pwd)) return "La contraseña debe contener al menos una mayúscula";
  if (!/[0-9]/.test(pwd)) return "La contraseña debe contener al menos un número";
  return "";
}

// Dirección particular (todo usuario y estudiante): { calle, numero, depto (opcional), comuna }.
// Devuelve un objeto { campo: mensaje } solo con los campos inválidos.
export function validarDireccion({ calle = "", numero = "", depto = "", comuna = "" }) {
  const errores = {};
  if (!calle.trim()) errores.calle = "La calle es obligatoria";
  else if (calle.trim().length > 100) errores.calle = "Máximo 100 caracteres";
  if (!numero.trim()) errores.numero = "El número es obligatorio";
  else if (!/^\d{1,6}[A-Za-z]?$/.test(numero.trim())) errores.numero = "Debe ser numérico (ej: 134 o 134B)";
  if (depto.trim().length > 20) errores.depto = "Máximo 20 caracteres";
  if (!comuna.trim()) errores.comuna = "La comuna es obligatoria";
  else if (comuna.trim().length > 60 || !/^\p{L}+(\s+\p{L}+)*$/u.test(comuna.trim())) {
    errores.comuna = "Solo letras y espacios";
  }
  return errores;
}

// Columnas de la dirección en la BD: usuario (todo rol) y ficha del estudiante
export const COLUMNAS_DIRECCION_USUARIO = {
  calle : "Usuario_Direccion_Calle",
  numero: "Usuario_Direccion_Numero",
  depto : "Usuario_Direccion_Depto",
  comuna: "Usuario_Direccion_Comuna",
};
export const COLUMNAS_DIRECCION_ESTUDIANTE = {
  calle : "Estudiante_Calle",
  numero: "Estudiante_Numero",
  depto : "Estudiante_Depto",
  comuna: "Estudiante_Comuna",
};

// "Calle Número, Depto X, Comuna" a partir de las columnas del usuario (o del estudiante)
export function formatearDireccion(registro, columnas = COLUMNAS_DIRECCION_USUARIO) {
  if (!registro?.[columnas.calle]) return "";
  const calleNumero = [registro[columnas.calle], registro[columnas.numero]].filter(Boolean).join(" ");
  return [calleNumero, registro[columnas.depto], registro[columnas.comuna]].filter(Boolean).join(", ");
}

export { DOMINIO_INSTITUCIONAL, TEXTO_DOMINIOS_INSTITUCIONALES };
