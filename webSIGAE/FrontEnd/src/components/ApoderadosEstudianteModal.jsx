import { useEffect, useState } from "react";
import {
  getApoderadosEstudiante,
  designarApoderadosEstudiante,
  editarAsociacionEstudiante,
} from "../services/api";
import { etiquetaApoderado, puedeAsociarse } from "../utils/apoderados";

const MAX_SUPLENTES_POR_DEFECTO = 4;

/**
 * CU39 + RF57 / CU90: gestión de los apoderados asociados a un estudiante.
 * El administrador designa al apoderado titular (único) y hasta 4 suplentes.
 * Dejar al estudiante sin ningún apoderado sigue el flujo de CU39, que pide
 * una segunda confirmación.
 *
 * apoderados: opciones (usuarios con rol Apoderado); onGuardado(mensaje): el padre recarga.
 */
function ApoderadosEstudianteModal({ estudiante, apoderados, onClose, onGuardado }) {
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [maxSuplentes, setMaxSuplentes] = useState(MAX_SUPLENTES_POR_DEFECTO);
  const [titularInicial, setTitularInicial] = useState("");
  const [titularId, setTitularId] = useState("");
  const [suplentes, setSuplentes] = useState([]); // [{ Usuario_Id, Usuario_Nombre_Completo }]
  const [agregarId, setAgregarId] = useState("");
  const [msgError, setMsgError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let activo = true;
    getApoderadosEstudiante(estudiante.Estudiante_Id)
      .then((data) => {
        if (!activo) return;
        const titular = data?.titular?.Usuario_Id ? String(data.titular.Usuario_Id) : "";
        setTitularInicial(titular);
        setTitularId(titular);
        setSuplentes(data?.suplentes || []);
        setMaxSuplentes(data?.maxSuplentes || MAX_SUPLENTES_POR_DEFECTO);
      })
      .catch((error) => activo && setErrorCarga(error.message || "No fue posible cargar los apoderados del estudiante"))
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, [estudiante.Estudiante_Id]);

  const nombreDe = (id) =>
    apoderados.find((a) => String(a.Usuario_Id) === String(id))?.Usuario_Nombre_Completo
    || suplentes.find((s) => String(s.Usuario_Id) === String(id))?.Usuario_Nombre_Completo
    || "";

  // Apoderados que se pueden asociar (activos o inactivos por no tener estudiantes, que se
  // reactivan al guardar) y que no estén ya elegidos
  const activos = apoderados.filter(puedeAsociarse);
  const idsSuplentes = suplentes.map((s) => String(s.Usuario_Id));
  const opcionesTitular = activos.filter((a) => !idsSuplentes.includes(String(a.Usuario_Id)));
  const opcionesSuplente = activos.filter(
    (a) => String(a.Usuario_Id) !== titularId && !idsSuplentes.includes(String(a.Usuario_Id))
  );

  const cambiarTitular = (id) => {
    setTitularId(id);
    setMsgError("");
  };

  const agregarSuplente = () => {
    if (!agregarId) return;
    if (suplentes.length >= maxSuplentes) {
      setMsgError(`Un estudiante puede tener como máximo ${maxSuplentes} apoderados suplentes`);
      return;
    }
    setSuplentes((s) => [...s, { Usuario_Id: Number(agregarId), Usuario_Nombre_Completo: nombreDe(agregarId) }]);
    setAgregarId("");
    setMsgError("");
  };

  const quitarSuplente = (id) => {
    setSuplentes((s) => s.filter((x) => String(x.Usuario_Id) !== String(id)));
    setMsgError("");
  };

  // Un suplente pasa a ser titular y el titular actual queda como suplente
  const hacerTitular = (id) => {
    const anterior = titularId;
    setSuplentes((s) => {
      const sinNuevo = s.filter((x) => String(x.Usuario_Id) !== String(id));
      return anterior ? [...sinNuevo, { Usuario_Id: Number(anterior), Usuario_Nombre_Completo: nombreDe(anterior) }] : sinNuevo;
    });
    setTitularId(String(id));
    setMsgError("");
  };

  // CU39: quitar la única asociación del estudiante, con doble confirmación
  const eliminarAsociacion = async (confirmar = false) => {
    const data = await editarAsociacionEstudiante(estudiante.Estudiante_Id, null, confirmar);
    if (data?.requiereConfirmacion) {
      if (window.confirm(data.mensaje)) return eliminarAsociacion(true);
      return null;
    }
    return data;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsgError("");

    // CU90 Excepción 2: si hay apoderados asociados, debe existir exactamente un titular
    if (!titularId && suplentes.length > 0) {
      setMsgError("Debes designar un apoderado titular: cada estudiante tiene exactamente uno");
      return;
    }

    setGuardando(true);
    try {
      let data;
      if (!titularId) {
        if (!titularInicial) {
          setMsgError("Selecciona el apoderado titular del estudiante");
          return;
        }
        data = await eliminarAsociacion();
        if (!data) return; // canceló la confirmación
      } else {
        data = await designarApoderadosEstudiante(estudiante.Estudiante_Id, {
          titularId,
          suplenteIds: suplentes.map((s) => s.Usuario_Id),
        });
      }
      onGuardado(data?.mensaje || "Apoderados actualizados correctamente");
    } catch (error) {
      setMsgError(error.message || "No fue posible guardar la designación de apoderados");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-labelledby="titulo-apoderados-estudiante">
        <div className="modal-header">
          <h2 id="titulo-apoderados-estudiante">Apoderados del estudiante</h2>
          <button type="button" className="btn-cerrar" onClick={onClose} aria-label="Cerrar" disabled={guardando}>✕</button>
        </div>
        <p className="modal-subtitulo">
          <strong>{estudiante.Estudiante_Nombre_Completo}</strong>
          {estudiante.Curso_Nombre ? ` · ${estudiante.Curso_Nombre}` : ""}
        </p>

        {cargando ? (
          <p className="empty-state-text">Cargando apoderados...</p>
        ) : errorCarga ? (
          <>
            <div className="msg-error-form">{errorCarga}</div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="cambiar-pwd-form" noValidate>
            <div className="campo-pwd">
              <label htmlFor="ap-titular">Apoderado titular</label>
              <select
                id="ap-titular"
                className="usuarios-select"
                value={titularId}
                onChange={(e) => cambiarTitular(e.target.value)}
              >
                <option value="">
                  {suplentes.length > 0 ? "Selecciona el titular..." : "Ninguno (eliminar asociación)"}
                </option>
                {opcionesTitular.map((a) => (
                  <option key={a.Usuario_Id} value={a.Usuario_Id}>{etiquetaApoderado(a)}</option>
                ))}
              </select>
              <span className="cit-sub">Cada estudiante tiene un único apoderado titular.</span>
            </div>

            <div className="campo-pwd">
              <label>Apoderados suplentes ({suplentes.length}/{maxSuplentes})</label>
              {suplentes.length === 0 ? (
                <p className="cit-sub">Sin suplentes designados.</p>
              ) : (
                <ul className="suplentes-lista">
                  {suplentes.map((s) => (
                    <li key={s.Usuario_Id} className="suplente-item">
                      <span>{s.Usuario_Nombre_Completo || nombreDe(s.Usuario_Id)}</span>
                      <div className="acciones-grupo">
                        <button type="button" className="btn-roles" onClick={() => hacerTitular(s.Usuario_Id)} disabled={guardando}>
                          Hacer titular
                        </button>
                        <button type="button" className="btn-desactivar" onClick={() => quitarSuplente(s.Usuario_Id)} disabled={guardando}>
                          Quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {titularId && suplentes.length < maxSuplentes && (
                <div className="suplente-agregar">
                  <select
                    aria-label="Apoderado suplente a agregar"
                    className="usuarios-select"
                    value={agregarId}
                    onChange={(e) => setAgregarId(e.target.value)}
                  >
                    <option value="">Selecciona un apoderado...</option>
                    {opcionesSuplente.map((a) => (
                      <option key={a.Usuario_Id} value={a.Usuario_Id}>{etiquetaApoderado(a)}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary" onClick={agregarSuplente} disabled={!agregarId || guardando}>
                    Agregar suplente
                  </button>
                </div>
              )}
              {!titularId && suplentes.length === 0 && (
                <span className="cit-sub">Primero designa al titular para poder agregar suplentes.</span>
              )}
            </div>

            {msgError && <div className="msg-error-form">{msgError}</div>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
              <button type="submit" className="btn-primario" disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ApoderadosEstudianteModal;
