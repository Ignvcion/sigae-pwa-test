import { useEffect, useId, useRef, useState } from "react";
import { PALETA_BASICA, normalizarColor, colorAleatorio, nombreColor, textoSobre } from "../utils/colores";
import "./SelectorColor.css";

/**
 * Selector de color de asignaturas y docentes: muestra el color actual y, al
 * hacer clic, un panel con la paleta básica de 12 colores, un selector libre
 * (hex color picker del navegador), el campo hexadecimal y "Al azar".
 *
 * Props:
 *   value     "#RRGGBB"
 *   onChange  (hex) => void. Se llama al elegir de la paleta, al azar o un hexadecimal válido.
 *   usados    colores de los demás (para que "Al azar" elija entre los menos usados)
 *   etiqueta  texto accesible, p. ej. "Color de Matemática"
 *   mostrarHex muestra el hexadecimal junto a la muestra
 *   alinearDerecha abre el panel hacia la izquierda (en la última columna de una tabla)
 *   diferido  para guardar directo en el servidor: los cambios se previsualizan y
 *             onChange se llama UNA vez al cerrar el panel (Listo o clic fuera);
 *             Escape descarta. Sin diferido, onChange se llama en cada cambio.
 */
export default function SelectorColor({
  value, onChange, usados = [], etiqueta = "Color", disabled = false, mostrarHex = false,
  alinearDerecha = false, diferido = false,
}) {
  const color = normalizarColor(value) || PALETA_BASICA[7].hex;
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(color);
  const [borrador, setBorrador] = useState(color);
  const [posicion, setPosicion] = useState(null);
  const boton = useRef(null);
  const borradorRef = useRef(color);
  const contenedor = useRef(null);
  const idPanel = useId();

  const actualizarBorrador = (hex) => {
    borradorRef.current = hex;
    setBorrador(hex);
  };

  // Cierra el panel; en modo diferido, confirma (o descarta) el color elegido
  const cerrar = (confirmar) => {
    setAbierto(false);
    if (diferido && confirmar && borradorRef.current !== color) onChange(borradorRef.current);
    if (diferido && !confirmar) actualizarBorrador(color);
  };
  const cerrarRef = useRef(cerrar);
  useEffect(() => { cerrarRef.current = cerrar; });

  // Cerrar con clic fuera (confirma) o Escape (descarta)
  useEffect(() => {
    if (!abierto) return undefined;
    const alClic = (e) => { if (!contenedor.current?.contains(e.target)) cerrarRef.current(true); };
    const alTeclear = (e) => { if (e.key === "Escape") cerrarRef.current(false); };
    // El panel es fijo en la pantalla (las tablas recortan lo que sobresale): al
    // desplazar la página o cambiar su tamaño (p. ej. el teclado del celular) sigue al botón
    const alMover = () => setPosicion(calcularPosicion(boton.current, alinearDerecha));
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTeclear);
    window.addEventListener("scroll", alMover, true);
    window.addEventListener("resize", alMover);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTeclear);
      window.removeEventListener("scroll", alMover, true);
      window.removeEventListener("resize", alMover);
    };
  }, [abierto, alinearDerecha]);

  const elegir = (hex) => {
    const n = normalizarColor(hex);
    if (!n) return;
    setTexto(n);
    actualizarBorrador(n);
    if (!diferido && n !== color) onChange(n);
  };

  const alternar = () => {
    if (abierto) { cerrar(true); return; }
    setTexto(color);
    actualizarBorrador(color);
    setPosicion(calcularPosicion(boton.current, alinearDerecha));
    setAbierto(true);
  };

  // Lo que se muestra: el borrador mientras el panel está abierto
  const visible = abierto ? borrador : color;

  const textoValido = Boolean(normalizarColor(texto));

  return (
    <div className="selector-color" ref={contenedor}>
      <button
        type="button"
        ref={boton}
        className="selector-color-muestra"
        style={{ background: visible }}
        onClick={alternar}
        disabled={disabled}
        aria-label={`${etiqueta}: ${nombreColor(visible)}. Cambiar color`}
        aria-expanded={abierto}
        aria-controls={idPanel}
        title={`${nombreColor(visible)} (${visible}) · clic para cambiar`}
      />
      {mostrarHex && <span className="selector-color-etiqueta">{visible}</span>}

      {abierto && (
        <div
          id={idPanel}
          className="selector-color-panel"
          style={posicion || undefined}
          role="dialog"
          aria-label={etiqueta}
        >
          <p className="selector-color-titulo">Paleta básica</p>
          <div className="selector-color-paleta">
            {PALETA_BASICA.map((c) => (
              <button
                key={c.hex}
                type="button"
                className="selector-color-celda"
                style={{ background: c.hex, color: textoSobre(c.hex) }}
                aria-pressed={c.hex === visible}
                aria-label={c.nombre}
                title={`${c.nombre} (${c.hex})`}
                onClick={() => { elegir(c.hex); cerrar(true); }}
              >
                {c.hex === visible ? "✓" : ""}
              </button>
            ))}
          </div>

          <p className="selector-color-titulo">Personalizado</p>
          <div className="selector-color-personalizado">
            <input
              type="color"
              value={visible.toLowerCase()}
              onChange={(e) => elegir(e.target.value)}
              aria-label="Elegir cualquier color"
            />
            <input
              type="text"
              value={texto}
              maxLength={7}
              spellCheck={false}
              className={textoValido ? "" : "invalido"}
              aria-label="Color hexadecimal"
              aria-invalid={!textoValido}
              placeholder="#2563EB"
              onChange={(e) => {
                setTexto(e.target.value);
                if (normalizarColor(e.target.value)) elegir(e.target.value);
              }}
            />
          </div>
          {!textoValido && <div className="selector-color-error">Formato #RRGGBB (6 dígitos hexadecimales)</div>}

          <div className="selector-color-acciones">
            <button type="button" onClick={() => elegir(colorAleatorio(usados))} title="Un color de la paleta, entre los menos usados">
              🎲 Al azar
            </button>
            <button type="button" onClick={() => cerrar(true)}>Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ANCHO_PANEL = 236;
const ALTO_PANEL = 290;
const MARGEN = 8;

/** Posición fija del panel junto al botón, dentro de la ventana (abajo o, si no cabe, arriba). */
function calcularPosicion(boton, alinearDerecha) {
  if (!boton) return null;
  const r = boton.getBoundingClientRect();
  const anchoVentana = window.innerWidth;
  const altoVentana = window.innerHeight;
  let left = alinearDerecha ? r.right - ANCHO_PANEL : r.left;
  left = Math.max(MARGEN, Math.min(left, anchoVentana - ANCHO_PANEL - MARGEN));
  const cabeAbajo = r.bottom + 6 + ALTO_PANEL <= altoVentana - MARGEN || r.top < ALTO_PANEL + MARGEN;
  return cabeAbajo
    ? { position: "fixed", left, top: r.bottom + 6 }
    : { position: "fixed", left, bottom: altoVentana - r.top + 6 };
}

/** Punto de color junto al nombre de un docente o una asignatura. */
export function PuntoColor({ color, titulo }) {
  if (!color) return null;
  return <span className="punto-color" style={{ background: color }} title={titulo} aria-hidden="true" />;
}
