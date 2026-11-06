// services/promocion.js
// RF60 (profesor jefe), RF61 (situación final y promoción) y cambio de período.
// Usa apiFetch, que maneja la sesión expirada.
import { apiFetch } from "./api";

async function json(metodo, url, cuerpo) {
  const res = await apiFetch(url, {
    method: metodo,
    headers: cuerpo !== undefined ? { "Content-Type": "application/json" } : {},
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  if (!res) return null; // sesión expirada: apiFetch ya redirigió
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.mensaje || data.error || `Error ${res.status}`);
    error.data = data;
    error.status = res.status;
    throw error;
  }
  return data;
}

/** Descarga un archivo protegido (Excel) con el token y lo guarda con su nombre. */
export async function descargarArchivo(url, nombrePorDefecto) {
  const res = await apiFetch(url);
  if (!res) return;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.mensaje || data.error || "No fue posible descargar el archivo");
  }
  const disposicion = res.headers.get("Content-Disposition") || "";
  const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] || nombrePorDefecto;
  const blob = await res.blob();
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// ── RF60: profesor jefe (CU95, CU96) y estudiantes del curso (CU97) ──
export const getDocentesActivos = () => json("GET", "/api/horarios/docentes");
export const designarProfesorJefe = (cursoId, cuerpo) => json("PUT", `/api/cursos/${cursoId}/profesor-jefe`, cuerpo);
export const retirarProfesorJefe = (cursoId, cuerpo = {}) => json("DELETE", `/api/cursos/${cursoId}/profesor-jefe`, cuerpo);
export const getEstudiantesDeCurso = (cursoId) => json("GET", `/api/cursos/${cursoId}/estudiantes`);
export const getMisJefaturas = () => json("GET", "/api/cursos/mis-jefaturas");

// ── RF61: situación final (CU98, CU99) y promoción (CU100) ──
export const getSituaciones = (cursoId) => json("GET", `/api/promocion/cursos/${cursoId}/situaciones`);
export const registrarSituaciones = (cursoId, situaciones, confirmar) =>
  json("PUT", `/api/promocion/cursos/${cursoId}/situaciones`, { situaciones, confirmar });
export const descargarPlantilla = (cursoId) =>
  descargarArchivo(`/api/promocion/cursos/${cursoId}/plantilla`, "situacion_final.xlsx");

export async function cargarExcel(cursoId, archivo, confirmar) {
  const datos = new FormData();
  datos.append("archivo", archivo);
  const res = await apiFetch(`/api/promocion/cursos/${cursoId}/situaciones/excel${confirmar ? "?confirmar=true" : ""}`, {
    method: "POST",
    body: datos,
  });
  if (!res) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.mensaje || data.error || "No fue posible procesar el archivo");
  return data;
}

export const promoverCurso = (cursoId, cuerpo) => json("POST", `/api/promocion/cursos/${cursoId}/promover`, cuerpo);

// ── Cambio de período ──
export const getEstadoPeriodo = () => json("GET", "/api/promocion/periodos/estado");
export const iniciarCierre = () => json("POST", "/api/promocion/periodos/iniciar-cierre", {});
export const descargarRespaldo = () => descargarArchivo("/api/promocion/periodos/respaldo", "respaldo_cambio_periodo.xlsx");
export const iniciarNuevoPeriodo = () => json("POST", "/api/promocion/periodos/iniciar-nuevo", { confirmarRespaldo: true });
