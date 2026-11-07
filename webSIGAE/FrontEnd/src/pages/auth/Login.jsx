import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { validarRut, normalizarRut } from "../../utils/validaciones";
import { BASE_URL } from "../../services/api";

function Login() {

  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [rutError, setRutError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

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
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut, password }),
      });

      if (res.status === 401) {
        const data = await res.json();
        const msg = data.error || "";
        if (msg.toLowerCase().includes("deshabilitada")) {
          setError("Tu cuenta está deshabilitada. Contacta al administrador.");
        } else {
          setError("RUT o contraseña incorrectos. Verifica tus datos.");
        }
        return;
      }

      if (!res.ok) {
        setError("Ocurrió un error al iniciar sesión. Intenta nuevamente.");
        return;
      }

      const { user, token } = await res.json();
      login(user, token);
      if (user.roles.length > 1) navigate("/seleccionar-rol");
      else navigate("/dashboard");

    } catch {
      setError("No se pudo conectar con el servidor. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  };

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
