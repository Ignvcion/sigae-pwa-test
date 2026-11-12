// utils/permisos.js
// Etiqueta UTP (Unidad Técnico Pedagógica): grupo de permisos que el Super
// Administrador asigna a un Administrador o a un Docente desde Gestión de roles.
//
// Se guarda sin columnas nuevas, en usuario.Administrador_Tipo = 'UTP':
//   - Administrador con UTP: Es_Administrador = 1 y Administrador_Tipo = 'UTP'.
//     Sus permisos se PODAN: solo puede lo de la UTP. En la sesión su rol es
//     'UTP' (no 'Administrador'), así que toda verificación de administrador
//     (verifyAdmin y las de los controladores) lo rechaza por defecto.
//   - Docente con UTP: Es_Docente = 1, Es_Administrador = 0 y
//     Administrador_Tipo = 'UTP'. Sus permisos se EXTIENDEN: conserva los de
//     docente y suma los de la UTP.
//   - El Super Administrador no lleva la etiqueta.
//
// Permisos de la UTP (gestión académica): asignaturas y planes educativos,
// plan y programación de electivos, cursos, creación de horarios, asignación de
// estudiantes a cursos y su ruta de formación, consulta y exportación de
// horarios, y eventos institucionales con suspensión de clases. NO incluye
// usuarios, bloques horarios ni parámetros institucionales.

const TIPO_UTP = 'UTP';
const ROL_UTP = 'UTP';

/** Fila de usuario (BD) con la etiqueta UTP vigente: solo sobre un Administrador o un Docente. */
function tieneEtiquetaUTP(usuario) {
  if (!usuario || usuario.Administrador_Tipo !== TIPO_UTP) return false;
  return Boolean(usuario.Es_Administrador || usuario.Es_Docente);
}

/** Usuario de la sesión (req.user) con rol Administrador completo (sin la etiqueta UTP). */
function esAdministrador(user) {
  return (user?.roles || []).includes('Administrador');
}

/** Usuario de la sesión (req.user) con la etiqueta UTP (administrador o docente). */
function esUTP(user) {
  return Boolean(user?.utp);
}

/** Gestión académica: administrador completo o usuario con la etiqueta UTP. */
function puedeGestionAcademica(user) {
  return esAdministrador(user) || esUTP(user);
}

/**
 * Administrador_Tipo que debe quedar tras cambiar los roles de un usuario: la
 * etiqueta UTP solo se conserva si sigue siendo Administrador o Docente.
 */
function tipoTrasCambioDeRoles({ Es_Administrador, Es_Docente, Administrador_Tipo }) {
  if (Administrador_Tipo === TIPO_UTP) {
    return Es_Administrador || Es_Docente ? TIPO_UTP : null;
  }
  return Es_Administrador ? (Administrador_Tipo || 'Administrador Normal') : null;
}

module.exports = {
  TIPO_UTP,
  ROL_UTP,
  tieneEtiquetaUTP,
  esAdministrador,
  esUTP,
  puedeGestionAcademica,
  tipoTrasCambioDeRoles,
};
