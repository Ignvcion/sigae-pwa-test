import { useEffect, useState } from "react";
import {
  DIAS_SEMANA, COLORES_ASIGNATURA, COLOR_PENDIENTE, aMinutos, hhmm, minutosAHHMM, detectarTopes,
} from "../../utils/horarios";

const COLORES = COLORES_ASIGNATURA;
const COLOR_INACTIVO = { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" };

const PX_POR_MIN = 1.5;
const DIAS_ABR = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const COLOR_RECREO = { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" };

// Jornada institucional (parámetros) y recreos vigentes. Se piden al abrir la
// grilla para reflejar siempre la configuración actual; null si no hay parámetros.
function cargarJornada() {
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  const pedir = (url) => fetch(url, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return Promise.all([pedir("/api/bloques/parametros"), pedir("/api/bloques")]).then(([param, bloques]) => {
    if (!param?.Parametro_Institucional_Inicio_Jornada) return null;
    return {
      inicio: aMinutos(param.Parametro_Institucional_Inicio_Jornada),
      fin: aMinutos(param.Parametro_Institucional_Fin_Jornada),
      recreos: (Array.isArray(bloques) ? bloques : [])
        .filter((b) => b.Bloque_Horario_Tipo === "Recreo" && Number(b.desajustado) !== 1)
        .map((b) => ({
          id: b.Bloque_Horario_Id,
          inicio: aMinutos(b.Bloque_Horario_Hora_Inicio),
          fin: aMinutos(b.Bloque_Horario_Hora_Fin),
        })),
    };
  });
}

/**
 * Marcas del eje de tiempo: el inicio y el fin del rango, más cada hora (y
 * media hora) completa entre ellos.
 */
function marcasDelRango(desde, hasta, cada) {
  const marcas = [];
  for (let m = Math.ceil(desde / cada) * cada; m <= hasta; m += cada) marcas.push(m);
  return marcas;
}

/**
 * Reparte en carriles las clases de un día que se solapan, para dibujarlas
 * lado a lado en vez de una encima de otra.
 */
function distribuirEnCarriles(clases) {
  const ordenadas = [...clases].sort(
    (a, b) => aMinutos(a.horaInicio) - aMinutos(b.horaInicio) || aMinutos(a.horaFin) - aMinutos(b.horaFin)
  );
  const resultado = [];
  let grupo = [];
  let finGrupo = -1;

  const cerrarGrupo = () => {
    const carriles = [];
    for (const c of grupo) {
      let idx = carriles.findIndex((fin) => fin <= aMinutos(c.horaInicio));
      if (idx === -1) {
        idx = carriles.length;
        carriles.push(0);
      }
      carriles[idx] = aMinutos(c.horaFin);
      resultado.push({ clase: c, carril: idx });
    }
    const total = carriles.length;
    for (let k = resultado.length - grupo.length; k < resultado.length; k++) {
      resultado[k].total = total;
    }
    grupo = [];
  };

  for (const c of ordenadas) {
    if (grupo.length && aMinutos(c.horaInicio) >= finGrupo) cerrarGrupo();
    grupo.push(c);
    finGrupo = Math.max(finGrupo, aMinutos(c.horaFin));
  }
  if (grupo.length) cerrarGrupo();

  return resultado;
}

/**
 * Grilla semanal con eje de tiempo (estilo "Bloques horarios"): días en
 * columnas y cada clase ubicada según su hora de inicio y término. El eje
 * cubre la jornada completa de los parámetros institucionales (ampliada si
 * alguna clase cae fuera de ella) y marca los recreos.
 *
 * clases: [{ id, dia, horaInicio, horaFin, titulo, lineas: [string], colorKey, estado, pendiente }]
 *
 * pendiente: su bloque fue reemplazado o quedó fuera de la jornada y la
 * administración aún debe reubicarla; se muestra en amarillo tenue con ⚠.
 */
export default function HorarioSemanal({ clases }) {
  const [hover, setHover] = useState(null);
  const [jornada, setJornada] = useState(null);

  useEffect(() => {
    let vigente = true;
    cargarJornada().then((j) => { if (vigente) setJornada(j); });
    return () => { vigente = false; };
  }, []);

  if (!clases.length) return null;

  const inicios = clases.map((c) => aMinutos(c.horaInicio)).filter((m) => m > 0);
  const fines = clases.map((c) => aMinutos(c.horaFin)).filter((m) => m > 0);
  const minIni = inicios.length ? Math.min(...inicios) : 480;
  const maxFin = fines.length ? Math.max(...fines) : 960;
  // Sin parámetros (o mientras cargan) se usa el rango de las clases, redondeado a la hora
  const rangoMin = jornada
    ? Math.min(jornada.inicio, minIni)
    : Math.floor(minIni / 60) * 60;
  const rangoMax = jornada
    ? Math.max(jornada.fin, maxFin)
    : Math.ceil(maxFin / 60) * 60;
  const totalPx = Math.max((rangoMax - rangoMin) * PX_POR_MIN, 360);
  const horas = marcasDelRango(rangoMin, rangoMax, 60);
  const mediasHoras = marcasDelRango(rangoMin, rangoMax, 30).filter((m) => m % 60 !== 0);
  // Etiquetas del eje: horas completas y, si no coinciden con una, el inicio y fin de la jornada
  const etiquetas = [...new Set([rangoMin, ...horas, rangoMax])].sort((a, b) => a - b)
    .filter((m, i, arr) => i === 0 || m === rangoMax || m - arr[i - 1] >= 20);
  const recreos = (jornada?.recreos || []).filter((r) => r.inicio >= rangoMin && r.fin <= rangoMax);

  // Color estable por asignatura dentro de esta vista
  const claves = [...new Set(clases.map((c) => String(c.colorKey ?? c.titulo)))].sort();
  const colorDe = (c) => COLORES[claves.indexOf(String(c.colorKey ?? c.titulo)) % COLORES.length];

  const idsEnTope = new Set(detectarTopes(clases).flatMap((t) => t.clases.map((c) => c.id)));

  const leyenda = claves.map((k) => {
    const ejemplo = clases.find((c) => String(c.colorKey ?? c.titulo) === k);
    return { clave: k, nombre: ejemplo.titulo, color: colorDe(ejemplo) };
  });

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 640, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          {/* Encabezados */}
          <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb" }}>
            <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid #e5e7eb" }} />
            {DIAS_ABR.map((d, i) => (
              <div
                key={d}
                style={{
                  flex: 1, padding: "10px 0", textAlign: "center", background: "#f8fafc",
                  borderLeft: i > 0 ? "1px solid #e5e7eb" : "none",
                  fontWeight: 700, fontSize: "0.82rem", color: "#1e3a5f",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Cuerpo */}
          <div style={{ display: "flex" }}>
            <div style={{ width: 56, flexShrink: 0, position: "relative", height: totalPx, borderRight: "1px solid #e5e7eb" }}>
              {etiquetas.map((m) => (
                <div
                  key={m}
                  style={{
                    position: "absolute", top: Math.min(Math.max((m - rangoMin) * PX_POR_MIN - 7, 0), totalPx - 12), right: 8,
                    fontSize: "0.7rem", fontWeight: 600, lineHeight: 1,
                    color: m === rangoMin || m === rangoMax ? "#1e3a5f" : "#9ca3af",
                  }}
                >
                  {minutosAHHMM(m)}
                </div>
              ))}
            </div>

            {DIAS_SEMANA.map((dia, di) => (
              <div
                key={dia}
                style={{
                  flex: 1, position: "relative", height: totalPx, background: "#fafafa",
                  borderLeft: di > 0 ? "1px solid #e5e7eb" : "none",
                }}
              >
                {horas.map((m) => (
                  <div key={m} style={{ position: "absolute", top: (m - rangoMin) * PX_POR_MIN, left: 0, right: 0, height: 1, background: "#e5e7eb" }} />
                ))}
                {mediasHoras.map((m) => (
                  <div key={`m${m}`} style={{ position: "absolute", top: (m - rangoMin) * PX_POR_MIN, left: 0, right: 0, height: 1, background: "#f3f4f6" }} />
                ))}

                {recreos.map((r) => (
                  <div
                    key={`r${r.id}`}
                    title={`Recreo ${minutosAHHMM(r.inicio)}–${minutosAHHMM(r.fin)}`}
                    style={{
                      position: "absolute", left: 0, right: 0,
                      top: (r.inicio - rangoMin) * PX_POR_MIN,
                      height: (r.fin - r.inicio) * PX_POR_MIN,
                      background: COLOR_RECREO.bg,
                      borderTop: `1px dashed ${COLOR_RECREO.border}`,
                      borderBottom: `1px dashed ${COLOR_RECREO.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.62rem", fontWeight: 600, color: COLOR_RECREO.text, letterSpacing: "0.05em",
                      overflow: "hidden",
                    }}
                  >
                    {(r.fin - r.inicio) * PX_POR_MIN >= 12 && "Recreo"}
                  </div>
                ))}

                {distribuirEnCarriles(clases.filter((c) => c.dia === dia)).map(({ clase: c, carril, total }) => {
                  const ini = aMinutos(c.horaInicio);
                  const fin = aMinutos(c.horaFin);
                  const alto = Math.max((fin - ini) * PX_POR_MIN - 3, 22);
                  const activa = !c.estado || c.estado === "Activo";
                  const enTope = idsEnTope.has(c.id);
                  const col = c.pendiente ? COLOR_PENDIENTE : activa ? colorDe(c) : COLOR_INACTIVO;
                  const ancho = 100 / total;
                  const esHover = hover === c.id;

                  return (
                    <div
                      key={c.id}
                      onMouseEnter={() => setHover(c.id)}
                      onMouseLeave={() => setHover(null)}
                      title={[
                        `${c.titulo} · ${hhmm(c.horaInicio)}–${hhmm(c.horaFin)}`,
                        ...(c.lineas || []),
                        !activa && `Estado: ${c.estado}`,
                        c.pendiente && "⚠ Horario en revisión: el bloque cambió y esta clase será reubicada",
                        enTope && "⚠ Tope de horario con otra clase",
                      ].filter(Boolean).join("\n")}
                      style={{
                        position: "absolute",
                        top: (ini - rangoMin) * PX_POR_MIN,
                        left: `calc(${carril * ancho}% + 4px)`,
                        width: `calc(${ancho}% - 8px)`,
                        height: alto,
                        background: col.bg,
                        border: enTope ? "2px solid #dc2626" : `1px solid ${col.border}`,
                        borderLeft: `4px solid ${enTope ? "#dc2626" : col.text}`,
                        borderRadius: 6,
                        padding: "3px 6px",
                        overflow: "hidden",
                        opacity: activa ? 1 : 0.75,
                        zIndex: esHover ? 10 : 1,
                        boxShadow: esHover ? "0 3px 10px rgba(0,0,0,0.12)" : "none",
                        transition: "box-shadow 0.15s",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "0.72rem", color: col.text, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {(enTope || c.pendiente) && "⚠ "}{c.titulo}
                      </div>
                      <div style={{ fontSize: "0.66rem", color: col.text, opacity: 0.85, whiteSpace: "nowrap" }}>
                        {hhmm(c.horaInicio)}–{hhmm(c.horaFin)}
                      </div>
                      {alto > 46 && (c.lineas || []).map((l) => (
                        <div key={l} style={{ fontSize: "0.66rem", color: col.text, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {l}
                        </div>
                      ))}
                      {c.pendiente && alto > 58 && (
                        <div style={{ fontSize: "0.62rem", fontWeight: 700, color: COLOR_PENDIENTE.text }}>
                          EN REVISIÓN
                        </div>
                      )}
                      {!activa && !c.pendiente && alto > 58 && (
                        <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>
                          {c.estado}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", marginTop: "0.75rem", fontSize: "0.8rem", color: "#374151" }}>
        {leyenda.map(({ clave, nombre, color }) => (
          <span key={clave} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: color.bg, border: `1px solid ${color.border}` }} />
            {nombre}
          </span>
        ))}
        {recreos.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_RECREO.bg, border: `1px dashed ${COLOR_RECREO.border}` }} />
            Recreo
          </span>
        )}
        {clases.some((c) => c.estado && c.estado !== "Activo") && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_INACTIVO.bg, border: `1px solid ${COLOR_INACTIVO.border}` }} />
            Suspendida / inactiva
          </span>
        )}
        {clases.some((c) => c.pendiente) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: COLOR_PENDIENTE.text, fontWeight: 600 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_PENDIENTE.bg, border: `1px solid ${COLOR_PENDIENTE.border}` }} />
            ⚠ En revisión (será reubicada)
          </span>
        )}
        {idsEnTope.size > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#dc2626", fontWeight: 600 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, border: "2px solid #dc2626" }} />
            Tope de horario
          </span>
        )}
      </div>
    </div>
  );
}
