import { createContext, useContext, useState, useEffect, useRef } from "react";

export const AuthContext = createContext();

// Inicialización lazy — lee localStorage una sola vez al montar, sin useEffect
function getInitialState() {
  try {
    return {
      usuario: JSON.parse(localStorage.getItem("usuario")) || null,
      token: localStorage.getItem("token") || null,
      rolActivo: localStorage.getItem("rolActivo") || null,
    };
  } catch {
    return { usuario: null, token: null, rolActivo: null };
  }
}

// Decodifica el campo exp del JWT (no requiere la clave secreta, solo base64)
function getTokenExpiryMs(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function redirectToSessionExpired() {
  localStorage.removeItem("usuario");
  localStorage.removeItem("token");
  localStorage.removeItem("rolActivo");
  window.location.href = "/session-expired";
}

export function AuthProvider({ children }) {
  const initial = getInitialState();

  const [usuario, setUsuario] = useState(initial.usuario);
  const [token, setToken] = useState(initial.token);
  const [rolActivo, setRolActivo] = useState(initial.rolActivo);
  const timerRef = useRef(null);

  // Timer proactivo: redirige a /session-expired cuando el token expira,
  // incluso si el usuario está inactivo y no hace ninguna petición al servidor.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!token) return;

    const expMs = getTokenExpiryMs(token);
    if (!expMs) return;

    const delay = expMs - Date.now();
    if (delay <= 0) {
      // Token ya expirado al cargar/refrescar la página
      redirectToSessionExpired();
      return;
    }

    timerRef.current = setTimeout(redirectToSessionExpired, delay);

    return () => clearTimeout(timerRef.current);
  }, [token]);

  const login = (usuarioData, tokenData) => {
    setUsuario(usuarioData);
    setToken(tokenData);
    localStorage.setItem("usuario", JSON.stringify(usuarioData));
    localStorage.setItem("token", tokenData);
    return usuarioData.roles;
  };

  // Actualiza datos del usuario en sesión (p. ej. el Super Admin corrige su nombre o RUT)
  const actualizarUsuario = (cambios) => {
    setUsuario((actual) => {
      if (!actual) return actual;
      const nuevo = { ...actual, ...cambios };
      localStorage.setItem("usuario", JSON.stringify(nuevo));
      return nuevo;
    });
  };

  const seleccionarRol = (rol) => {
    setRolActivo(rol);
    localStorage.setItem("rolActivo", rol);
  };

  const logout = async () => {
    const currentToken = localStorage.getItem("token");
    if (timerRef.current) clearTimeout(timerRef.current);
    // Invalidar sesión en el servidor (fire-and-forget, no bloquear UI si falla)
    if (currentToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => {});
    }
    setUsuario(null);
    setToken(null);
    setRolActivo(null);
    localStorage.removeItem("usuario");
    localStorage.removeItem("token");
    localStorage.removeItem("rolActivo");
  };

  return (
    <AuthContext.Provider
      value={{ usuario, token, rolActivo, login, logout, seleccionarRol, actualizarUsuario }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}