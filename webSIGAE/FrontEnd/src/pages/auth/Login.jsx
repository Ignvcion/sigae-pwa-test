import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { validarRut, normalizarRut } from "../../utils/validaciones";
import { CampoCodigo, AvisoDevCodigo, textoReenviar } from "../../components/CodigoVerificacion";
import useEspera from "../../hooks/useEspera";

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

function Login() {

  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [rutError, setRutError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Primer ingreso: el backend pide confirmar el correo con un código antes de la sesión
  const [paso, setPaso] = useState("credenciales"); // credenciales | codigo
  const [desafio, setDesafio] = useState("");
  const [correoEnmascarado, setCorreoEnmascarado] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState("");
  const [devCodigo, setDevCodigo] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const [espera, setEspera] = useEspera();

  const navigate = useNavigate();
  const { login } = useAuth();

  const entrar = (user, token) => {
    login(user, token);
    if (user.roles.length > 1) navigate("/seleccionar-rol");
    else navigate("/dashboard");
  };

  const volverACredenciales = (mensaje = "") => {
    setPaso("credenciales");
    setCodigo("");
    setDesafio("");
    setAviso("");
    setDevCodigo("");
    setPassword("");
    setError(mensaje);
  };

  const mostrarPasoCodigo = (data) => {
    setDesafio(data.desafio);
    setCorreoEnmascarado(data.correoEnmascarado);
    setAviso(data.aviso || "");
    setDevCodigo(data.devCodigo || "");
    setCodigo("");
    setError("");
    setEspera(ESPERA_ENTRE_ENVIOS);
    setPaso("codigo");
  };

  const handleRutChange = (e) => {
    const valor = normalizarRut(e.target.value);
    setRut(valor);
    setError("");
    if (valor && !validarRut(valor)) {
      setRutError("RUT inválido");
    } else {
      setRutError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validarRut(rut)) {
      setRutError("RUT inválido");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { res, data } = await postJSON("/api/auth/login", { rut, password });

      if (res.status === 401) {
        const msg = data.error || "";
        if (msg.toLowerCase().includes("deshabilitada")) {
          setError("Tu cuenta está deshabilitada. Contacta al administrador.");
        } else {
          setError("RUT o contraseña incorrectos. Verifica tus datos.");
        }
        return;
      }

      if (!res.ok) {
        // 429 (demasiados intentos o espera entre códigos) y 503 (no se pudo enviar el código) traen su mensaje
        setError(data.error || "Ocurrió un error al iniciar sesión. Intenta nuevamente.");
        return;
      }

      if (data.requiereVerificacion) {
        mostrarPasoCodigo(data);
        return;
      }

      entrar(data.user, data.token);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerificar = async (e) => {
    e.preventDefault();
    if (codigo.length !== 6) {
      setError("El código tiene 6 dígitos.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { res, data } = await postJSON("/api/auth/activacion/verificar", { desafio, codigo });
      if (res.status === 401 || res.status === 409) {
        volverACredenciales(data.error || "Inicia sesión de nuevo.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "No se pudo verificar el código.");
        setCodigo("");
        return;
      }
      entrar(data.user, data.token);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  };

  const handleReenviar = async () => {
    setReenviando(true);
    setError("");
    try {
      const { res, data } = await postJSON("/api/auth/activacion/reenviar", { desafio });
      if (res.status === 429 && data.segundos) {
        setEspera(data.segundos);
        setError(data.error);
        return;
      }
      if (res.status === 400) {
        volverACredenciales(data.error || "La verificación venció. Inicia sesión de nuevo.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "No se pudo reenviar el código.");
        return;
      }
      mostrarPasoCodigo(data);
      setAviso("Te enviamos un código nuevo. El anterior ya no sirve.");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta más tarde.");
    } finally {
      setReenviando(false);
    }
  };

  if (paso === "codigo") {
    return (
      <div className="login-container">
        <form className="login-form" onSubmit={handleVerificar}>
          <div className="login-logo">
            <img src="/logo-colegio.png" alt="Logo Colegio Jacques Cousteau" className="login-logo-img" />
            <p>Activa tu cuenta</p>
          </div>

          <p className="texto-codigo">
            Para terminar de ingresar, confirma tu correo. Te enviamos un código de 6 dígitos a{" "}
            <strong>{correoEnmascarado}</strong> desde <strong>noreply@colegiojc.cl</strong>. Vence en 10 minutos;
            si no lo ves, revisa la carpeta de spam.
          </p>

          {aviso && <div className="success-message">{aviso}</div>}
          {error && <div className="msg-error login-msg">{error}</div>}

          <div className="input-group">
            <label htmlFor="codigo">Código de verificación</label>
            <CampoCodigo id="codigo" value={codigo} onChange={(v) => { setCodigo(v); setError(""); }} disabled={loading} autoFocus />
            <AvisoDevCodigo codigo={devCodigo} />
          </div>

          <button type="submit" disabled={loading || codigo.length !== 6}>
            {loading ? "Verificando..." : "Verificar e ingresar"}
          </button>

          <button type="button" className="btn-enlace" onClick={handleReenviar} disabled={reenviando || espera > 0 || loading}>
            {textoReenviar(espera, reenviando)}
          </button>
          <button type="button" className="btn-enlace" onClick={() => volverACredenciales()} disabled={loading}>
            ← Volver al inicio de sesión
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>

        <div className="login-logo">
          <img src="/logo-colegio.png" alt="Logo Colegio Jacques Cousteau" className="login-logo-img" />
          <p>Sistema de Gestión Académica Escolar</p>
        </div>

        {error && (
          <div className="msg-error login-msg">
            {error}
          </div>
        )}

        <div className="input-group">
          <label htmlFor="rut">RUT</label>
          <input
            id="rut"
            type="text"
            placeholder="Ej: 12345678-9"
            value={rut}
            onChange={handleRutChange}
            className={rutError ? "input-invalid" : ""}
            required
          />
          {rutError && <span className="input-error-msg">{rutError}</span>}
        </div>

        <div className="input-group">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            placeholder="Ingresa tu contraseña"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
        </button>

        <div className="login-links">
          <Link to="/forgot-password">¿Olvidó su contraseña?</Link>
        </div>

      </form>
    </div>
  );
}

export default Login;
