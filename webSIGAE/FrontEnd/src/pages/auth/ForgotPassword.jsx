import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { validarRut, normalizarRut } from "../../utils/validaciones";
import { CampoCodigo, AvisoDevCodigo, textoReenviar } from "../../components/CodigoVerificacion";
import useEspera from "../../hooks/useEspera";

// CU14: recuperar la contraseña con un código de 6 dígitos enviado desde
// noreply@colegiojc.cl.
// Pasos: "rut" → "seleccionar" (si hay varios correos) → "codigo" (código y
// nueva contraseña) → "listo".
const ESPERA_ENTRE_ENVIOS = 60;

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function validarNuevaContrasena(nueva, confirmacion) {
  const e = {};
  if (nueva.length < 8) e.newPassword = "Mínimo 8 caracteres";
  else if (!/[A-Z]/.test(nueva)) e.newPassword = "Debe contener al menos una mayúscula";
  else if (!/[0-9]/.test(nueva)) e.newPassword = "Debe contener al menos un número";
  if (nueva !== confirmacion) e.confirmPassword = "Las contraseñas no coinciden";
  return e;
}

function ForgotPassword() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState("rut");
  const [rut, setRut] = useState("");
  const [rutError, setRutError] = useState("");
  const [correos, setCorreos] = useState([]);
  const [correoSeleccionado, setCorreoSeleccionado] = useState("");
  const [correoDestino, setCorreoDestino] = useState(""); // enmascarado, para el texto
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [devCodigo, setDevCodigo] = useState("");

  const [codigo, setCodigo] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errores, setErrores] = useState({});
  const [reenviando, setReenviando] = useState(false);
  const [espera, setEspera] = useEspera();

  const rutNormalizado = () => normalizarRut(rut);

  const handleRutChange = (e) => {
    const valor = e.target.value;
    setRut(valor);
    setError("");
    setRutError(valor && !validarRut(valor) ? "RUT inválido (ej: 12345678-9)" : "");
  };

  // Pide el código al backend. `enmascarado` es el correo elegido (null si hay uno solo).
  const enviarCodigo = async (enmascarado) => {
    const body = enmascarado
      ? { rut: rutNormalizado(), correoEnmascarado: enmascarado }
      : { rut: rutNormalizado() };
    const { res, data } = await postJSON("/api/auth/forgot-password", body);
    if (res.status === 429 && data.segundos) {
      setEspera(data.segundos);
      throw new Error(data.error);
    }
    if (!res.ok) throw new Error(data.error || "Error al enviar el código");
    setDevCodigo(data.devCodigo || "");
    setEspera(ESPERA_ENTRE_ENVIOS);
  };

  const irAPasoCodigo = (enmascarado) => {
    setCorreoDestino(enmascarado || "");
    setCodigo("");
    setPaso("codigo");
  };

  const handleSubmitRut = async (e) => {
    e.preventDefault();
    if (!validarRut(rutNormalizado())) {
      setRutError("RUT inválido");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { res, data } = await postJSON("/api/auth/check-recovery-emails", { rut: rutNormalizado() });
      if (!res.ok) throw new Error(data.error || "Error al consultar");

      const lista = data.correos || [];
      if (lista.length === 0) {
        // No se revela si el RUT existe: se sigue al paso del código con el texto genérico
        irAPasoCodigo(null);
      } else if (lista.length === 1) {
        await enviarCodigo(null);
        irAPasoCodigo(lista[0].enmascarado);
      } else {
        setCorreos(lista);
        setCorreoSeleccionado(lista[0].enmascarado);
        setPaso("seleccionar");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSeleccion = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await enviarCodigo(correoSeleccionado);
      irAPasoCodigo(correoSeleccionado);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReenviar = async () => {
    setReenviando(true);
    setError("");
    setAviso("");
    try {
      await enviarCodigo(correos.length > 1 ? correoSeleccionado : null);
      setCodigo("");
      setAviso("Te enviamos un código nuevo. El anterior ya no sirve.");
    } catch (err) {
      setError(err.message);
    } finally {
      setReenviando(false);
    }
  };

  const handleSubmitCodigo = async (e) => {
    e.preventDefault();
    setError("");
    setAviso("");
    const e2 = validarNuevaContrasena(newPassword, confirmPassword);
    if (codigo.length !== 6) e2.codigo = "El código tiene 6 dígitos";
    setErrores(e2);
    if (Object.keys(e2).length > 0) return;

    setLoading(true);
    try {
      const { res, data } = await postJSON("/api/auth/reset-password", {
        rut: rutNormalizado(), codigo, newPassword,
      });
      if (!res.ok) {
        setCodigo("");
        throw new Error(data.error || "Error al restablecer la contraseña");
      }
      setPaso("listo");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = { rut: handleSubmitRut, seleccionar: handleSubmitSeleccion, codigo: handleSubmitCodigo }[paso];

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={onSubmit || ((e) => e.preventDefault())}>
        <h1>{paso === "listo" ? "¡Contraseña actualizada!" : "Recuperar Contraseña"}</h1>

        {paso === "rut" && (
          <>
            <p>
              Ingresa tu RUT para identificar tu cuenta. Te enviaremos un código de verificación a tu correo.
            </p>

            <div className="input-group">
              <label htmlFor="rut">RUT</label>
              <input
                id="rut"
                type="text"
                placeholder="Ej: 12345678-9"
                value={rut}
                onChange={handleRutChange}
                className={rutError ? "input-invalid" : ""}
                disabled={loading}
                required
              />
              {rutError && <span className="input-error-msg">{rutError}</span>}
            </div>

            {error && <p className="error-message">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? "Consultando..." : "Continuar"}
            </button>
          </>
        )}

        {paso === "seleccionar" && (
          <>
            <p>
              Tu cuenta tiene más de un correo registrado. Elige a cuál deseas que se envíe el código:
            </p>

            <div className="input-group">
              <label htmlFor="correo-select">Correo destino</label>
              <select
                id="correo-select"
                value={correoSeleccionado}
                onChange={(e) => setCorreoSeleccionado(e.target.value)}
                disabled={loading}
              >
                {correos.map((c) => (
                  <option key={c.enmascarado} value={c.enmascarado}>
                    {c.tipo}: {c.enmascarado}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="error-message">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar código"}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setPaso("rut"); setError(""); }}
              disabled={loading}
              style={{ marginTop: "0.5rem" }}
            >
              ← Cambiar RUT
            </button>
          </>
        )}

        {paso === "codigo" && (
          <>
            <p className="texto-codigo">
              {correoDestino
                ? <>Te enviamos un código de 6 dígitos a <strong>{correoDestino}</strong></>
                : <>Si el RUT corresponde a una cuenta activa, te enviamos un código de 6 dígitos</>}
              {" "}desde <strong>noreply@colegiojc.cl</strong>. Vence en 10 minutos; si no lo ves, revisa la carpeta de spam.
            </p>

            {aviso && <div className="success-message">{aviso}</div>}
            {error && <div className="error-message">{error}</div>}

            <div className="input-group">
              <label htmlFor="codigo">Código de verificación</label>
              <CampoCodigo
                id="codigo"
                value={codigo}
                onChange={(v) => { setCodigo(v); setErrores((p) => ({ ...p, codigo: "" })); }}
                disabled={loading}
                className={errores.codigo ? "input-invalid" : ""}
                autoFocus
              />
              {errores.codigo && <span className="input-error-msg">{errores.codigo}</span>}
              <AvisoDevCodigo codigo={devCodigo} />
            </div>

            <p style={{ fontSize: "0.9rem", color: "#475569" }}>
              Nueva contraseña: mínimo 8 caracteres, al menos una mayúscula y un número.
            </p>

            <div className="input-group">
              <label htmlFor="new-password">Nueva contraseña</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setErrores((p) => ({ ...p, newPassword: "" })); }}
                className={errores.newPassword ? "input-invalid" : ""}
                disabled={loading}
                required
              />
              {errores.newPassword && <span className="input-error-msg">{errores.newPassword}</span>}
            </div>

            <div className="input-group">
              <label htmlFor="confirm-password">Confirmar contraseña</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrores((p) => ({ ...p, confirmPassword: "" })); }}
                className={errores.confirmPassword ? "input-invalid" : ""}
                disabled={loading}
                required
              />
              {errores.confirmPassword && <span className="input-error-msg">{errores.confirmPassword}</span>}
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Cambiar contraseña"}
            </button>

            {correoDestino && (
              <button type="button" className="btn-enlace" onClick={handleReenviar} disabled={reenviando || espera > 0 || loading}>
                {textoReenviar(espera, reenviando)}
              </button>
            )}
          </>
        )}

        {paso === "listo" && (
          <>
            <div className="success-message">
              Tu contraseña fue restablecida y se cerraron las sesiones abiertas. Ya puedes iniciar sesión con tu
              nueva contraseña.
            </div>
            <button type="button" onClick={() => navigate("/")} style={{ marginTop: "1rem", width: "100%" }}>
              Ir al inicio de sesión
            </button>
          </>
        )}

        {paso !== "listo" && (
          <Link to="/" style={{ marginTop: "1rem", display: "block", textAlign: "center" }}>
            ← Volver al inicio de sesión
          </Link>
        )}
      </form>
    </div>
  );
}

export default ForgotPassword;
