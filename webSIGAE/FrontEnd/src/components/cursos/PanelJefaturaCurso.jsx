// RF60: profesor jefe del curso (CU95, CU96) y estudiantes del curso (CU97).
// CU105: en 2°, 3° y 4° medio, el administrador asigna la ruta de formación a uno o más estudiantes.
import { useEffect, useState } from "react";
import {
  getDocentesActivos,
  designarProfesorJefe,
  retirarProfesorJefe,
  getEstudiantesDeCurso,
  asignarRutaFormacion,
} from "../../services/promocion";

const RUTAS = ["Científica", "Humanística", "Técnica"];

export default function PanelJefaturaCurso({ curso, esAdmin, onCambio }) {
  const [docentes, setDocentes] = useState([]);
  const [docenteId, setDocenteId] = useState("");
  const [estudiantes, setEstudiantes] = useState([]);
  const [mensajeEstudiantes, setMensajeEstudiantes] = useState("");
  const [permiteRuta, setPermiteRuta] = useState(false);
  const [seleccion, setSeleccion] = useState([]);
  const [ruta, setRuta] = useState("");
  const [msgRuta, setMsgRuta] = useState({ tipo: "", texto: "" });
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    getEstudiantesDeCurso(curso.Curso_Id)
      .then((d) => {
        if (!vivo || !d) return;
        setEstudiantes(d.estudiantes || []);
        setMensajeEstudiantes(d.mensaje || "");
        setPermiteRuta(Boolean(d.curso?.Permite_Ruta));
      })
      .catch((e) => vivo && setMensajeEstudiantes(e.message));
    if (esAdmin) {
      getDocentesActivos().then((d) => vivo && d && setDocentes(d)).catch(() => {});
    }
    return () => { vivo = false; };
  }, [curso.Curso_Id, esAdmin]);

  // Las confirmaciones del backend (reemplazo y situaciones en registro) se piden aquí
  const asignar = async () => {
    if (!docenteId) {
      setError("Selecciona un docente");
      return;
    }
    setError("");
    setExito("");
    setEnviando(true);
    try {
      let cuerpo = { docenteId: Number(docenteId) };
      let r = await designarProfesorJefe(curso.Curso_Id, cuerpo);
      if (r?.requiereConfirmacion) {
        if (!window.confirm(r.mensaje)) return;
        cuerpo = { ...cuerpo, confirmarReemplazo: true };
        r = await designarProfesorJefe(curso.Curso_Id, cuerpo);
      }
      if (r?.requiereConfirmacionAdicional) {
        if (!window.confirm(r.mensaje)) return;
        r = await designarProfesorJefe(curso.Curso_Id, { ...cuerpo, confirmarSituaciones: true });
      }
      if (r) {
        setExito(r.mensaje);
        setDocenteId("");
        onCambio?.();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  // CU105: registrar la ruta de los estudiantes seleccionados
  const registrarRuta = async () => {
    if (seleccion.length === 0 || !ruta) {
      setMsgRuta({ tipo: "error", texto: "Selecciona estudiantes y una ruta" });
      return;
    }
    setEnviando(true);
    setMsgRuta({ tipo: "", texto: "" });
    try {
      const r = await asignarRutaFormacion(curso.Curso_Id, seleccion, ruta);
      setEstudiantes((lista) => lista.map((e) => (seleccion.includes(e.Estudiante_Id) ? { ...e, Estudiante_Ruta_Formacion: r.ruta } : e)));
      setSeleccion([]);
      setMsgRuta({ tipo: "exito", texto: r.mensaje });
    } catch (e) {
      setMsgRuta({ tipo: "error", texto: e.message });
    } finally {
      setEnviando(false);
    }
  };

  const alternarSeleccion = (id) =>
    setSeleccion((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  const puedeAsignarRuta = esAdmin && permiteRuta;

  const retirar = async () => {
    if (!window.confirm(`¿Retirar a ${curso.Profesor_Jefe_Nombre} como profesor jefe de ${curso.Curso_Nombre}?`)) return;
    setError("");
    setExito("");
    setEnviando(true);
    try {
      let r = await retirarProfesorJefe(curso.Curso_Id);
      if (r?.requiereConfirmacionAdicional) {
        if (!window.confirm(r.mensaje)) return;
        r = await retirarProfesorJefe(curso.Curso_Id, { confirmarSituaciones: true });
      }
      if (r) {
        setExito(r.mensaje);
        onCambio?.();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="form-card" style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ marginTop: 0 }}>Profesor jefe</h3>
      <p>
        {curso.Profesor_Jefe_Nombre
          ? <strong>{curso.Profesor_Jefe_Nombre}</strong>
          : "Este curso no tiene profesor jefe."}
      </p>

      {esAdmin && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <select value={docenteId} onChange={(e) => setDocenteId(e.target.value)} style={{ minWidth: "16rem", maxWidth: "100%" }}>
            <option value="">Seleccionar docente...</option>
            {docentes.map((d) => (
              <option key={d.Usuario_Id} value={d.Usuario_Id}>{d.Usuario_Nombre_Completo}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={asignar} disabled={enviando}>
            {curso.Profesor_Jefe_Nombre ? "Reemplazar" : "Asignar"}
          </button>
          {curso.Profesor_Jefe_Nombre && (
            <button className="btn-volver" onClick={retirar} disabled={enviando}>Retirar jefatura</button>
          )}
        </div>
      )}
      {esAdmin && <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Un docente puede ser profesor jefe de hasta 2 cursos por período.</p>}
      {exito && <p className="msg-exito">{exito}</p>}
      {error && <p className="msg-error">{error}</p>}

      <h3>Estudiantes del curso</h3>
      {estudiantes.length === 0 ? (
        <p>{mensajeEstudiantes || "Cargando..."}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {puedeAsignarRuta && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" }}>
              <span style={{ fontSize: "0.9rem" }}>Ruta de formación para {seleccion.length} seleccionado(s):</span>
              <select value={ruta} onChange={(e) => setRuta(e.target.value)} aria-label="Ruta de formación">
                <option value="">Elegir ruta...</option>
                {RUTAS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="btn-primary" onClick={registrarRuta} disabled={enviando || seleccion.length === 0 || !ruta}>
                Asignar ruta
              </button>
            </div>
          )}
          {msgRuta.texto && <p className={msgRuta.tipo === "error" ? "msg-error" : "msg-exito"}>{msgRuta.texto}</p>}
          <table className="tabla-asignaturas">
            <thead>
              <tr>
                {puedeAsignarRuta && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={seleccion.length > 0 && seleccion.length === estudiantes.length}
                      onChange={(e) => setSeleccion(e.target.checked ? estudiantes.map((x) => x.Estudiante_Id) : [])}
                    />
                  </th>
                )}
                <th>Nombre</th><th>RUT</th><th>Estado académico</th>
                {permiteRuta && <th>Ruta de formación</th>}
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((e) => (
                <tr key={e.Estudiante_Id}>
                  {puedeAsignarRuta && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar a ${e.Estudiante_Nombre_Completo}`}
                        checked={seleccion.includes(e.Estudiante_Id)}
                        onChange={() => alternarSeleccion(e.Estudiante_Id)}
                      />
                    </td>
                  )}
                  <td>{e.Estudiante_Nombre_Completo}</td>
                  <td>{e.Estudiante_RUT}</td>
                  <td>{e.Estudiante_Estado_Academico}</td>
                  {permiteRuta && <td>{e.Estudiante_Ruta_Formacion || "Sin ruta"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
