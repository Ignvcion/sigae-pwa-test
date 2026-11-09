// Reglas de asociación de apoderados en el frontend (RF07, RF16, RF57).
//
// Un apoderado que quedó sin estudiantes queda inactivo y marcado con el período en que
// ocurrió (Apoderado_Sin_Asociaciones_Desde). Asociarle un estudiante lo reactiva. Una
// cuenta desactivada a mano (sin esa marca) no se puede asociar.

export const inactivoPorFaltaDeAsociacion = (a) =>
  Boolean(a && !a.Usuario_Estado_Cuenta && a.Apoderado_Sin_Asociaciones_Desde);

export const puedeAsociarse = (a) => Boolean(a && (a.Usuario_Estado_Cuenta || inactivoPorFaltaDeAsociacion(a)));

/** Nombre para los selectores, avisando cuando la asociación reactivará la cuenta. */
export const etiquetaApoderado = (a) =>
  inactivoPorFaltaDeAsociacion(a)
    ? `${a.Usuario_Nombre_Completo} (inactivo: se reactivará al asociarlo)`
    : a.Usuario_Nombre_Completo;
