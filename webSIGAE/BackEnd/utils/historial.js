// utils/historial.js
// Registro de auditoría en la tabla `historial` (ver docs/tabla-historial.md).
// Se llama con la MISMA conexión de la transacción que hace el cambio, para
// que el cambio y su registro se confirmen o se reviertan juntos.
//
// Convención para todo el backend (docs/decisiones-rf60-rf61-periodos.txt, 7):
//   - Una persona se escribe como "RUT sin dígito verificador (Nombre)",
//     p. ej. "12345678 (Ana Pérez)". Se omite el DV porque puede ser K.
//   - Varias personas, separadas por "; ".
//   - Sin valor (p. ej. "sin apoderado"): SIN_VALOR ("—"), porque las
//     columnas de valor son NOT NULL.
const SIN_VALOR = '—';

/** "12.345.678-K" -> "12345678". Sin RUT devuelve null. */
function rutSinDV(rut) {
  if (!rut) return null;
  const cuerpo = String(rut).split('-')[0].replace(/\D/g, '');
  return cuerpo || null;
}

/**
 * Referencia a una persona para el historial. Acepta una fila de `usuario`
 * (Usuario_RUT, Usuario_Nombre_Completo) o de `estudiante` (Estudiante_RUT,
 * Estudiante_Nombre_Completo), o { rut, nombre }.
 */
function refPersona(p) {
  if (!p) return SIN_VALOR;
  const rut = rutSinDV(p.rut ?? p.Usuario_RUT ?? p.Estudiante_RUT);
  const nombre = p.nombre ?? p.Usuario_Nombre_Completo ?? p.Estudiante_Nombre_Completo;
  if (rut && nombre) return `${rut} (${nombre})`;
  return rut || nombre || SIN_VALOR;
}

/** Varias personas: "12345678 (Ana Pérez); 9876543 (Luis Ramos)" o "—". */
function refPersonas(lista = []) {
  return lista.length ? lista.map(refPersona).join('; ') : SIN_VALOR;
}

/**
 * Mapa Usuario_Id -> { Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo } para
 * los ids indicados (se ignoran null/undefined). Una sola consulta.
 */
async function buscarPersonas(conn, ids) {
  const unicos = [...new Set(ids.filter((id) => id !== null && id !== undefined).map(Number))];
  if (unicos.length === 0) return new Map();
  const [filas] = await conn.query(
    'SELECT Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo FROM usuario WHERE Usuario_Id IN (?)',
    [unicos]
  );
  return new Map((Array.isArray(filas) ? filas : []).map((u) => [Number(u.Usuario_Id), u]));
}

const comoTexto = (valor) => (valor === null || valor === undefined || valor === '' ? SIN_VALOR : String(valor));

async function registrarHistorial(conn, {
  atributo,
  anterior,
  nuevo,
  descripcion,
  responsableId,
  usuarioId = null,
  estudianteId = null,
  citacionId = null,
  horarioAsignaturaId = null,
}) {
  await conn.query(
    `INSERT INTO historial (
       Historial_Valor_Anterior, Historial_Hora_Registro, Historial_Descripcion_Cambio,
       Historial_Atributo_Modificado, Historial_Valor_Nuevo, Historial_Fecha_Registro,
       Usuario_Id, Estudiante_Id, Citacion_Id, Horario_Asignatura_Id, Usuario_Responsable_Id
     ) VALUES (?, CURTIME(), ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?)`,
    [
      comoTexto(anterior), descripcion, atributo, comoTexto(nuevo),
      usuarioId, estudianteId, citacionId, horarioAsignaturaId, responsableId,
    ]
  );
}

module.exports = { registrarHistorial, refPersona, refPersonas, rutSinDV, buscarPersonas, SIN_VALOR };
