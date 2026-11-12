// CU101: notificaciones de mensajes y citaciones. La campana muestra cuántas hay
// sin leer; al abrirla se listan las recientes y al elegir una se marca como
// leída y se abre el mensaje o la citación. Se actualiza cada minuto y al
// cambiar de página.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getNotificaciones,
  marcarNotificacionLeida,
  marcarNotificacionesLeidas,
} from "../services/api";

const INTERVALO_MS = 60 * 1000;

function haceCuanto(fecha) {
  const ms = Date.now() - new Date(fecha).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

const ICONOS = {
  Mensaje: "💬",
  "Citación nueva": "📅",
  "Solicitud de citación": "📨",
  "Citación confirmada": "✅",
  "Citación cancelada": "❌",
  "Citación reprogramada": "🔁",
};

// rol: perfil con que se ingresó (Docente/Apoderado filtran las suyas)
export default function CampanaNotificaciones({ rol }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState({ noLeidas: 0, notificaciones: [] });
  const [error, setError] = useState("");
  const contenedor = useRef(null);
  const rolFiltro = rol === "Docente" || rol === "Apoderado" ? rol : undefined;

  const cargar = useCallback(() => {
    getNotificaciones(rolFiltro)
      .then((d) => {
        if (!d) return;
        setDatos({ noLeidas: d.noLeidas || 0, notificaciones: d.notificaciones || [] });
        setError("");
      })
      .catch(() => setError("No fue posible cargar las notificaciones"));
  }, [rolFiltro]);

  // Al cambiar de página (p. ej. después de abrir un mensaje) y cada minuto
  useEffect(() => {
    cargar();
    const id = setInterval(cargar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [cargar, location.pathname, location.search]);

  // Cierra el panel al hacer clic fuera
  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierta]);

  const abrir = async (n) => {
    setAbierta(false);
    if (!n.leida) {
      await marcarNotificacionLeida(n.id).catch(() => {});
    }
    navigate(n.enlace);
    cargar();
  };

  const marcarTodas = async () => {
    await marcarNotificacionesLeidas(rolFiltro).catch(() => {});
    cargar();
  };

  const { noLeidas, notificaciones } = datos;

  return (
    <div className="notificaciones" ref={contenedor}>
      <button
        type="button"
        className="notificaciones-boton"
        onClick={() => setAbierta((a) => !a)}
        aria-label={`Notificaciones${noLeidas ? `: ${noLeidas} sin leer` : ""}`}
        aria-expanded={abierta}
      >
        <span aria-hidden="true">🔔</span> Notificaciones
        {noLeidas > 0 && <span className="notificaciones-contador">{noLeidas > 99 ? "99+" : noLeidas}</span>}
      </button>

      {abierta && (
        <div className="notificaciones-panel" role="dialog" aria-label="Notificaciones">
          <div className="notificaciones-encabezado">
            <strong>Notificaciones</strong>
            {noLeidas > 0 && (
              <button type="button" className="btn-enlace" onClick={marcarTodas}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          {error && <p className="notificaciones-vacio">{error}</p>}
          {!error && notificaciones.length === 0 && (
            <p className="notificaciones-vacio">No tienes notificaciones.</p>
          )}
          <ul className="notificaciones-lista">
            {notificaciones.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`notificacion-item${n.leida ? "" : " notificacion-no-leida"}`}
                  onClick={() => abrir(n)}
                >
                  <span className="notificacion-icono" aria-hidden="true">{ICONOS[n.tipo] || "🔔"}</span>
                  <span className="notificacion-texto">
                    <span className="notificacion-titulo">{n.titulo}</span>
                    {n.detalle && <span className="notificacion-detalle">{n.detalle}</span>}
                    <span className="notificacion-fecha">{haceCuanto(n.fecha)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
