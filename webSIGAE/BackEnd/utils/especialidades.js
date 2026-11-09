// utils/especialidades.js
// Especialidades del docente como etiquetas (RF04).
//
// - El catálogo `especialidad` se arma solo: al guardar las especialidades de un
//   docente, las que no existen se crean y las que ya existen se reutilizan.
//   El nombre es único sin distinguir mayúsculas ni tildes (collation
//   utf8mb4_unicode_ci), así "matematicas" reutiliza "Matemáticas".
// - `docente_especialidad` relaciona cada docente con sus etiquetas.
// - usuario.Docente_Especialidad guarda el resumen en texto ("A, B") que usan
//   los listados, la mensajería y el creador de horarios. Lo escribe solo
//   guardarEspecialidadesDocente; nunca se edita directamente.
// - Las etiquetas que quedan sin docentes se eliminan del catálogo.

const MAX_ESPECIALIDADES = 6;
const MAX_LARGO = 40; // 6 × 40 + separadores cabe en usuario.Docente_Especialidad (255)
const SEPARADOR = ', ';

// Letras (con tildes), números, espacios y algunos signos; sin comas, que separan etiquetas
const FORMATO = /^[\p{L}\p{N}][\p{L}\p{N} .()/&'-]*$/u;

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();
const clave = (texto) => limpiar(texto).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Normaliza lo que envía el cliente: un arreglo de nombres o, por compatibilidad,
 * un texto separado por comas. Quita duplicados (sin distinguir mayúsculas ni tildes).
 * @returns {{ ok: true, nombres: string[] } | { ok: false, mensaje: string }}
 */
function normalizarEspecialidades(valor) {
  const crudos = Array.isArray(valor) ? valor : String(valor ?? '').split(',');
  const nombres = [];
  const vistos = new Set();
  for (const crudo of crudos) {
    if (typeof crudo !== 'string' && typeof crudo !== 'number') {
      return { ok: false, mensaje: 'Las especialidades deben ser una lista de textos' };
    }
    const nombre = limpiar(crudo);
    if (!nombre) continue;
    if (nombre.length < 2 || nombre.length > MAX_LARGO) {
      return { ok: false, mensaje: `Cada especialidad debe tener entre 2 y ${MAX_LARGO} caracteres` };
    }
    if (!FORMATO.test(nombre)) {
      return { ok: false, mensaje: `La especialidad "${nombre}" contiene caracteres no permitidos` };
    }
    if (vistos.has(clave(nombre))) continue;
    vistos.add(clave(nombre));
    nombres.push(nombre);
  }
  if (nombres.length === 0) return { ok: false, mensaje: 'Debe indicar al menos una especialidad' };
  if (nombres.length > MAX_ESPECIALIDADES) {
    return { ok: false, mensaje: `Un docente puede tener como máximo ${MAX_ESPECIALIDADES} especialidades` };
  }
  return { ok: true, nombres };
}

/**
 * Lee las especialidades del cuerpo de una solicitud: `Docente_Especialidades`
 * (arreglo) o, si no viene, `Docente_Especialidad` (texto). undefined si no viene ninguna.
 */
function especialidadesDelCuerpo(body = {}) {
  if (body.Docente_Especialidades !== undefined) return body.Docente_Especialidades;
  if (body.Docente_Especialidad !== undefined) return body.Docente_Especialidad;
  return undefined;
}

/**
 * Reemplaza las especialidades del docente. Crea en el catálogo las que no
 * existen, actualiza el resumen en usuario.Docente_Especialidad y borra del
 * catálogo las etiquetas que quedaron sin docentes. Usar dentro de una transacción.
 * @param {string[]} nombres ya normalizados con normalizarEspecialidades
 * @returns {Promise<string>} el resumen guardado, con los nombres del catálogo
 */
async function guardarEspecialidadesDocente(conn, usuarioId, nombres) {
  const ids = [];
  const canonicos = [];
  for (const nombre of nombres) {
    await conn.query('INSERT IGNORE INTO especialidad (Especialidad_Nombre) VALUES (?)', [nombre]);
    const [filas] = await conn.query(
      'SELECT Especialidad_Id, Especialidad_Nombre FROM especialidad WHERE Especialidad_Nombre = ?',
      [nombre]
    );
    const fila = Array.isArray(filas) ? filas[0] : null;
    if (!fila) throw new Error(`No se pudo registrar la especialidad "${nombre}"`);
    if (ids.includes(fila.Especialidad_Id)) continue;
    ids.push(fila.Especialidad_Id);
    canonicos.push(fila.Especialidad_Nombre);
  }

  await conn.query('DELETE FROM docente_especialidad WHERE Docente_Usuario_Id = ?', [usuarioId]);
  await conn.query(
    'INSERT INTO docente_especialidad (Docente_Usuario_Id, Especialidad_Id) VALUES ?',
    [ids.map((id) => [usuarioId, id])]
  );
  const resumen = canonicos.join(SEPARADOR);
  await conn.query('UPDATE usuario SET Docente_Especialidad = ? WHERE Usuario_Id = ?', [resumen, usuarioId]);
  await eliminarEspecialidadesSinDocentes(conn);
  return resumen;
}

/** Etiquetas del resumen guardado en el docente: "A, B" → ["A", "B"]. */
const etiquetasDe = (resumen) => String(resumen ?? '').split(',').map(limpiar).filter(Boolean);

/**
 * RF35 / CU56: ¿alguna especialidad del docente corresponde a la asignatura? Compara sin
 * mayúsculas ni tildes y acepta que una contenga a la otra ("Matemáticas" ~ "Matemática",
 * "Lenguaje" ~ "Lenguaje y Comunicación").
 */
function coincideEspecialidad(resumen, asignatura) {
  const a = clave(asignatura);
  if (!a) return false;
  return etiquetasDe(resumen).some((e) => {
    const k = clave(e);
    return k.length > 0 && (a.includes(k) || k.includes(a));
  });
}

/**
 * La especialidad es solo una SUGERENCIA al asignar (no bloquea). Devuelve el texto a
 * mostrar cuando no coincide, o null si coincide.
 */
function sugerenciaEspecialidad(nombreDocente, resumen, asignatura) {
  if (!asignatura || coincideEspecialidad(resumen, asignatura)) return null;
  const nombre = nombreDocente || 'El docente';
  return etiquetasDe(resumen).length === 0
    ? `Sugerencia: ${nombre} no tiene especialidad registrada para ${asignatura}. Se puede asignar igual.`
    : `Sugerencia: la especialidad de ${nombre} (${etiquetasDe(resumen).join(', ')}) no coincide con ${asignatura}. Se puede asignar igual.`;
}

async function eliminarEspecialidadesSinDocentes(conn) {
  await conn.query(
    `DELETE FROM especialidad
      WHERE NOT EXISTS (SELECT 1 FROM docente_especialidad de WHERE de.Especialidad_Id = especialidad.Especialidad_Id)`
  );
}

module.exports = {
  MAX_ESPECIALIDADES,
  MAX_LARGO,
  SEPARADOR,
  normalizarEspecialidades,
  especialidadesDelCuerpo,
  guardarEspecialidadesDocente,
  eliminarEspecialidadesSinDocentes,
  coincideEspecialidad,
  sugerenciaEspecialidad,
};
