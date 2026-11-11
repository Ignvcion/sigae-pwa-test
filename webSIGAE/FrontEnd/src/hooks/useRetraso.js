import { useCallback, useEffect, useRef } from "react";

// Ejecuta una acción después de una pausa al escribir (filtros que se aplican solos, sin botón).
// `programar(fn)` reinicia la espera; `cancelar()` la descarta. Se limpia al desmontar.
export const RETRASO_FILTRO_MS = 350;

export default function useRetraso(ms = RETRASO_FILTRO_MS) {
  const temporizador = useRef(null);
  const cancelar = useCallback(() => clearTimeout(temporizador.current), []);
  const programar = useCallback((fn) => {
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(fn, ms);
  }, [ms]);
  useEffect(() => cancelar, [cancelar]);
  return { programar, cancelar };
}
