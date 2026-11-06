// src/services/api.js
const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  return {
    'Content-Type' : 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

function clearSessionAndRedirect() {
  localStorage.removeItem('usuario');
  localStorage.removeItem('token');
  localStorage.removeItem('rolActivo');
  window.location.href = '/session-expired';
}

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.codigo === 'TOKEN_EXPIRADO' || data.codigo === 'SESION_INACTIVA') {
      clearSessionAndRedirect();
      return null;
    }
  }

  return res;
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // CU 13: token expirado o sesión invalidada → limpiar y redirigir
    if (res.status === 401 && (data.codigo === 'TOKEN_EXPIRADO' || data.codigo === 'SESION_INACTIVA')) {
      clearSessionAndRedirect();
      return;
    }
    const error = new Error(
  data.mensaje ||
  data.error ||
  `Error ${res.status}`
);

error.data = data;

throw error;
  }
  return data;
}

// ── CU19: Editar datos personales del propio perfil ──

export async function editarPerfilPropio({ correo, telefono, direccion }) {
  const res = await fetch(`${BASE_URL}/usuarios/perfil`, {
    method : 'PUT',
    headers: authHeaders(),
    body   : JSON.stringify({ correo, telefono, direccion }),
  });
  return handleResponse(res);
}

// ── CU20: Editar fotografía de perfil mediante carga de archivo ──

export async function actualizarFotoPerfil(archivo) {
  const formData = new FormData();
  formData.append('foto', archivo);
  const res = await fetch(`${BASE_URL}/usuarios/perfil/foto`, {
    method : 'PUT',
    // Sin Content-Type: el navegador arma el boundary multipart automáticamente
    headers: { Authorization: `Bearer ${getToken()}` },
    body   : formData,
  });
  return handleResponse(res);
}


// Dirección particular de cualquier usuario (Incremento 3): depto vacío se envía como null
function columnasDireccionUsuario({ calle, numero, depto, comuna }) {
  return {
    Usuario_Direccion_Calle : calle,
    Usuario_Direccion_Numero: numero,
    Usuario_Direccion_Depto : depto || null,
    Usuario_Direccion_Comuna: comuna,
  };
}

// ── ADMINISTRADOR ────────────────────────────
export async function registrarAdmin({ nombre, rut, correo, telefono, password, estado, calle, numero, depto, comuna }) {
  const res = await fetch(`${BASE_URL}/usuarios`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      Usuario_Nombre_Completo            : nombre,
      Usuario_RUT                        : rut,
      Usuario_Telefono                   : telefono,
      Usuario_Contraseña                 : password,
      Usuario_Estado_Cuenta              : estado === 'Activo' ? 1 : 0,
      Es_Administrador                   : 1,
      Administrador_Tipo                 : 'Administrador Normal',
      Administrador_Correo_Institucional : correo,
      ...columnasDireccionUsuario({ calle, numero, depto, comuna }),
      Es_Docente                         : 0,
      Es_Apoderado                       : 0,
    }),
  });
  return handleResponse(res);
}

// ── DOCENTE ──────────────────────────────────
export async function registrarDocente({ nombre, rut, correo, telefono, password, especialidades, cargaHoraria, disponibilidad, estado, calle, numero, depto, comuna }) {
  const res = await fetch(`${BASE_URL}/usuarios`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      Usuario_Nombre_Completo      : nombre,
      Usuario_RUT                  : rut,
      Usuario_Telefono             : telefono,
      Usuario_Contraseña           : password,
      Usuario_Estado_Cuenta        : estado === 'Activo' ? 1 : 0,
      Es_Docente                   : 1,
      Docente_Especialidades       : especialidades,
      Docente_Carga_Horaria_Maxima : parseInt(cargaHoraria, 10), // carga horaria semanal
      Docente_Disponibilidad       : { bloques: disponibilidad || [] },
      Docente_Correo_Institucional : correo,
      ...columnasDireccionUsuario({ calle, numero, depto, comuna }),
      Es_Administrador             : 0,
      Es_Apoderado                 : 0,
    }),
  });
  return handleResponse(res);
}

// ── APODERADO ────────────────────────────────
export async function registrarApoderado({ nombre, rut, correo, telefono, calle, numero, depto, comuna, password, estado }) {
  const res = await fetch(`${BASE_URL}/usuarios`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      Usuario_Nombre_Completo : nombre,
      Usuario_RUT             : rut,
      Usuario_Telefono        : telefono,
      Usuario_Contraseña      : password,
      Usuario_Estado_Cuenta   : estado === 'Activo' ? 1 : 0,
      Es_Apoderado            : 1,
      ...columnasDireccionUsuario({ calle, numero, depto, comuna }),
      Apoderado_Correo_Natural: correo,
      Es_Docente              : 0,
      Es_Administrador        : 0,
    }),
  });
  return handleResponse(res);
}

// ── ESTUDIANTE ───────────────────────────────
export async function verificarRutEstudiante(rut) {
  const res = await fetch(`${BASE_URL}/estudiantes/verificar-rut?rut=${encodeURIComponent(rut)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function registrarEstudiante({ nombre, rut, curso, estadoAcademico, calle, numero, depto, comuna }) {
  const res = await fetch(`${BASE_URL}/estudiantes`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      Estudiante_Nombre_Completo  : nombre,
      Estudiante_RUT              : rut,
      Curso_Id                    : curso,
      Estudiante_Estado_Academico : estadoAcademico,
      Apoderado_Usuario_Id        : null,
      Estudiante_Calle            : calle,
      Estudiante_Numero           : numero,
      Estudiante_Depto            : depto || null,
      Estudiante_Comuna           : comuna,
    }),
  });
  return handleResponse(res);
}

// ── CU34 y CU35: Listado y filtros de estudiantes ──

export async function getEstudiantes({ curso, estado } = {}) {
  const params = new URLSearchParams();
  if (curso) params.set('curso', curso);
  if (estado) params.set('estado', estado);
  const query = params.toString();
  const res = await fetch(`${BASE_URL}/estudiantes${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── CU36: Búsqueda de estudiantes por nombre completo o RUT ──

export async function buscarEstudiantes(criterio) {
  const params = new URLSearchParams({ criterio: criterio ?? '' });
  const res = await fetch(`${BASE_URL}/estudiantes/buscar?${params.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── CU38: Editar curso asociado y estado académico de un estudiante ──

export async function getCursos() {
  const res = await fetch(`${BASE_URL}/cursos`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function editarEstudiante(id, datos) {
  const res = await fetch(`${BASE_URL}/estudiantes/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(datos),
  });
  return handleResponse(res);
}

// ── CU29: Búsqueda de usuarios con filtros avanzados por rol y estado de cuenta ──

export async function getUsuariosPorFiltro({ rol, estado } = {}) {
  const params = new URLSearchParams();
  if (rol) params.set('rol', rol);
  if (estado !== undefined && estado !== '') params.set('estado', estado);
  const query = params.toString();
  const res = await fetch(`${BASE_URL}/usuarios/filtrar${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── CU30 y CU31: Listado y filtros de docentes ──

export async function getDocentes({ especialidad, especialidadId, estado } = {}) {
  const params = new URLSearchParams();
  if (especialidad) params.set('especialidad', especialidad);
  if (especialidadId) params.set('especialidadId', especialidadId);
  if (estado !== undefined && estado !== '') params.set('estado', estado);
  const query = params.toString();
  const res = await fetch(`${BASE_URL}/usuarios/docentes${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── RF04: catálogo de especialidades (etiquetas) ──
export async function getEspecialidades() {
  const res = await fetch(`${BASE_URL}/especialidades`, { headers: authHeaders() });
  return handleResponse(res);
}

// ── CU107: disponibilidad laboral semanal del docente (solo administrador) ──
export async function getOpcionesDisponibilidad() {
  const res = await fetch(`${BASE_URL}/usuarios/disponibilidad/opciones`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getDisponibilidadDocente(usuarioId, periodo) {
  const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
  const res = await fetch(`${BASE_URL}/usuarios/${usuarioId}/disponibilidad${query}`, { headers: authHeaders() });
  return handleResponse(res);
}

// ── ASOCIACIÓN APODERADO-ESTUDIANTE ──────────

// CU32 y CU33: Listado y filtros de apoderados (incluye roles y estudiantes vinculados)
export async function getApoderados({ operador, cantidadEstudiantes } = {}) {
  const params = new URLSearchParams();
  if (cantidadEstudiantes !== undefined && cantidadEstudiantes !== '') {
    params.set('cantidadEstudiantes', cantidadEstudiantes);
    if (operador) params.set('operador', operador);
  }
  const query = params.toString();
  const res = await fetch(`${BASE_URL}/usuarios/apoderados${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Obtener estudiantes que aún no tienen apoderado asignado
export async function getEstudiantesSinApoderado() {
  const res = await fetch(`${BASE_URL}/estudiantes/sin-apoderado`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Asignar apoderado a uno o más estudiantes
export async function asignarApoderado({ apoderadoId, estudianteIds }) {
  const res = await fetch(`${BASE_URL}/estudiantes/asignar-apoderado`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({ apoderadoId, estudianteIds }),
  });
  return handleResponse(res);
}

// CU9: eliminar todas las asociaciones activas de un apoderado con sus estudiantes
export async function eliminarTodasAsociaciones(apoderadoId) {
  const res = await fetch(`${BASE_URL}/estudiantes/apoderado/${apoderadoId}/todas`, {
    method : 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}
// ── ADMINISTRADORES (CU2 y CU3) ───────────────

// Obtener el listado de administradores registrados
export async function getAdministradores() {
  const res = await fetch(`${BASE_URL}/usuarios/administradores`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Editar correo institucional, teléfono y/o estado de cuenta de un administrador
export async function editarAdministrador(id, datos) {
  const res = await fetch(`${BASE_URL}/usuarios/administradores/${id}`, {
    method : 'PUT',
    headers: authHeaders(),
    body   : JSON.stringify(datos),
  });
  return handleResponse(res);
}

// ── CU42: Cursos y asignaturas de un docente ──

// "Mis Cursos": estudiantes de un curso donde el docente hace clases (sin RUT ni dirección)
export async function getEstudiantesCursoDocente(cursoId) {
  const res = await fetch(`${BASE_URL}/estudiantes/curso/${cursoId}/mis-estudiantes`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function getAsignacionesDocente(docenteId) {
  const res = await fetch(`${BASE_URL}/horarios/docente/${docenteId}/asignaciones`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── CU43: Horario semanal de un docente a partir de sus cursos asociados ──

export async function getHorarioDocente(docenteId) {
  const res = await fetch(`${BASE_URL}/horarios/docente/${docenteId}/horario`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Horario semanal del curso de un estudiante (su apoderado o un Administrador)
export async function getHorarioEstudiante(estudianteId) {
  const res = await fetch(`${BASE_URL}/horarios/estudiante/${estudianteId}/horario`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Listado simple de docentes activos, usado para el selector de "Mi Horario" (Admin/Super Admin)
export async function getListaDocentes() {
  const res = await fetch(`${BASE_URL}/horarios/docentes`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU57: vista consolidada del horario de toda la institución (Super Admin/Admin)
export async function getHorarioMaestro() {
  const res = await fetch(`${BASE_URL}/horarios/maestro`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── CU40: Estudiantes asociados a un apoderado ──

export async function getEstudiantesAsociados(apoderadoId) {
  const res = await fetch(`${BASE_URL}/estudiantes/apoderado/${apoderadoId}/asociados`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── CU41: Detalle de un estudiante desde la lista de asociados ──

export async function getDetalleEstudiante(apoderadoId, estudianteId) {
  const res = await fetch(`${BASE_URL}/estudiantes/apoderado/${apoderadoId}/asociados/${estudianteId}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── CU39: Editar (reasignar/quitar) el apoderado de un estudiante ──

export async function editarAsociacionEstudiante(estudianteId, apoderadoId, confirmarEliminacion = false) {
  const res = await fetch(`${BASE_URL}/estudiantes/${estudianteId}/apoderado`, {
    method : 'PUT',
    headers: authHeaders(),
    body   : JSON.stringify({ apoderadoId, confirmarEliminacion }),
  });
  return handleResponse(res);
}

// CU10: eliminar la asociación específica entre un apoderado y un estudiante
export async function eliminarAsociacionEspecifica(estudianteId) {
  const res = await fetch(`${BASE_URL}/estudiantes/${estudianteId}/apoderado`, {
    method : 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Buscar usuario existente por RUT, nombre o correo
export async function buscarUsuarioExistente({ rut, nombre, correo }) {

  const res = await fetch(
    `${BASE_URL}/usuarios/buscar`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        rut,
        nombre,
        correo
      })
    }
  );

  return handleResponse(res);
}

// ── CITACIONES (CU74–CU79 / RF48–RF53) ────────
// Los nombres siguen los mensajes de los diagramas de secuencia (V_Citaciones → C_Citaciones).

// CU78: agenda cronológica de las citaciones del usuario autenticado según su rol activo
export async function getCitaciones(rol) {
  const params = new URLSearchParams();
  if (rol) params.set('rol', rol);
  const query = params.toString();
  const res = await fetch(`${BASE_URL}/citaciones${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU75: solicitudes pendientes de confirmación para el usuario autenticado
export async function getCitacionesPendientes(rol) {
  const params = new URLSearchParams();
  if (rol) params.set('rol', rol);
  const query = params.toString();
  const res = await fetch(`${BASE_URL}/citaciones/pendientes${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU76 / CU77: detalle de una citación (404 → "no existe o no está disponible")
export async function getDetalleCitacion(citacionId) {
  const res = await fetch(`${BASE_URL}/citaciones/${citacionId}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU74: crear citación (el backend valida disponibilidad y la registra "Pendiente de confirmación")
export async function crearCitacion({ estudianteId, fecha, tramo, motivo, modalidad }) {
  const res = await fetch(`${BASE_URL}/citaciones`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      Estudiante_Id          : Number(estudianteId),
      Citacion_Fecha         : fecha,
      Citacion_Tramo_Horario : tramo,
      Citacion_Motivo        : motivo.trim(),
      Citacion_Modalidad     : modalidad,
    }),
  });
  return handleResponse(res);
}

// CU75: confirmar citación pendiente (registra fecha y hora exacta de confirmación)
export async function confirmarCitacion(citacionId) {
  const res = await fetch(`${BASE_URL}/citaciones/${citacionId}/confirmar`, {
    method : 'PATCH',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU76: cancelar citación con motivo obligatorio (queda registrado en el historial)
export async function cancelarCitacion(citacionId, motivo) {
  const res = await fetch(`${BASE_URL}/citaciones/${citacionId}/cancelar`, {
    method : 'PATCH',
    headers: authHeaders(),
    body   : JSON.stringify({ Citacion_Motivo_Cancelacion: motivo.trim() }),
  });
  return handleResponse(res);
}

// CU77: reprogramar fecha y/o tramo; la citación vuelve a "Pendiente de confirmación" para la contraparte
export async function reprogramarCitacion(citacionId, { fecha, tramo }) {
  const res = await fetch(`${BASE_URL}/citaciones/${citacionId}/reprogramar`, {
    method : 'PATCH',
    headers: authHeaders(),
    body   : JSON.stringify({
      Citacion_Fecha        : fecha,
      Citacion_Tramo_Horario: tramo,
    }),
  });
  return handleResponse(res);
}

// CU79: historial completo de citaciones de un estudiante (con registros de la tabla historial)
export async function getHistorialCitaciones(estudianteId) {
  const res = await fetch(`${BASE_URL}/citaciones/estudiante/${estudianteId}/historial`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}
// ── MENSAJES (CU73) ──────────────────────────

// Conversaciones del usuario según su rol activo (Docente | Apoderado)
export async function getConversaciones(rol) {
  const query = rol ? `?${new URLSearchParams({ rol })}` : '';
  const res = await apiFetch(`${BASE_URL}/mensajes/conversaciones${query}`);
  if (!res) return null;

  return handleResponse(res);
}

// Contactos válidos según la relación docente-apoderado
export async function getContactosMensajeria(rol) {
  const query = rol ? `?${new URLSearchParams({ rol })}` : '';
  const res = await apiFetch(`${BASE_URL}/mensajes/contactos${query}`);
  if (!res) return null;

  return handleResponse(res);
}

// Inicia una conversación con un contacto (o devuelve la que ya existe)
export async function iniciarConversacion(contactoId, rol) {
  const res = await apiFetch(`${BASE_URL}/mensajes/conversaciones`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contactoId, rol }),
  });
  if (!res) return null;

  return handleResponse(res);
}

export async function getMensajesConversacion(conversacionId) {
  const res = await apiFetch(
    `${BASE_URL}/mensajes/conversaciones/${conversacionId}/mensajes`
  );

  if (!res) return null;

  return handleResponse(res);
}

// Datos no invasivos de la contraparte de una conversación (panel lateral)
export async function getDetalleContactoConversacion(conversacionId) {
  const res = await apiFetch(
    `${BASE_URL}/mensajes/conversaciones/${conversacionId}/contacto`
  );

  if (!res) return null;

  return handleResponse(res);
}

export async function enviarMensaje(conversacionId, contenido) {
  const res = await apiFetch(
    `${BASE_URL}/mensajes/conversaciones/${conversacionId}/mensajes`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contenido,
      }),
    }
  );

  if (!res) return null;

  return handleResponse(res);
}

export async function marcarMensajesLeidos(conversacionId) {
  const res = await apiFetch(
    `${BASE_URL}/mensajes/conversaciones/${conversacionId}/leidos`,
    {
      method: 'PATCH',
    }
  );

  if (!res) return null;

  return handleResponse(res);
}

// ── CONSULTAS DE HORARIO (CU67, CU68, CU69) ──

function queryHorario(filtros = {}) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

// CU68: horarios que coinciden con los filtros (docente, curso, nivel, asignatura, jornada, día, estado)
export async function filtrarHorarios(filtros) {
  const res = await fetch(`${BASE_URL}/horarios/filtrar${queryHorario(filtros)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU67: bloques libres (sin asignaciones activas) — Super Admin/Admin
export async function getBloquesLibres(filtros) {
  const res = await fetch(`${BASE_URL}/horarios/bloques-libres${queryHorario(filtros)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU69: detalle de un bloque programado (Horario_Asignatura_Id)
export async function getDetalleBloqueHorario(horarioId) {
  const res = await fetch(`${BASE_URL}/horarios/bloque-detalle/${horarioId}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Datos de apoyo para los criterios de filtrado
export async function getCursosHorario() {
  const res = await fetch(`${BASE_URL}/horarios/cursos`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getAsignaturasHorario() {
  const res = await fetch(`${BASE_URL}/horarios/asignaturas`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getBloquesInstitucionales() {
  const res = await fetch(`${BASE_URL}/horarios/bloques`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getNivelesEducativos() {
  const res = await fetch(`${BASE_URL}/cursos/niveles`, { headers: authHeaders() });
  return handleResponse(res);
}

// ── HORARIO DE ATENCIÓN DE APODERADOS (RF55 / CU87, CU88) ────────

// Bloques de atención del docente autenticado
export async function getMiHorarioAtencion() {
  const res = await fetch(`${BASE_URL}/horario-atencion`, { headers: authHeaders() });
  return handleResponse(res);
}

// CU87: registrar bloque { dia, horaInicio, horaFin }
export async function crearBloqueAtencion(bloque) {
  const res = await fetch(`${BASE_URL}/horario-atencion`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify(bloque),
  });
  return handleResponse(res);
}

// CU88: modificar bloque. Si tiene citaciones a futuro el backend responde 409 con
// requiereConfirmacion; se reintenta con confirmar = true.
export async function actualizarBloqueAtencion(id, bloque, confirmar = false) {
  const res = await fetch(`${BASE_URL}/horario-atencion/${id}`, {
    method : 'PUT',
    headers: authHeaders(),
    body   : JSON.stringify({ ...bloque, confirmar }),
  });
  return handleResponse(res);
}

// CU88: eliminar bloque (misma confirmación que al modificar)
export async function eliminarBloqueAtencion(id, confirmar = false) {
  const res = await fetch(`${BASE_URL}/horario-atencion/${id}${confirmar ? '?confirmar=true' : ''}`, {
    method : 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── SOLICITUD DE CITACIÓN DEL APODERADO (RF56 / CU89) ────────

// Estudiantes del apoderado (como titular o suplente)
export async function getEstudiantesSolicitud() {
  const res = await fetch(`${BASE_URL}/citaciones/solicitud/estudiantes`, { headers: authHeaders() });
  return handleResponse(res);
}

// Docentes que imparten clases al estudiante
export async function getDocentesSolicitud(estudianteId) {
  const res = await fetch(`${BASE_URL}/citaciones/solicitud/estudiante/${estudianteId}/docentes`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// Tramos libres dentro del horario de atención del docente en las próximas semanas
export async function getDisponibilidadSolicitud(estudianteId, docenteId) {
  const params = new URLSearchParams({ estudianteId, docenteId });
  const res = await fetch(`${BASE_URL}/citaciones/solicitud/disponibilidad?${params}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// CU89: registrar la solicitud (queda pendiente hasta que el docente la confirme)
export async function solicitarCitacion({ estudianteId, docenteId, fecha, tramo, motivo, modalidad }) {
  const res = await fetch(`${BASE_URL}/citaciones/solicitud`, {
    method : 'POST',
    headers: authHeaders(),
    body   : JSON.stringify({
      Estudiante_Id          : Number(estudianteId),
      Docente_Usuario_Id     : Number(docenteId),
      Citacion_Fecha         : fecha,
      Citacion_Tramo_Horario : tramo,
      Citacion_Motivo        : motivo.trim(),
      Citacion_Modalidad     : modalidad,
    }),
  });
  return handleResponse(res);
}

// ── APODERADO TITULAR Y SUPLENTES (RF57 / CU90, CU91) ────────

// CU90: titular y suplentes actuales del estudiante (Administrador)
export async function getApoderadosEstudiante(estudianteId) {
  const res = await fetch(`${BASE_URL}/estudiantes/${estudianteId}/apoderados`, { headers: authHeaders() });
  return handleResponse(res);
}

// CU90: designar el titular y hasta 4 suplentes
export async function designarApoderadosEstudiante(estudianteId, { titularId, suplenteIds }) {
  const res = await fetch(`${BASE_URL}/estudiantes/${estudianteId}/apoderados`, {
    method : 'PUT',
    headers: authHeaders(),
    body   : JSON.stringify({ titularId: Number(titularId), suplenteIds: suplenteIds.map(Number) }),
  });
  return handleResponse(res);
}

// CU91: contactos del titular y los suplentes (Docente del estudiante o Administrador)
export async function getContactosApoderados(estudianteId) {
  const res = await fetch(`${BASE_URL}/citaciones/estudiante/${estudianteId}/contactos`, { headers: authHeaders() });
  return handleResponse(res);
}
