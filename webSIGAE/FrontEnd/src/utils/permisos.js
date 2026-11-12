// Permisos por rol y etiqueta UTP (mismas reglas que BackEnd/utils/permisos.js).
//
// - Un administrador con la etiqueta UTP inicia sesión con el rol "UTP": sus
//   permisos se limitan a los de la UTP (no ve la gestión de usuarios, los bloques
//   horarios ni los parámetros institucionales).
// - Un docente con la etiqueta UTP conserva el rol "Docente" y suma los permisos
//   de la UTP (usuario.utp = true).

export const ROL_UTP = "UTP";

export function rolEfectivoDe(usuario, rolActivo) {
  return rolActivo || usuario?.roles?.[0];
}

export function esSuperAdministrador(usuario) {
  return usuario?.administradorTipo === "Super Admin";
}

/** Administrador completo (sin la etiqueta UTP) o Super Administrador. */
export function esAdministradorCompleto(usuario, rolActivo) {
  return (
    rolEfectivoDe(usuario, rolActivo) === "Administrador" ||
    esSuperAdministrador(usuario) ||
    Boolean(usuario?.roles?.includes("Administrador"))
  );
}

/** Administrador con la etiqueta UTP (rol "UTP"). */
export function esAdministradorUTP(usuario, rolActivo) {
  return rolEfectivoDe(usuario, rolActivo) === ROL_UTP;
}

/** La etiqueta UTP está activa en el perfil con que se ingresó (administrador UTP o docente UTP). */
export function tieneUTPActiva(usuario, rolActivo) {
  const rol = rolEfectivoDe(usuario, rolActivo);
  return Boolean(usuario?.utp) && (rol === ROL_UTP || rol === "Docente");
}

/** Gestión académica: administrador completo o etiqueta UTP. */
export function puedeGestionAcademica(usuario, rolActivo) {
  return esAdministradorCompleto(usuario, rolActivo) || tieneUTPActiva(usuario, rolActivo);
}

/** Texto del rol con la etiqueta: "Administrador · UTP", "Docente · UTP". */
export function etiquetaRol(rol, usuario) {
  if (rol === ROL_UTP) return "Administrador · UTP";
  if (rol === "Docente" && usuario?.utp) return "Docente · UTP";
  return rol;
}

/**
 * Funciones de la UTP en el menú y el dashboard. `soloAdministrador`: enlaces que
 * el docente con UTP ya tiene en su menú de docente ("Estudiantes", que con la
 * etiqueta muestra todos los estudiantes) o que no necesita ("Horario de Docente":
 * su "Mi Horario" muestra su propio horario).
 */
export const ENLACES_UTP = [
  { label: "Plan Educativo",          to: "/plan-educativo" },
  { label: "Electivos 3° y 4° medio", to: "/electivos" },
  { label: "Asignaturas",             to: "/asignaturas" },
  { label: "Cursos",                  to: "/cursos" },
  { label: "Estudiantes",             to: "/estudiantes", soloAdministrador: true },
  { label: "Creador Horario",         to: "/horarios" },
  { label: "Horario Maestro",         to: "/horario-maestro" },
  { label: "Horario de Docente",      to: "/mi-horario", soloAdministrador: true },
  { label: "Consulta de Horarios",    to: "/consulta-horarios" },
  { label: "Eventos Institucionales", to: "/bloques-horarios?tab=eventos" },
];

export function enlacesUTP(usuario, rolActivo) {
  const admin = esAdministradorUTP(usuario, rolActivo);
  return ENLACES_UTP.filter((e) => admin || !e.soloAdministrador);
}

/** Etiqueta para listados a partir de la fila de usuario (BD): Administrador_Tipo = 'UTP'. */
export function tieneEtiquetaUTP(fila) {
  return fila?.Administrador_Tipo === ROL_UTP && Boolean(fila?.Es_Administrador || fila?.Es_Docente);
}
