import { useState } from "react";

/* ── Export helpers (CU60-62) ─────────────────────────────────── */
function authHeadersGet() {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

async function descargarArchivo(url, nombreArchivo) {
  const res = await fetch(url, { headers: authHeadersGet() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error al exportar el horario");
  }
  const blob = await res.blob();
  if (blob.type && blob.type.includes("json")) {
    const text = await blob.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed.error || parsed.mensaje) {
        throw new Error(parsed.error || parsed.mensaje);
      }
    } catch (err) {
      if (err.message && err.message !== "Unexpected end of JSON input") throw err;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

const EXT_POR_FORMATO = { pdf: "pdf", excel: "xlsx", csv: "csv", png: "png" };

/* ── Menú desplegable de exportación (CU60/61/62) ─────────────── */
export default function ExportMenu({ label, url, filenameBase, disabled }) {
  const [abierto, setAbierto] = useState(false);
  const [exportando, setExportando] = useState(null);
  const [error, setError] = useState("");

  const exportar = async (formato) => {
    setExportando(formato);
    setError("");
    try {
      await descargarArchivo(`${url}?formato=${formato}`, `${filenameBase}.${EXT_POR_FORMATO[formato]}`);
      setAbierto(false);
    } catch (e) {
      setError(e.message || "Error al exportar");
    } finally {
      setExportando(null);
    }
  };

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setAbierto((v) => !v)}
        disabled={disabled}
        style={{
          padding: "0.35rem 0.85rem",
          borderRadius: "6px",
          border: "1px solid #93c5fd",
          background: abierto ? "#4f46e5" : "#fff",
          color: abierto ? "#fff" : "#4f46e5",
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 600,
          fontSize: "0.82rem",
          whiteSpace: "nowrap",
          opacity: disabled ? 0.5 : 1,
          transition: "all 0.15s",
        }}
      >
        ⬇ {label}
      </button>
      {abierto && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
            zIndex: 60,
            minWidth: 180,
            overflow: "hidden",
          }}
        >
          {[
            { key: "pdf", label: "📄 PDF" },
            { key: "excel", label: "📊 Excel" },
            { key: "csv", label: "📋 CSV" },
            { key: "png", label: "🖼 Imagen (PNG)" },
          ].map((op) => (
            <button
              key={op.key}
              onClick={() => exportar(op.key)}
              disabled={exportando !== null}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.5rem 0.85rem",
                border: "none",
                borderBottom: "1px solid #f3f4f6",
                background: "#fff",
                cursor: exportando !== null ? "default" : "pointer",
                fontSize: "0.85rem",
                color: "#374151",
              }}
              onMouseEnter={(e) => { if (!exportando) e.currentTarget.style.background = "#f0f4ff"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {exportando === op.key ? "Generando..." : op.label}
            </button>
          ))}
          {error && (
            <div style={{ padding: "0.45rem 0.85rem", fontSize: "0.74rem", color: "#dc2626", background: "#fee2e2" }}>
              {error}
            </div>
          )}
        </div>
      )}
      {/* Cierra el menú al hacer clic fuera */}
      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
        />
      )}
    </div>
  );
}
