// Piezas comunes de los códigos de verificación de 6 dígitos que envía
// noreply@colegiojc.cl: recuperar contraseña, activar la cuenta y confirmar
// un cambio de correo.

/** Campo para el código: solo dígitos (máx. 6) y autocompletado del código de un solo uso. */
export function CampoCodigo({ id, value, onChange, disabled, autoFocus, className = "" }) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`campo-codigo ${className}`.trim()}
      required
    />
  );
}

/** Solo en desarrollo sin SMTP: el backend devuelve el código para poder probar el flujo. */
export function AvisoDevCodigo({ codigo }) {
  if (!codigo) return null;
  return (
    <div className="aviso-dev-codigo">
      Modo desarrollo (sin SMTP): el código es <strong>{codigo}</strong>
    </div>
  );
}

/** Texto del botón para pedir otro código, con la espera entre envíos. */
export function textoReenviar(segundos, enviando) {
  if (enviando) return "Enviando...";
  return segundos > 0 ? `Reenviar código (${segundos} s)` : "Reenviar código";
}
