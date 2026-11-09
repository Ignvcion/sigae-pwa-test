// utils/situacionFinal.js
// Situación final y promoción (RF61; docs/decisiones-rf60-rf61-periodos.txt, punto 4).

// Valores posibles según el nivel. "4to Medio" = el último nivel por orden.
const VALORES_GENERALES = ['Promovido', 'Repitente', 'Retirado'];
const VALORES_ULTIMO_NIVEL = ['Egresado', 'En práctica', 'Repitente', 'Retirado'];

// Estados de una situación final:
//   Borrador   -> guardada sin confirmar (CU98 Exc. 1: pueden faltar estudiantes)
//   Registrado -> confirmada, lista para aplicar la promoción
//   Aplicado   -> la promoción ya se ejecutó; no se puede modificar (CU98 Exc. 2)
const ESTADOS = { BORRADOR: 'Borrador', REGISTRADO: 'Registrado', APLICADO: 'Aplicado' };

// Qué hace la promoción con cada valor:
//   destino 'siguiente' -> curso del nivel siguiente, misma sección, período siguiente
//   destino 'mismo'     -> curso del mismo nivel, misma sección, período siguiente
//   destino null        -> se queda en su curso (período antiguo) y cambia el estado académico
//   sinCierre true      -> se puede aplicar todo el año; el resto exige el cierre iniciado
//                          (punto abierto 2, confirmado por el PO: solo Retirado se aplica sin cierre)
const EFECTOS = {
  Promovido: { destino: 'siguiente', estadoAcademico: null, sinCierre: false },
  Repitente: { destino: 'mismo', estadoAcademico: null, sinCierre: false },
  Egresado: { destino: null, estadoAcademico: 'Egresado', sinCierre: false },
  'En práctica': { destino: null, estadoAcademico: 'En práctica', sinCierre: false },
  Retirado: { destino: null, estadoAcademico: 'Retirado', sinCierre: true },
};

const valoresPermitidos = (nivelOrden, ordenMaximo) =>
  (Number(nivelOrden) === Number(ordenMaximo) ? VALORES_ULTIMO_NIVEL : VALORES_GENERALES);

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Normaliza un valor escrito a mano (Excel): "en practica" -> "En práctica". null si no se reconoce. */
function normalizarValor(texto, permitidos) {
  const clave = sinTildes(texto).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!clave) return null;
  return permitidos.find((v) => sinTildes(v).toLowerCase() === clave) || null;
}

/** "12.345.678-k" -> "12345678-K"; null si no tiene forma de RUT. */
function normalizarRut(rut) {
  const limpio = String(rut ?? '').replace(/[.\s]/g, '').toUpperCase();
  return /^\d{1,9}-[\dK]$/.test(limpio) ? limpio : null;
}

/** Nombre para comparar (CU99: si no coincide con el RUT se advierte sin bloquear). */
const nombreComparable = (n) => sinTildes(n).toLowerCase().replace(/\s+/g, ' ').trim();

module.exports = {
  VALORES_GENERALES,
  VALORES_ULTIMO_NIVEL,
  ESTADOS,
  EFECTOS,
  valoresPermitidos,
  normalizarValor,
  normalizarRut,
  nombreComparable,
};
