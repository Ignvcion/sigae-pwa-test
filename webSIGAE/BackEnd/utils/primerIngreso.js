// utils/primerIngreso.js
// Toda cuenta se registra INACTIVA (Usuario_Estado_Cuenta = 0) y pasa a activa
// al completar su primer inicio de sesión. Sin columnas nuevas, una cuenta
// "espera su primer ingreso" cuando:
//   - está inactiva,
//   - nunca ha tenido una sesión (tabla `sesion`), y
//   - no fue inactivada por quedar sin estudiantes asociados
//     (Apoderado_Sin_Asociaciones_Desde, cambio de período).
// Mientras espera su primer ingreso puede iniciar sesión (y recuperar su
// contraseña), y la administración puede asignarla igual que a una cuenta
// activa: asociar estudiantes a un apoderado, asignar clases o jefaturas a un
// docente, etc.

/** Condición SQL: la cuenta (tabla o alias `t`) espera su primer ingreso. */
function esperaPrimerIngresoSQL(t = 'usuario') {
  return `(${t}.Usuario_Estado_Cuenta = 0 AND ${t}.Apoderado_Sin_Asociaciones_Desde IS NULL`
    + ` AND NOT EXISTS (SELECT 1 FROM sesion s_pi WHERE s_pi.Usuario_Id = ${t}.Usuario_Id))`;
}

/** Condición SQL: cuenta utilizable (activa o a la espera de su primer ingreso). */
function cuentaUtilizableSQL(t = 'usuario') {
  return `(${t}.Usuario_Estado_Cuenta = 1 OR ${esperaPrimerIngresoSQL(t)})`;
}

/** Columna para un SELECT: Espera_Primer_Ingreso (1/0). */
function columnaEsperaPrimerIngreso(t = 'usuario') {
  return `${esperaPrimerIngresoSQL(t)} AS Espera_Primer_Ingreso`;
}

/** Fila de usuario (con Espera_Primer_Ingreso) activa o a la espera de su primer ingreso. */
function cuentaUtilizable(usuario) {
  return Boolean(usuario && (usuario.Usuario_Estado_Cuenta || usuario.Espera_Primer_Ingreso));
}

module.exports = {
  esperaPrimerIngresoSQL,
  cuentaUtilizableSQL,
  columnaEsperaPrimerIngreso,
  cuentaUtilizable,
};
