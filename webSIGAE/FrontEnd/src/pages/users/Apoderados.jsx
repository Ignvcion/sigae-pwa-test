import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getApoderados,
  getEstudiantesSinApoderado,
  asignarApoderado,
  editarAsociacionEstudiante,
  eliminarAsociacionEspecifica,
  eliminarTodasAsociaciones,
} from "../../services/api";

function Apoderados() {
  const { usuario } = useAuth();
  const esAdmin =
    usuario?.roles?.includes("Administrador") ||
    usuario?.administradorTipo === "Super Admin";

  const [apoderados, setApoderados]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [busqueda, setBusqueda]               = useState("");
  const [mensajeInfo, setMensajeInfo]         = useState("");
  const [errorCarga, setErrorCarga]           = useState("");

  // CU33: filtro por operador y cantidad de estudiantes asociados
  const [operadorFiltro, setOperadorFiltro]   = useState("=");
  const [cantidadFiltro, setCantidadFiltro]   = useState("");

  // Modal
  const [apoderadoSeleccionado, setApoderadoSeleccionado] = useState(null);
  const [estudiantesSinApo, setEstudiantesSinApo]         = useState([]);
  const [estudiantesDelApo, setEstudiantesDelApo]         = useState([]);
  const [seleccionados, setSeleccionados]                 = useState([]);
  const [loadingModal, setLoadingModal]                   = useState(false);
  const [errorModal, setErrorModal]                       = useState(null);
  const [resultado, setResultado]                         = useState(null);

  // CU39: editar asociación (reasignar/quitar) de un estudiante puntual
  const [reasignando, setReasignando]                     = useState(null); // Estudiante_Id en edición
  const [nuevoApoderadoId, setNuevoApoderadoId]            = useState("");
  const [loadingAsociacion, setLoadingAsociacion]          = useState(false);
  const [errorAsociacion, setErrorAsociacion]              = useState(null);

  // CU9: eliminar todas las asociaciones activas del apoderado seleccionado
  const [loadingEliminarTodas, setLoadingEliminarTodas]      = useState(false);
  const [avisoEliminarTodas, setAvisoEliminarTodas]          = useState(null);

  useEffect(() => {
    cargarApoderados({});
  }, []);

  const cargarApoderados = async (filtros) => {
    setLoading(true);
    setErrorCarga("");
    setMensajeInfo("");
    try {
      const data = await getApoderados(filtros);
      if (Array.isArray(data)) {
        setApoderados(data);
      } else {
        // CU32 - Excepción "Sin apoderados registrados"
        setApoderados(data.apoderados || []);
        setMensajeInfo(data.mensaje || "No existen apoderados registrados");
      }
    } catch (error) {
      // CU32 - Excepción "Interrupción técnica crítica"
      setErrorCarga(error.message || "Los datos no pudieron ser cargados, reintente más tarde");
    } finally {
      setLoading(false);
    }
  };

  // Obtener los estudiantes ya asociados a un apoderado
  const cargarEstudiantesDelApoderado = async (apoderadoId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/estudiantes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return Array.isArray(data)
        ? data.filter((e) => e.Apoderado_Usuario_Id === apoderadoId)
        : [];
    } catch {
      return [];
    }
  };

  const abrirModal = async (apoderado) => {
    setApoderadoSeleccionado(apoderado);
    setSeleccionados([]);
    setErrorModal(null);
    setResultado(null);
    setLoadingModal(true);
    try {
      const [sinApo, delApo] = await Promise.all([
        getEstudiantesSinApoderado(),
        cargarEstudiantesDelApoderado(apoderado.Usuario_Id),
      ]);
      setEstudiantesSinApo(sinApo);
      setEstudiantesDelApo(delApo);
    } catch (error) {
      setErrorModal("Error al cargar estudiantes");
    } finally {
      setLoadingModal(false);
    }
  };

  const cerrarModal = () => {
    setApoderadoSeleccionado(null);
    setSeleccionados([]);
    setErrorModal(null);
    setResultado(null);
    setReasignando(null);
    setErrorAsociacion(null);
    setAvisoEliminarTodas(null);
  };

  const toggleSeleccion = (id) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAsignar = async () => {
    if (seleccionados.length === 0) {
      setErrorModal("Selecciona al menos un estudiante para asignar.");
      return;
    }
    setLoadingModal(true);
    setErrorModal(null);
    try {
      const res = await asignarApoderado({
        apoderadoId  : apoderadoSeleccionado.Usuario_Id,
        estudianteIds: seleccionados,
      });
      setResultado(res);
      // Recargar listas dentro del modal para reflejar los cambios
      const [sinApo, delApo] = await Promise.all([
        getEstudiantesSinApoderado(),
        cargarEstudiantesDelApoderado(apoderadoSeleccionado.Usuario_Id),
      ]);
      setEstudiantesSinApo(sinApo);
      setEstudiantesDelApo(delApo);
      setSeleccionados([]);
    } catch (error) {
      setErrorModal(error.message || "Error al asignar estudiantes");
    } finally {
      setLoadingModal(false);
    }
  };

  // CU39: recargar ambas listas del modal tras editar una asociación puntual
  const recargarListasModal = async () => {
    const [sinApo, delApo] = await Promise.all([
      getEstudiantesSinApoderado(),
      cargarEstudiantesDelApoderado(apoderadoSeleccionado.Usuario_Id),
    ]);
    setEstudiantesSinApo(sinApo);
    setEstudiantesDelApo(delApo);
  };

  const iniciarReasignacion = (estudianteId) => {
    setReasignando(estudianteId);
    setNuevoApoderadoId("");
    setErrorAsociacion(null);
  };

  const confirmarReasignacion = async (estudianteId) => {
    if (!nuevoApoderadoId) {
      setErrorAsociacion("Selecciona un apoderado para reasignar.");
      return;
    }
    setLoadingAsociacion(true);
    setErrorAsociacion(null);
    try {
      await editarAsociacionEstudiante(estudianteId, Number(nuevoApoderadoId));
      setReasignando(null);
      await recargarListasModal();
    } catch (error) {
      setErrorAsociacion(error.message || "Error al reasignar el apoderado");
    } finally {
      setLoadingAsociacion(false);
    }
  };

  // Confirmación antes de quitar (sin segunda llamada al backend): recién al
  // aceptar se ejecuta la eliminación.
  const quitarApoderado = async (estudianteId) => {
    if (!window.confirm("¿Confirmas quitar el apoderado? El estudiante quedará sin apoderado asociado.")) return;
    setLoadingAsociacion(true);
    setErrorAsociacion(null);
    try {
      // CU10: eliminación de la asociación específica (endpoint dedicado,
      // no el de edición/reasignación de CU39)
      await eliminarAsociacionEspecifica(estudianteId);
      await recargarListasModal();
    } catch (error) {
      setErrorAsociacion(error.message || "No fue posible completar la eliminación");
    } finally {
      setLoadingAsociacion(false);
    }
  };

  // CU9: eliminar todas las asociaciones activas del apoderado en una sola operación
  const eliminarTodasLasAsociaciones = async () => {
    setAvisoEliminarTodas(null);
    const confirmado = window.confirm(
      `¿Confirmas eliminar las ${estudiantesDelApo.length} asociación(es) activa(s) de este apoderado?\n` +
      "Los estudiantes quedarán sin apoderado asignado."
    );
    if (!confirmado) {
      setAvisoEliminarTodas("Operación cancelada");
      return;
    }
    setLoadingEliminarTodas(true);
    try {
      const res = await eliminarTodasAsociaciones(apoderadoSeleccionado.Usuario_Id);
      setAvisoEliminarTodas(res.mensaje || `${res.eliminadas} asociación(es) eliminada(s) correctamente.`);
      await recargarListasModal();
    } catch (error) {
      setAvisoEliminarTodas(error.message || "No existen asociaciones disponibles para eliminar");
    } finally {
      setLoadingEliminarTodas(false);
    }
  };

  const apoderadosFiltrados = apoderados.filter((u) => {
    const txt = busqueda.toLowerCase();
    return (
      !busqueda ||
      u.Usuario_Nombre_Completo?.toLowerCase().includes(txt) ||
      u.Usuario_RUT?.toLowerCase().includes(txt)
    );
  });

  // CU33: filtrar por operador y cantidad de estudiantes asociados
  const aplicarFiltroCantidad = (e) => {
    e.preventDefault();
    cargarApoderados({ operador: operadorFiltro, cantidadEstudiantes: cantidadFiltro });
  };

  const limpiarFiltroCantidad = () => {
    setOperadorFiltro("=");
    setCantidadFiltro("");
    cargarApoderados({});
  };

  // CU32: roles del usuario y estudiantes vinculados en el listado de apoderados
  const getBadgesRoles = (u) => {
    const badges = [];
    if (u.Es_Administrador) badges.push(<span key="adm" className="badge-rol badge-admin">Administrador</span>);
    if (u.Es_Docente) badges.push(<span key="doc" className="badge-rol badge-docente">Docente</span>);
    if (u.Es_Apoderado) badges.push(<span key="apo" className="badge-rol badge-apoderado">Apoderado</span>);
    return badges.length > 0 ? badges : <span style={{ color: "#94a3b8" }}>Sin roles</span>;
  };

  if (loading) {
    return (
      <div className="usuarios-container">
        <p>Cargando apoderados...</p>
      </div>
    );
  }

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Gestión de Apoderados</h1>
        <p>Asocia estudiantes a los apoderados registrados en el sistema</p>
      </div>

      {/* Buscador */}
      <div className="usuarios-filtros">
        <input
          type="text"
          className="usuarios-search"
          placeholder="Buscar por nombre o RUT..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* CU33: filtro por cantidad de estudiantes asociados */}
      {/* noValidate: el diagrama exige que un valor no entero o negativo llegue al backend
          para que sea éste quien lo rechace, en vez de bloquearlo en el navegador */}
      <form className="usuarios-filtros" onSubmit={aplicarFiltroCantidad} noValidate>
        <span style={{ alignSelf: "center", color: "#475569", fontSize: "0.88rem", fontWeight: 600 }}>
          Filtrar por N° de estudiantes:
        </span>
        <select
          className="usuarios-select"
          value={operadorFiltro}
          onChange={(e) => setOperadorFiltro(e.target.value)}
          title="Condición de comparación"
          aria-label="Operador de comparación"
          style={{ minWidth: "150px" }}
        >
          <option value="=">Igual a (=)</option>
          <option value="!=">Distinto de (≠)</option>
          <option value=">">Más de (&gt;)</option>
          <option value="<">Menos de (&lt;)</option>
          <option value=">=">Al menos (≥)</option>
          <option value="<=">Como máximo (≤)</option>
        </select>
        <input
          type="text"
          inputMode="numeric"
          className="usuarios-search"
          style={{ maxWidth: "120px" }}
          placeholder="Cantidad"
          value={cantidadFiltro}
          onChange={(e) => setCantidadFiltro(e.target.value)}
        />
        <button type="submit" className="btn-roles">Filtrar</button>
        <button type="button" className="btn-roles" onClick={limpiarFiltroCantidad}>Limpiar</button>
      </form>

      {/* Tabla */}
      {errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!errorCarga && mensajeInfo && (
        <div className="usuarios-empty">{mensajeInfo}</div>
      )}

      {!errorCarga && !mensajeInfo && apoderadosFiltrados.length === 0 ? (
        <div className="usuarios-empty">No se encontraron apoderados registrados</div>
      ) : !errorCarga && !mensajeInfo && (
        <div className="tabla-responsive-container">
        <table className="tabla-usuarios">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>RUT</th>
              <th className="col-correo-th">Correo</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Roles</th>
              <th>Estudiantes vinculados</th>
              {esAdmin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {apoderadosFiltrados.map((u, idx) => (
              <tr key={u.Usuario_Id}>
                <td>{idx + 1}</td>
                <td>{u.Usuario_Nombre_Completo}</td>
                <td>{u.Usuario_RUT}</td>
                <td>{u.Apoderado_Correo_Natural || "—"}</td>
                <td>{u.Usuario_Telefono || "—"}</td>
                <td>
                  {u.Usuario_Estado_Cuenta ? (
                    <span className="badge-activo">Activo</span>
                  ) : (
                    <span className="badge-inactivo">Inactivo</span>
                  )}
                </td>
                <td>{getBadgesRoles(u)}</td>
                <td>{u.Total_Estudiantes_Asociados ?? 0}</td>
                {esAdmin && (
                  <td>
                    <button
                      className="btn-roles"
                      onClick={() => abrirModal(u)}
                    >
                      Asignar Estudiantes
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {/* ── MODAL ── */}
      {apoderadoSeleccionado && (
        <div
          style={{
            position       : "fixed",
            inset          : 0,
            background     : "rgba(0,0,0,0.45)",
            display        : "flex",
            alignItems     : "center",
            justifyContent : "center",
            zIndex         : 1000,
          }}
        >
          <div
            className="form-card"
            style={{ width: "540px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}
          >
            {/* Encabezado modal */}
            <h2 style={{ marginBottom: "4px" }}>Asignar Estudiantes</h2>
            <p style={{ color: "#64748b", marginBottom: "20px", fontSize: "0.95rem" }}>
              Apoderado:{" "}
              <strong>{apoderadoSeleccionado.Usuario_Nombre_Completo}</strong>
            </p>

            {loadingModal ? (
              <p style={{ color: "#64748b" }}>Cargando estudiantes...</p>
            ) : (
              <>
                {/* Estudiantes ya asociados */}
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h3 style={{ fontSize: "0.9rem", color: "#475569", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Estudiantes ya asociados ({estudiantesDelApo.length})
                    </h3>
                    {/* CU9: eliminar todas las asociaciones activas del apoderado */}
                    {estudiantesDelApo.length > 0 && (
                      <button
                        type="button"
                        className="btn-desactivar"
                        style={{ fontSize: "0.78rem", padding: "4px 8px" }}
                        disabled={loadingEliminarTodas}
                        onClick={eliminarTodasLasAsociaciones}
                      >
                        {loadingEliminarTodas ? "Eliminando..." : "Eliminar todas las asociaciones"}
                      </button>
                    )}
                  </div>

                  {avisoEliminarTodas && (
                    <p style={{ color: "#166534", fontSize: "0.85rem", marginBottom: "8px" }}>{avisoEliminarTodas}</p>
                  )}

                  {errorAsociacion && (
                    <p style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: "8px" }}>{errorAsociacion}</p>
                  )}
                  {estudiantesDelApo.length === 0 ? (
                    <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                      Este apoderado aún no tiene estudiantes asignados.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {estudiantesDelApo.map((e) => (
                        <div
                          key={e.Estudiante_Id}
                          style={{
                            background    : "#f0fdf4",
                            border        : "1px solid #bbf7d0",
                            borderRadius  : "6px",
                            padding       : "8px 12px",
                            fontSize      : "0.9rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{e.Estudiante_Nombre_Completo} <span style={{ color: "#64748b" }}>({e.Estudiante_RUT})</span></span>
                            {reasignando !== e.Estudiante_Id && (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  type="button"
                                  className="btn-roles"
                                  style={{ fontSize: "0.78rem", padding: "4px 8px" }}
                                  onClick={() => iniciarReasignacion(e.Estudiante_Id)}
                                >
                                  Cambiar apoderado
                                </button>
                                <button
                                  type="button"
                                  className="btn-desactivar"
                                  style={{ fontSize: "0.78rem", padding: "4px 8px" }}
                                  disabled={loadingAsociacion}
                                  onClick={() => quitarApoderado(e.Estudiante_Id)}
                                >
                                  Quitar apoderado
                                </button>
                              </div>
                            )}
                          </div>

                          {/* CU39 - Flujo correcto: reasignar a otro apoderado */}
                          {reasignando === e.Estudiante_Id && (
                            <div style={{ marginTop: "8px", display: "flex", gap: "6px", alignItems: "center" }}>
                              <select
                                className="usuarios-select"
                                style={{ fontSize: "0.85rem" }}
                                value={nuevoApoderadoId}
                                onChange={(ev) => setNuevoApoderadoId(ev.target.value)}
                              >
                                <option value="">Selecciona un nuevo apoderado...</option>
                                {apoderados
                                  .filter((a) => a.Usuario_Id !== apoderadoSeleccionado.Usuario_Id && a.Usuario_Estado_Cuenta)
                                  .map((a) => (
                                    <option key={a.Usuario_Id} value={a.Usuario_Id}>
                                      {a.Usuario_Nombre_Completo}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                className="btn-primario"
                                style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                                disabled={loadingAsociacion}
                                onClick={() => confirmarReasignacion(e.Estudiante_Id)}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                className="btn-roles"
                                style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                                onClick={() => setReasignando(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          )}

                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Divisor */}
                <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", marginBottom: "20px" }} />

                {/* Estudiantes disponibles para asignar */}
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "0.9rem", color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Estudiantes sin apoderado ({estudiantesSinApo.length})
                  </h3>
                  {estudiantesSinApo.length === 0 ? (
                    <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                      No hay estudiantes sin apoderado asignado.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
                      {estudiantesSinApo.map((e) => {
                        const marcado = seleccionados.includes(e.Estudiante_Id);
                        return (
                          <div
                            key={e.Estudiante_Id}
                            onClick={() => toggleSeleccion(e.Estudiante_Id)}
                            style={{
                              background    : marcado ? "#eff6ff" : "#f8fafc",
                              border        : `1px solid ${marcado ? "#93c5fd" : "#e2e8f0"}`,
                              borderRadius  : "6px",
                              padding       : "8px 12px",
                              fontSize      : "0.9rem",
                              display       : "flex",
                              justifyContent: "space-between",
                              alignItems    : "center",
                              cursor        : "pointer",
                              userSelect    : "none",
                              transition    : "all 0.15s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() => toggleSeleccion(e.Estudiante_Id)}
                                onClick={(ev) => ev.stopPropagation()}
                              />
                              <div>
                                <div style={{ fontWeight: marcado ? 600 : 400 }}>
                                  {e.Estudiante_Nombre_Completo}
                                </div>
                                <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                                  {e.Estudiante_RUT} · {e.Curso_Nombre}
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize    : "0.75rem",
                                padding     : "2px 8px",
                                borderRadius: "999px",
                                background  : e.Estudiante_Estado_Academico === "Regular" ? "#dcfce7" : "#fef9c3",
                                color       : e.Estudiante_Estado_Academico === "Regular" ? "#166534" : "#854d0e",
                              }}
                            >
                              {e.Estudiante_Estado_Academico}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Feedback de resultado */}
                {resultado && (
                  <div
                    style={{
                      background  : "#f0fdf4",
                      border      : "1px solid #bbf7d0",
                      borderRadius: "6px",
                      padding     : "10px 14px",
                      marginBottom: "16px",
                      fontSize    : "0.9rem",
                      color       : "#166534",
                    }}
                  >
                    ✓ {resultado.asignados} estudiante(s) asignado(s) correctamente.
                    {resultado.omitidos > 0 && (
                      <span style={{ color: "#92400e" }}>
                        {" "}· {resultado.omitidos} ya estaban asignados (omitidos).
                      </span>
                    )}
                  </div>
                )}

                {/* Error */}
                {errorModal && (
                  <p style={{ color: "#dc2626", marginBottom: "12px", fontSize: "0.9rem" }}>
                    {errorModal}
                  </p>
                )}

                {/* Acciones */}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="btn-primario"
                    onClick={handleAsignar}
                    disabled={loadingModal || seleccionados.length === 0}
                  >
                    {loadingModal
                      ? "Asignando..."
                      : `Asignar ${seleccionados.length > 0 ? `(${seleccionados.length})` : ""}`}
                  </button>
                  <button className="btn-desactivar" onClick={cerrarModal}>
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Apoderados;
