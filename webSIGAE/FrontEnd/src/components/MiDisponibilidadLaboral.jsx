import { useEffect, useState } from "react";
import { getDisponibilidadDocente } from "../services/api";
import DisponibilidadSemanal from "./DisponibilidadSemanal";

// CU107: el docente ve en su perfil la disponibilidad laboral que configuró el
// administrador (solo lectura). Para cambiarla debe pedirlo a un administrador.
function MiDisponibilidadLaboral({ usuarioId }) {
  const [disp, setDisp] = useState(null);
  const [periodoPedido, setPeriodoPedido] = useState(""); // vacío = período vigente
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    getDisponibilidadDocente(usuarioId, periodoPedido || undefined)
      .then((d) => { if (vigente) { setDisp(d); setError(""); } })
      .catch((e) => vigente && setError(e.message || "No fue posible cargar tu disponibilidad laboral"));
    return () => { vigente = false; };
  }, [usuarioId, periodoPedido]);

  return (
    <div className="perfil-card perfil-card--ancha">
      <h2>Mi disponibilidad laboral</h2>
      <p className="etiquetas-ayuda" style={{ marginBottom: 12 }}>
        Días y horarios en que estás en el colegio, configurados por la administración.
        Si necesitas cambiarlos, solicítalo a un administrador.
      </p>
      {error && <div className="usuarios-empty" style={{ color: "#dc2626" }}>{error}</div>}
      {!disp && !error && <p>Cargando disponibilidad…</p>}
      {disp && (
        <DisponibilidadSemanal
          soloLectura
          dias={disp.dias}
          bloques={disp.bloques}
          tramos={disp.tramos}
          clases={disp.clases}
          atencion={disp.atencion}
          cargaSemanal={disp.docente?.Docente_Carga_Horaria_Semanal}
          periodo={disp.periodo}
          periodos={disp.periodos}
          onCambiarPeriodo={(p) => { setDisp(null); setError(""); setPeriodoPedido(p); }}
          onChange={() => {}}
        />
      )}
    </div>
  );
}

export default MiDisponibilidadLaboral;
