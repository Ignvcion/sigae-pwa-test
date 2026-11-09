import { useId, useMemo, useRef, useState } from "react";
import "./EtiquetasInput.css";

// Selector de etiquetas al estilo Notion (RF04: especialidades del docente).
// - Muestra las etiquetas elegidas como chips, con × para quitarlas.
// - Al escribir sugiere las etiquetas existentes del catálogo y ofrece crear una nueva.
// - Enter o coma agregan; Retroceso con el campo vacío quita la última.
// - No distingue mayúsculas ni tildes: "matematicas" elige "Matemáticas" si ya existe.

const normalizar = (t) =>
  String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const limpiar = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

function EtiquetasInput({
  valores = [],
  onChange,
  opciones = [],
  placeholder = "Escribe para buscar o crear…",
  max = 6,
  maxLargo = 40,
  invalido = false,
  id,
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [aviso, setAviso] = useState("");
  const inputRef = useRef(null);
  const listaId = useId();

  const elegidas = useMemo(() => new Set(valores.map(normalizar)), [valores]);
  const consulta = normalizar(texto);

  const sugerencias = useMemo(
    () => opciones.filter((o) => !elegidas.has(normalizar(o)) && normalizar(o).includes(consulta)),
    [opciones, elegidas, consulta]
  );
  const existeIgual = opciones.some((o) => normalizar(o) === consulta) || elegidas.has(consulta);
  const puedeCrear = consulta.length > 0 && !existeIgual;
  const items = [
    ...sugerencias.map((o) => ({ tipo: "opcion", valor: o })),
    ...(puedeCrear ? [{ tipo: "crear", valor: limpiar(texto) }] : []),
  ];

  const agregar = (nombre) => {
    const limpio = limpiar(nombre).replace(/,/g, "");
    if (!limpio) return;
    if (elegidas.has(normalizar(limpio))) {
      setTexto("");
      return;
    }
    if (valores.length >= max) {
      setAviso(`Máximo ${max} especialidades`);
      return;
    }
    if (limpio.length < 2 || limpio.length > maxLargo) {
      setAviso(`Cada etiqueta debe tener entre 2 y ${maxLargo} caracteres`);
      return;
    }
    // Si ya existe en el catálogo (sin distinguir mayúsculas ni tildes), se usa ese nombre
    const existente = opciones.find((o) => normalizar(o) === normalizar(limpio));
    onChange([...valores, existente || limpio]);
    setTexto("");
    setActivo(0);
    setAviso("");
    // Se cierra la lista para no tapar lo que sigue (p. ej. el botón Guardar);
    // vuelve a abrirse al escribir o al hacer clic en el campo
    setAbierto(false);
  };

  const quitar = (nombre) => {
    onChange(valores.filter((v) => v !== nombre));
    setAviso("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (abierto && items[activo]) agregar(items[activo].valor);
      else agregar(texto);
    } else if (e.key === "Backspace" && texto === "" && valores.length > 0) {
      quitar(valores[valores.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  const mostrarLista = abierto && items.length > 0;

  return (
    <div className="etiquetas">
      <div
        className={`etiquetas-campo${invalido ? " etiquetas-campo--invalido" : ""}`}
        onClick={() => { inputRef.current?.focus(); setAbierto(true); }}
      >
        {valores.map((v) => (
          <span key={v} className="etiqueta-chip">
            {v}
            <button
              type="button"
              className="etiqueta-quitar"
              aria-label={`Quitar ${v}`}
              onClick={(e) => { e.stopPropagation(); quitar(v); }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          className="etiquetas-texto"
          value={texto}
          placeholder={valores.length === 0 ? placeholder : ""}
          maxLength={maxLargo}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0); setAviso(""); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
        />
      </div>

      {mostrarLista && (
        <ul className="etiquetas-lista" id={listaId} role="listbox">
          {items.map((it, i) => (
            <li
              key={`${it.tipo}-${it.valor}`}
              role="option"
              aria-selected={i === activo}
              className={`etiquetas-opcion${i === activo ? " etiquetas-opcion--activa" : ""}`}
              // mousedown evita que el blur del campo cierre la lista antes del clic
              onMouseDown={(e) => { e.preventDefault(); agregar(it.valor); }}
              onMouseEnter={() => setActivo(i)}
            >
              {it.tipo === "crear" ? (
                <>Crear <span className="etiqueta-chip etiqueta-chip--nueva">{it.valor}</span></>
              ) : (
                <span className="etiqueta-chip">{it.valor}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <span className={aviso ? "input-error-msg" : "etiquetas-ayuda"}>
        {aviso || "Elige de la lista o escribe una nueva y presiona Enter."}
      </span>
    </div>
  );
}

/** "Matemáticas, Física" (resumen guardado en el docente) → ["Matemáticas", "Física"] */
export function separarEtiquetas(texto) {
  return String(texto ?? "").split(",").map(limpiar).filter(Boolean);
}

/** Etiquetas de solo lectura (listados y perfil). */
export function EtiquetasLectura({ texto, vacio = "Sin especialidad registrada" }) {
  const etiquetas = separarEtiquetas(texto);
  if (etiquetas.length === 0) return <span className="dato-sin-registrar">{vacio}</span>;
  return (
    <span className="etiquetas-lectura">
      {etiquetas.map((e) => <span key={e} className="etiqueta-chip">{e}</span>)}
    </span>
  );
}

export default EtiquetasInput;
