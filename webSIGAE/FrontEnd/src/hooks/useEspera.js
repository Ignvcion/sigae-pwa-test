import { useEffect, useState } from "react";

// Cuenta regresiva en segundos (p. ej. la espera entre envíos de códigos de
// verificación). Devuelve [segundosRestantes, iniciar(segundos)].
export default function useEspera() {
  const [restante, setRestante] = useState(0);

  useEffect(() => {
    if (restante <= 0) return undefined;
    const t = setTimeout(() => setRestante((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restante]);

  return [restante, setRestante];
}
