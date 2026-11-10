import { useEffect, useMemo, useState } from "react";
import { tonosDesdeHex } from "../utils/colores";

// Colores de asignaturas y docentes (GET /api/colores), compartidos por todas
// las vistas. Se piden una vez por sesión de página y se actualizan al
// cambiarlos en Asignaturas o Docentes (fijarColor).
let datos = null;   // { asignaturas: { id: hex }, docentes: { id: hex } }
let pendiente = null;
const suscriptores = new Set();

const avisar = () => suscriptores.forEach((fn) => fn(datos));

function cargar() {
  if (datos) return Promise.resolve(datos);
  if (!pendiente) {
    pendiente = fetch("/api/colores", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        datos = d && { asignaturas: d.asignaturas || {}, docentes: d.docentes || {} };
        avisar();
        return datos;
      })
      .catch(() => null)
      .finally(() => { pendiente = null; });
  }
  return pendiente;
}

/** Actualiza el color en memoria después de guardarlo (tipo: "asignaturas" | "docentes"). */
export function fijarColor(tipo, id, hex) {
  datos = datos || { asignaturas: {}, docentes: {} };
  datos = { ...datos, [tipo]: { ...datos[tipo], [id]: hex } };
  avisar();
}

/**
 * Devuelve funciones para pintar con los colores guardados:
 *   tonosAsignatura(id) → { bg, border, text, solido } o null si no se conoce
 *   colorDocente(id)    → "#RRGGBB" o null
 * Sin datos (cargando o sin conexión) devuelve null y cada vista usa su color de respaldo.
 */
export default function useColores() {
  const [actual, setActual] = useState(datos);

  useEffect(() => {
    suscriptores.add(setActual);
    cargar();
    return () => { suscriptores.delete(setActual); };
  }, []);

  // Las funciones cambian solo cuando cambian los colores (sirven como dependencia de useMemo)
  return useMemo(() => ({
    cargado: Boolean(actual),
    tonosAsignatura: (idAsignatura) => {
      const hex = actual?.asignaturas?.[idAsignatura];
      return hex ? tonosDesdeHex(hex) : null;
    },
    colorDocente: (idDocente) => actual?.docentes?.[idDocente] || null,
  }), [actual]);
}
