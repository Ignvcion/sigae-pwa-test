import { useCallback, useEffect, useRef, useState } from "react";
import { COLORES_ASIGNATURA, COLOR_PENDIENTE, hhmm } from "../../utils/horarios";
import useColores from "../../hooks/useColores";
import { apiUrl } from '../../services/api';

// Panel desplegable (derecha) con las clases pendientes de reubicar tras
// redefinir la jornada o los bloques horarios. Por cada clase: migrar a un
// bloque vigente, eliminarla o decidir más tarde.
//
// Migrar y eliminar se guardan en la base, así que todos los administradores
// ven el mismo listado (se refresca cada 30 s y al volver a la pestaña).
// "Más tarde" es una preferencia personal: se guarda solo en este navegador y
// deja la tarjeta gris, al fondo de la lista, durante 15 minutos. La tarjeta
// recupera sus colores mientras se interactúa con ella: al pasar el mouse,
// al enfocar o usar sus botones o al seleccionar su texto.

const API = "/api/bloques/conflictos";
const CLAVE_POSPUESTAS = "sigae.conflictosHorario.pospuestas";
const MINUTOS_POSPONER = 15;
const REFRESCO_MS = 30_000;

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

function leerPospuestas() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_POSPUESTAS) || "{}");
    const ahora = Date.now();
    return Object.fromEntries(Object.entries(datos).filter(([, hasta]) => hasta > ahora));
  } catch {
    return {};
  }
}

function guardarPospuestas(pospuestas) {
  try {
    localStorage.setItem(CLAVE_POSPUESTAS, JSON.stringify(pospuestas));
  } catch {
    // Sin almacenamiento disponible: la preferencia dura solo esta sesión
  }
}

const etiquetaBloque = (d) =>
  `${hhmm(d.Bloque_Horario_Hora_Inicio)}–${hhmm(d.Bloque_Horario_Hora_Fin)} · ${d.Bloque_Horario_Jornada}`;

/**
 * Props:
 * - abrirSenal: número; cada vez que cambia, el panel se despliega.
 * - bloqueAEliminar: { id, etiqueta } cuando se quiere quitar un bloque que
 *   aún tiene clases; esas clases se listan aparte hasta resolverlas.
 * - onEliminarBloque(id), onCancelarEliminarBloque(): acciones de esa sección.
 * - onCambio(): se llama tras migrar o eliminar, para recargar la vista.
 */
export default function PanelConflictos({
  abrirSenal = 0,
  bloqueAEliminar = null,
  onEliminarBloque,
  onCancelarEliminarBloque,
  onCambio,
}) {
  const { tonosAsignatura } = useColores();
  const [abierto, setAbierto] = useState(false);
  const [clases, setClases] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [coloresCurso, setColoresCurso] = useState({});
  const [accion, setAccion] = useState({});     // { [id]: "migrar" | "eliminar" }
  const [destinoSel, setDestinoSel] = useState({});
  const [enviando, setEnviando] = useState(null);
  const [errorCard, setErrorCard] = useState({});
  const [errorBloque, setErrorBloque] = useState("");
  const [pospuestas, setPospuestas] = useState(leerPospuestas);
  const [, setReloj] = useState(0);
  const [conSeleccion, setConSeleccion] = useState(null); // tarjeta con texto seleccionado
  const cursosCargados = useRef(new Set());
  const bloqueId = bloqueAEliminar?.id || null;

  const cargar = useCallback(async () => {
    try {
      const url = bloqueId ? `${API}?bloque=${bloqueId}` : API;
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClases(data.clases || []);
      setDestinos(data.destinos || []);
      setError("");
    } catch (e) {
      setError(e.message || "No fue posible cargar las clases pendientes");
    }
  }, [bloqueId]);

  // Carga inicial, refresco periódico y al volver a la pestaña
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    const alEnfocar = () => cargar();
    window.addEventListener("focus", alEnfocar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("focus", alEnfocar);
    };
  }, [cargar]);

  // El padre pide desplegar el panel (cambio de jornada, bloque reemplazado, etc.)
  useEffect(() => {
    if (abrirSenal > 0 || bloqueId) setAbierto(true);
  }, [abrirSenal, bloqueId]);

  // Reloj para que las tarjetas pospuestas vuelvan solas al cumplirse los 15 min
  useEffect(() => {
    const t = setInterval(() => {
      setPospuestas(leerPospuestas());
      setReloj((n) => n + 1);
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // Una tarjeta pospuesta vuelve a verse a color mientras tenga texto seleccionado
  useEffect(() => {
    const alSeleccionar = () => {
      const sel = window.getSelection();
      const nodo = sel && !sel.isCollapsed ? sel.anchorNode : null;
      const tarjeta = nodo && (nodo.nodeType === 1 ? nodo : nodo.parentElement)?.closest("[data-clase-id]");
      setConSeleccion(tarjeta ? Number(tarjeta.dataset.claseId) : null);
    };
    document.addEventListener("selectionchange", alSeleccionar);
    return () => document.removeEventListener("selectionchange", alSeleccionar);
  }, []);

  // Mismos colores por asignatura que el creador de horarios (orden del plan del curso)
  useEffect(() => {
    const faltantes = [...new Set(clases.map((c) => c.Curso_Id))].filter((id) => !cursosCargados.current.has(id));
    faltantes.forEach((cursoId) => {
      cursosCargados.current.add(cursoId);
      fetch(apiUrl(`/api/horarios/asignaturas-curso?curso_id=${cursoId}`), { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : []))
        .then((lista) => {
          const mapa = {};
          (Array.isArray(lista) ? lista : []).forEach((a, i) => {
            mapa[a.Asignatura_Id] = COLORES_ASIGNATURA[i % COLORES_ASIGNATURA.length];
          });
          setColoresCurso((prev) => ({ ...prev, [cursoId]: mapa }));
        })
        .catch(() => {});
    });
  }, [clases]);

  const eliminarBloque = async () => {
    setErrorBloque("");
    try {
      await onEliminarBloque?.(bloqueAEliminar.id);
    } catch (e) {
      setErrorBloque(e.message);
    }
  };

  const mostrarAviso = (texto) => {
    setAviso(texto);
    setTimeout(() => setAviso(""), 4000);
  };

  const abrirAccion = (id, tipo) => {
    setAccion((p) => ({ ...p, [id]: tipo }));
    setErrorCard((p) => ({ ...p, [id]: "" }));
  };

  const cerrarAccion = (id) => {
    setAccion((p) => ({ ...p, [id]: null }));
    setErrorCard((p) => ({ ...p, [id]: "" }));
  };

  const ejecutar = async (clase, tipo) => {
    const id = clase.Horario_Asignatura_Id;
    const esDelBloque = bloqueId && clase.Bloque_Horario_Id === bloqueId;
    setEnviando(id);
    setErrorCard((p) => ({ ...p, [id]: "" }));
    try {
      const destino = Number(destinoSel[id] || clase.Sugerido_Id);
      const res = tipo === "migrar"
        ? await fetch(`${API}/${id}/migrar`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ bloqueDestinoId: destino, ...(esDelBloque && { bloque: bloqueId }) }),
          })
        : await fetch(`${API}/${id}${esDelBloque ? `?bloque=${bloqueId}` : ""}`, {
            method: "DELETE",
            headers: authHeaders(),
          });
      const data = await res.json();

      if (!res.ok) {
        if (data.codigo === "YA_RESUELTA") {
          mostrarAviso(data.error);
          await cargar();
          onCambio?.();
          return;
        }
        throw new Error(data.error);
      }

      const nuevas = { ...pospuestas };
      delete nuevas[id];
      setPospuestas(nuevas);
      guardarPospuestas(nuevas);
      cerrarAccion(id);
      mostrarAviso(data.mensaje);
      await cargar();
      onCambio?.();
    } catch (e) {
      // Se vuelve a los tres botones y el error queda visible para elegir otra opción
      setAccion((p) => ({ ...p, [id]: null }));
      setErrorCard((p) => ({ ...p, [id]: e.message || "No fue posible completar la acción" }));
    } finally {
      setEnviando(null);
    }
  };

  const alternarPosponer = (id) => {
    const nuevas = { ...leerPospuestas() };
    if (nuevas[id]) delete nuevas[id];
    else nuevas[id] = Date.now() + MINUTOS_POSPONER * 60_000;
    setPospuestas(nuevas);
    guardarPospuestas(nuevas);
    cerrarAccion(id);
  };

  const delBloque = bloqueId ? clases.filter((c) => c.Bloque_Horario_Id === bloqueId) : [];
  const generales = clases
    .filter((c) => !bloqueId || c.Bloque_Horario_Id !== bloqueId)
    .sort((a, b) => Boolean(pospuestas[a.Horario_Asignatura_Id]) - Boolean(pospuestas[b.Horario_Asignatura_Id]));
  const total = clases.length;
  const activas = clases.filter((c) => !pospuestas[c.Horario_Asignatura_Id]).length;

  if (total === 0 && !bloqueId && !abierto) return null;

  const renderTarjeta = (c) => {
    const id = c.Horario_Asignatura_Id;
    const pospuesta = pospuestas[id];
    // Color guardado de la asignatura; si aún no carga, el del plan del curso
    const color = tonosAsignatura(c.Asignatura_Id) || coloresCurso[c.Curso_Id]?.[c.Asignatura_Id] || COLORES_ASIGNATURA[0];
    const minutosRestantes = pospuesta ? Math.max(1, Math.ceil((pospuesta - Date.now()) / 60_000)) : 0;
    const opciones = destinos.filter((d) => d.Bloque_Horario_Id !== c.Bloque_Horario_Id);

    return (
      <div
        key={id}
        data-clase-id={id}
        className={
          pospuesta
            ? `conflicto-pospuesta${accion[id] || conSeleccion === id ? " conflicto-activa" : ""}`
            : undefined
        }
        style={{
          background: color.bg,
          border: `1px solid ${color.border}`,
          borderLeft: `5px solid ${color.text}`,
          borderRadius: 10,
          padding: "0.7rem 0.8rem",
          marginBottom: "0.6rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <strong style={{ color: color.text, fontSize: "0.92rem" }}>{c.Asignatura_Nombre}</strong>
          <span
            style={{
              fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap",
              padding: "2px 7px", borderRadius: 999,
              background: COLOR_PENDIENTE.bg, color: COLOR_PENDIENTE.text, border: `1px solid ${COLOR_PENDIENTE.border}`,
            }}
          >
            ⚠ {c.Motivo}
          </span>
        </div>
        <div style={{ fontSize: "0.8rem", color: "#374151", marginTop: 4 }}>
          {c.Curso_Nombre} · {c.Docente_Nombre || "Sin docente"}
        </div>
        <div style={{ fontSize: "0.8rem", color: "#4b5563" }}>
          {c.Dia} {hhmm(c.Hora_Inicio)}–{hhmm(c.Hora_Fin)} · {c.Jornada}
          {c.Estado !== "Activo" && ` · ${c.Estado}`}
        </div>
        {pospuesta && (
          <div style={{ fontSize: "0.75rem", color: "#4b5563", marginTop: 4, fontStyle: "italic" }}>
            Pospuesta · vuelve en {minutosRestantes} min
          </div>
        )}

        {accion[id] === "migrar" && (
          <div style={{ marginTop: 8 }}>
            {opciones.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "#991b1b", margin: 0 }}>
                No hay bloques de clase vigentes. Crea uno en Parámetros Institución, pestaña "Bloques horarios".
              </p>
            ) : (
              <>
                <label style={{ fontSize: "0.75rem", color: "#374151", display: "block", marginBottom: 2 }}>
                  Bloque de destino
                </label>
                <select
                  value={destinoSel[id] || c.Sugerido_Id || ""}
                  onChange={(e) => setDestinoSel((p) => ({ ...p, [id]: e.target.value }))}
                  style={{ width: "100%", padding: "0.35rem", borderRadius: 6, border: "1px solid #d1d5db", fontSize: "0.82rem" }}
                >
                  {opciones.map((d) => (
                    <option key={d.Bloque_Horario_Id} value={d.Bloque_Horario_Id}>
                      {etiquetaBloque(d)}{d.Bloque_Horario_Id === c.Sugerido_Id ? " (sugerido)" : ""}
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button type="button" disabled={enviando === id} onClick={() => ejecutar(c, "migrar")} style={btn("#1e3a5f", "#fff")}>
                    {enviando === id ? "Migrando..." : "Confirmar migración"}
                  </button>
                  <button type="button" onClick={() => cerrarAccion(id)} style={btn("#fff", "#374151", "#d1d5db")}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {accion[id] === "eliminar" && (
          <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#7f1d1d" }}>
            ¿Eliminar esta clase del horario? No se puede deshacer.
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" disabled={enviando === id} onClick={() => ejecutar(c, "eliminar")} style={btn("#991b1b", "#fff")}>
                {enviando === id ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button type="button" onClick={() => cerrarAccion(id)} style={btn("#fff", "#374151", "#d1d5db")}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {errorCard[id] && (
          <div style={{ marginTop: 6, fontSize: "0.78rem", color: "#991b1b", background: "#fee2e2", padding: "0.35rem 0.5rem", borderRadius: 6 }}>
            {errorCard[id]}
          </div>
        )}

        {!accion[id] && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => abrirAccion(id, "migrar")} style={btn("#1e3a5f", "#fff")}>
              ⇄ Migrar
            </button>
            <button type="button" onClick={() => abrirAccion(id, "eliminar")} style={btn("#fee2e2", "#991b1b", "#fecaca")}>
              🗑 Eliminar
            </button>
            <button type="button" onClick={() => alternarPosponer(id)} style={btn("#fff", "#374151", "#d1d5db")}>
              {pospuesta ? "↺ Retomar" : "⏰ Decidir más tarde"}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Pestaña lateral cuando el panel está plegado
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Clases pendientes de reubicar"
        style={{
          position: "fixed", right: 0, top: "40%", zIndex: 980,
          background: activas > 0 ? "#facc15" : "#e5e7eb", color: "#422006",
          border: "1px solid #eab308", borderRight: "none",
          borderRadius: "10px 0 0 10px", padding: "0.75rem 0.5rem",
          cursor: "pointer", fontWeight: 800, boxShadow: "-3px 3px 12px rgba(0,0,0,0.15)",
          writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.03em",
        }}
      >
        ⚠ {total} por reubicar
      </button>
    );
  }

  return (
    <aside
      aria-label="Clases pendientes de reubicar"
      style={{
        position: "fixed", top: 0, right: 0, zIndex: 980,
        width: "min(400px, 100vw)", height: "100vh",
        background: "#f8fafc", boxShadow: "-6px 0 28px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        animation: "slideInRight 0.22s ease",
      }}
    >
      <div style={{ background: "#0f172a", padding: "0.9rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ color: "#fde047", fontWeight: 800 }}>⚠ Clases por reubicar ({total})</div>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
            Bloques reemplazados o fuera de la jornada
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          title="Plegar panel"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 6, width: 32, height: 32, cursor: "pointer" }}
        >
          ⟩
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0.85rem" }}>
        {aviso && (
          <div style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 8, padding: "0.5rem 0.7rem", fontSize: "0.82rem", marginBottom: "0.6rem" }}>
            {aviso}
          </div>
        )}
        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "0.5rem 0.7rem", fontSize: "0.82rem", marginBottom: "0.6rem" }}>
            {error}
          </div>
        )}

        {bloqueAEliminar && (
          <section style={{ marginBottom: "1rem", padding: "0.7rem", border: "1px dashed #ef4444", borderRadius: 10, background: "#fff" }}>
            <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>
              🗑 Quitar bloque {bloqueAEliminar.etiqueta}
            </div>
            {delBloque.length > 0 ? (
              <>
                <p style={{ fontSize: "0.8rem", color: "#4b5563", margin: "0 0 0.5rem" }}>
                  Reubica o elimina sus {delBloque.length} clase(s) para poder quitarlo.
                </p>
                {delBloque.map(renderTarjeta)}
              </>
            ) : (
              <p style={{ fontSize: "0.8rem", color: "#166534", margin: "0 0 0.5rem" }}>
                El bloque ya no tiene clases.
              </p>
            )}
            {errorBloque && (
              <div style={{ marginBottom: 6, fontSize: "0.78rem", color: "#991b1b", background: "#fee2e2", padding: "0.35rem 0.5rem", borderRadius: 6 }}>
                {errorBloque}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              {delBloque.length === 0 && (
                <button type="button" onClick={eliminarBloque} style={btn("#991b1b", "#fff")}>
                  Eliminar bloque ahora
                </button>
              )}
              <button type="button" onClick={() => { setErrorBloque(""); onCancelarEliminarBloque?.(); }} style={btn("#fff", "#374151", "#d1d5db")}>
                {delBloque.length === 0 ? "Conservar bloque" : "Cancelar"}
              </button>
            </div>
          </section>
        )}

        {generales.length === 0 && !bloqueAEliminar && (
          <p style={{ color: "#6b7280", textAlign: "center", padding: "2rem 0.5rem" }}>
            ✓ No hay clases pendientes de reubicar.
          </p>
        )}
        {generales.map(renderTarjeta)}
      </div>
    </aside>
  );
}

function btn(bg, color, borde) {
  return {
    padding: "0.35rem 0.7rem", borderRadius: 6, cursor: "pointer",
    fontSize: "0.78rem", fontWeight: 600,
    background: bg, color, border: `1px solid ${borde || bg}`,
  };
}
