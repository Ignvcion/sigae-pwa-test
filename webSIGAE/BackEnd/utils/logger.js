// utils/logger.js
// Logs sin datos personales en producción.
//
// Los controladores registran los errores con console.error(error). Un error de
// MySQL puede traer datos en su mensaje (p. ej. "Duplicate entry '12345678-9'
// for key ..."), y los objetos que se registran pueden traer RUT, nombres o
// notas. Con NODE_ENV=production, instalarLogsSeguros() envuelve console.* para
// que cada argumento pase por sanear() antes de llegar al log de pm2:
//   - Error: nombre, código y mensaje saneado + las líneas del stack (solo
//     rutas de archivo). Se descartan err.sql, err.sqlMessage y demás campos.
//   - Texto: se tapan los valores entre comillas, RUT, correos y tokens.
//   - Objetos: no se vuelcan; solo se registran sus claves.
// En desarrollo no cambia nada.
const util = require('util');

const RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN_LARGO = /\b[A-Za-z0-9_-]{32,}(\.[A-Za-z0-9_-]+){0,2}\b/g; // JWT, tokens hex
const ENTRE_COMILLAS = /'[^']*'|"[^"]*"/g;

function sanearTexto(texto) {
  return String(texto)
    .replace(ENTRE_COMILLAS, "'***'")
    .replace(RUT, '[RUT]')
    .replace(CORREO, '[correo]')
    .replace(TOKEN_LARGO, '[token]');
}

function sanearError(err) {
  const codigo = err.code ? ` [${err.code}]` : '';
  const cabecera = `${err.name || 'Error'}${codigo}: ${sanearTexto(err.message || '')}`;
  const pila = String(err.stack || '')
    .split('\n')
    .filter((linea) => /^\s+at /.test(linea))
    .join('\n');
  return pila ? `${cabecera}\n${pila}` : cabecera;
}

function sanear(valor) {
  if (valor instanceof Error) return sanearError(valor);
  if (typeof valor === 'string') return sanearTexto(valor);
  if (valor === null || valor === undefined) return String(valor);
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') return String(valor);
  if (typeof valor === 'object') {
    const claves = Array.isArray(valor) ? `arreglo de ${valor.length}` : Object.keys(valor).join(', ');
    return `[objeto omitido: ${claves}]`;
  }
  return '[valor omitido]';
}

let instalado = false;

function instalarLogsSeguros() {
  if (instalado) return;
  instalado = true;
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[metodo].bind(console);
    console[metodo] = (...args) => {
      // Respeta el formato de console (%s, %d...) pero sobre valores ya saneados.
      original(util.format(...args.map(sanear)));
    };
  }
}

module.exports = { instalarLogsSeguros, sanear, sanearTexto };
