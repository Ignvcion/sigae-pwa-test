import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary ha capturado un error no controlado:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = window.location.pathname.startsWith("/sigae-pwa-test")
      ? "/sigae-pwa-test/#/dashboard"
      : "/dashboard";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: "2rem 1rem",
          maxWidth: 540,
          margin: "2rem auto",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          border: "1px solid #fee2e2",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>⚠️</div>
          <h2 style={{ color: "#991b1b", fontSize: "1.25rem", margin: "0 0 0.5rem", fontWeight: 700 }}>
            {this.props.title || "Se produjo un problema al mostrar esta vista"}
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
            {this.props.message || "La aplicación encontró una inconsistencia momentánea en los datos. Puedes recargar o regresar al inicio de forma segura."}
          </p>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={this.handleReload}
              style={{
                background: "#1e40af",
                color: "#fff",
                border: "none",
                padding: "0.55rem 1.2rem",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(30,64,175,0.25)"
              }}
            >
              🔄 Recargar vista
            </button>
            <button
              onClick={this.handleHome}
              style={{
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                padding: "0.55rem 1.2rem",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer"
              }}
            >
              🏠 Ir al Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
