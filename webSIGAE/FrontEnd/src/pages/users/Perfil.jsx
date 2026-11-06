import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useParams } from "react-router-dom";
import FormEditarUsuario from "./FormEditarUsuario";
import { EtiquetasLectura } from "../../components/EtiquetasInput";
import MiDisponibilidadLaboral from "../../components/MiDisponibilidadLaboral";
import { apiFetch, getAsignacionesDocente, getEstudiantesAsociados, getDetalleEstudiante, editarPerfilPropio, actualizarFotoPerfil } from "../../services/api";
import { validarTelefonoChileno, validarDireccion, formatearDireccion, COLUMNAS_DIRECCION_ESTUDIANTE, MENSAJE_TELEFONO } from "../../utils/validaciones";

// CU20: placeholder cuando el usuario no tiene fotografía de perfil registrada
const FOTO_PERFIL_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
      '<rect width="96" height="96" fill="#e2e8f0"/>' +
      '<circle cx="48" cy="38" r="18" fill="#94a3b8"/>' +
      '<path d="M16 88c0-17.7 14.3-32 32-32s32 14.3 32 32" fill="#94a3b8"/>' +
      '</svg>'
  );

function Perfil() {
  const { usuario } = useAuth();
  const { id: idParam } = useParams();
  const idObjetivo = idParam || usuario?.id;
  const esPerfilPropio = !idParam || String(idParam) === String(usuario?.id);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorPerfil, setErrorPerfil] = useState("");

  const [contrasenaActual, setContrasenaActual] = useState("");
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [msgExito, setMsgExito] = useState("");
  const [msgError, setMsgError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // CU42: Cursos y asignaturas del docente
  const [asignaciones, setAsignaciones] = useState([]);
  const [mensajeAsignaciones, setMensajeAsignaciones] = useState("");
  const [errorAsignaciones, setErrorAsignaciones] = useState("");
  const [cargandoAsignaciones, setCargandoAsignaciones] = useState(false);
  const [ordenAsignaciones, setOrdenAsignaciones] = useState("curso");

  // CU40: Estudiantes asociados al apoderado
  const [estudiantesAsociados, setEstudiantesAsociados] = useState([]);
  const [mensajeEstudiantes, setMensajeEstudiantes] = useState("");
  const [errorEstudiantes, setErrorEstudiantes] = useState("");
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(false);
  const [ordenEstudiantes, setOrdenEstudiantes] = useState("nombre");

  // CU41: Detalle de un estudiante asociado
  const [detalleEstudiante, setDetalleEstudiante] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [avisoLista, setAvisoLista] = useState("");

  // CU19: editar datos personales del propio perfil (correo, teléfono y/o dirección)
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [formPerfil, setFormPerfil] = useState({ correo: "", telefono: "", calle: "", numero: "", depto: "", comuna: "" });
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [msgExitoPerfil, setMsgExitoPerfil] = useState("");
  const [msgErrorPerfil, setMsgErrorPerfil] = useState("");

  // CU20: editar fotografía de perfil mediante carga de archivo
  const [archivoFoto, setArchivoFoto] = useState(null);
  const [previewFoto, setPreviewFoto] = useState("");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [msgExitoFoto, setMsgExitoFoto] = useState("");
  const [msgErrorFoto, setMsgErrorFoto] = useState("");

  useEffect(() => {
    if (!idObjetivo) return;
    setCargando(true);
    setErrorPerfil("");
    apiFetch(`/api/usuarios/${idObjetivo}`)
      .then(async (r) => {
        if (!r) return; // sesión expirada: apiFetch ya redirigió
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          // CU18 - Excepción "Falta de permisos" u otro rechazo del backend
          setErrorPerfil(data.mensaje || "No fue posible cargar el perfil");
          return;
        }
        setDatos(data);
      })
      .catch(() => setErrorPerfil("No fue posible cargar el perfil"))
      .finally(() => setCargando(false));
  }, [idObjetivo]);

  useEffect(() => {
    if (!datos?.Es_Docente || !idObjetivo) return;
    setCargandoAsignaciones(true);
    setErrorAsignaciones("");
    setMensajeAsignaciones("");
    getAsignacionesDocente(idObjetivo)
      .then((data) => {
        if (Array.isArray(data)) {
          setAsignaciones(data);
        } else {
          // Excepción 1: sin asignaciones registradas
          setAsignaciones(data.asignaciones || []);
          setMensajeAsignaciones(data.mensaje || "No existen asignaciones registradas.");
        }
      })
      .catch((error) => {
        // Excepción 2 (docente no encontrado) y Excepción 3 (error técnico)
        setErrorAsignaciones(error.message || "No fue posible cargar las asignaciones académicas, reintente más tarde");
      })
      .finally(() => setCargandoAsignaciones(false));
  }, [datos?.Es_Docente, idObjetivo]);

  useEffect(() => {
    if (!datos?.Es_Apoderado || !idObjetivo) return;
    setCargandoEstudiantes(true);
    setErrorEstudiantes("");
    setMensajeEstudiantes("");
    getEstudiantesAsociados(idObjetivo)
      .then((data) => {
        if (Array.isArray(data)) {
          setEstudiantesAsociados(data);
        } else {
          // Excepción 1: sin estudiantes asociados
          setEstudiantesAsociados(data.estudiantes || []);
          setMensajeEstudiantes(data.mensaje || "No existen estudiantes asociados a la cuenta.");
        }
      })
      .catch((error) => {
        // Excepción 2 (apoderado no encontrado) y Excepción 3 (error técnico)
        setErrorEstudiantes(error.message || "No fue posible cargar estudiantes, reintente más tarde");
      })
      .finally(() => setCargandoEstudiantes(false));
  }, [datos?.Es_Apoderado, idObjetivo]);

  // CU41: abrir/cerrar el detalle de un estudiante desde la lista de asociados
  const abrirDetalleEstudiante = async (estudianteId) => {
    setCargandoDetalle(true);
    setErrorDetalle("");
    setDetalleEstudiante(null);
    try {
      const data = await getDetalleEstudiante(idObjetivo, estudianteId);
      setDetalleEstudiante(data);
    } catch (error) {
      if (error.message === "El estudiante ya no se encuentra asociado a esta cuenta") {
        // Excepción: no se abre el detalle; se redirige a la lista ya actualizada
        setAvisoLista(error.message);
        setEstudiantesAsociados((prev) => prev.filter((e) => e.Estudiante_Id !== estudianteId));
      } else {
        setErrorDetalle(error.message || "No fue posible cargar la ficha estudiantil, reintente más tarde");
      }
    } finally {
      setCargandoDetalle(false);
    }
  };

  const cerrarDetalleEstudiante = () => {
    setDetalleEstudiante(null);
    setErrorDetalle("");
  };

  const recargarDatos = () => {
    apiFetch(`/api/usuarios/${idObjetivo}`)
      .then((r) => {
        if (!r || !r.ok) throw new Error(`HTTP ${r?.status}`);
        return r.json();
      })
      .then((data) => setDatos(data))
      .catch(console.error);
  };

  const getRoles = () => {
    if (!datos) return [];
    const roles = [];
    if (datos.Es_Administrador) roles.push("Administrador");
    if (datos.Es_Docente) roles.push("Docente");
    if (datos.Es_Apoderado) roles.push("Apoderado");
    return roles;
  };

  const getBadgeRol = (rol) => {
    if (rol === "Administrador") {
      if (datos?.Administrador_Tipo === "Super Admin") {
        return <span key="superadmin" className="badge-rol badge-superadmin">Super Administrador</span>;
      }
      return <span key="admin" className="badge-rol badge-admin">Administrador</span>;
    }
    if (rol === "Docente") return <span key="docente" className="badge-rol badge-docente">Docente</span>;
    if (rol === "Apoderado") return <span key="apoderado" className="badge-rol badge-apoderado">Apoderado</span>;
    return null;
  };

  const getCorreos = () => {
    if (!datos) return [];
    const correos = [];
    if (datos.Administrador_Correo_Institucional) correos.push(datos.Administrador_Correo_Institucional);
    if (datos.Docente_Correo_Institucional) correos.push(datos.Docente_Correo_Institucional);
    if (datos.Apoderado_Correo_Natural) correos.push(datos.Apoderado_Correo_Natural);
    return [...new Set(correos)];
  };

  const handleCambiarContrasena = async (e) => {
    e.preventDefault();
    setMsgExito("");
    setMsgError("");

    if (nuevaContrasena !== confirmarContrasena) {
      setMsgError("Las contraseñas nuevas no coinciden");
      return;
    }
    if (nuevaContrasena.length < 8) {
      setMsgError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (!/[A-Z]/.test(nuevaContrasena) || !/[0-9]/.test(nuevaContrasena)) {
      setMsgError("La nueva contraseña debe contener al menos una mayúscula y un número");
      return;
    }

    setEnviando(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/cambiar-contrasena", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          usuarioId: usuario.id,
          contrasenaActual,
          nuevaContrasena,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgError(data.error || "Error al actualizar contraseña");
      } else {
        setMsgExito(data.message || "Contraseña actualizada correctamente");
        setContrasenaActual("");
        setNuevaContrasena("");
        setConfirmarContrasena("");
      }
    } catch {
      setMsgError("Error de conexión al servidor");
    } finally {
      setEnviando(false);
    }
  };

  // CU19: editar datos personales del propio perfil
  const abrirEdicionPerfil = () => {
    setFormPerfil({
      correo: datos?.Administrador_Correo_Institucional || datos?.Docente_Correo_Institucional || datos?.Apoderado_Correo_Natural || "",
      telefono: datos?.Usuario_Telefono || "",
      calle: datos?.Usuario_Direccion_Calle || "",
      numero: datos?.Usuario_Direccion_Numero || "",
      depto: datos?.Usuario_Direccion_Depto || "",
      comuna: datos?.Usuario_Direccion_Comuna || "",
    });
    setMsgExitoPerfil("");
    setMsgErrorPerfil("");
    setEditandoPerfil(true);
  };

  const cancelarEdicionPerfil = () => {
    setEditandoPerfil(false);
    setMsgErrorPerfil("");
    setMsgExitoPerfil("");
  };

  const handleGuardarPerfil = async (e) => {
    e.preventDefault();
    setMsgErrorPerfil("");
    setMsgExitoPerfil("");

    // CU19 - Excepción "Formato de datos incorrecto": se valida antes de enviar
    if (!validarTelefonoChileno(formPerfil.telefono)) {
      setMsgErrorPerfil(MENSAJE_TELEFONO);
      return;
    }
    // La dirección aplica a todo usuario: obligatoria para el apoderado; en los demás
    // roles se valida y se envía solo si se ingresó
    const { calle, numero, depto, comuna } = formPerfil;
    const incluyeDireccion =
      !!datos?.Es_Apoderado || [calle, numero, depto, comuna].some((v) => String(v || "").trim() !== "");
    if (incluyeDireccion) {
      const erroresDireccion = Object.values(validarDireccion(formPerfil));
      if (erroresDireccion.length > 0) {
        setMsgErrorPerfil(erroresDireccion[0]);
        return;
      }
    }

    setGuardandoPerfil(true);
    try {
      const tieneCorreo = !!(datos?.Es_Administrador || datos?.Es_Docente || datos?.Es_Apoderado);
      const payload = { telefono: formPerfil.telefono };
      if (tieneCorreo) payload.correo = formPerfil.correo;
      if (incluyeDireccion) payload.direccion = { calle, numero, depto, comuna };

      const data = await editarPerfilPropio(payload);
      setMsgExitoPerfil(data.mensaje || "Cambios guardados correctamente");
      recargarDatos();
    } catch (error) {
      // CU19 - Excepciones "Formato de datos incorrecto" y "Correo ya registrado"
      setMsgErrorPerfil(error.message || "No fue posible actualizar tu perfil, reintente más tarde");
    } finally {
      setGuardandoPerfil(false);
    }
  };

  // CU20: editar fotografía de perfil mediante carga de archivo
  const handleSeleccionArchivo = (e) => {
    const archivo = e.target.files?.[0];
    setMsgExitoFoto("");
    setMsgErrorFoto("");
    if (!archivo) {
      // CU20 - Excepción "Cancela selección": no se eligió ningún archivo, se mantiene la fotografía actual
      setArchivoFoto(null);
      setPreviewFoto("");
      return;
    }
    setArchivoFoto(archivo);
    setPreviewFoto(URL.createObjectURL(archivo));
  };

  const cancelarSeleccionFoto = () => {
    setArchivoFoto(null);
    setPreviewFoto("");
    setMsgExitoFoto("");
    setMsgErrorFoto("");
  };

  const handleSubirFoto = async (e) => {
    e.preventDefault();
    if (!archivoFoto) return;
    setMsgExitoFoto("");
    setMsgErrorFoto("");
    setSubiendoFoto(true);
    try {
      const data = await actualizarFotoPerfil(archivoFoto);
      setMsgExitoFoto(data.mensaje || "Fotografía actualizada correctamente");
      setArchivoFoto(null);
      setPreviewFoto("");
      recargarDatos();
    } catch (error) {
      // CU20 - Excepciones "Formato o tamaño inválido" y "Error técnico de almacenamiento"
      setMsgErrorFoto(error.message || "No fue posible guardar la fotografía, reintente más tarde");
    } finally {
      setSubiendoFoto(false);
    }
  };

  if (cargando) return <div className="perfil-container"><p>Cargando perfil...</p></div>;
  if (errorPerfil) {
    return (
      <div className="perfil-container">
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>{errorPerfil}</div>
      </div>
    );
  }
  if (!datos) return <div className="perfil-container"><p>No se pudo cargar el perfil.</p></div>;

  const roles = getRoles();
  const correos = getCorreos();

  const puedeEditar = (() => {
    if (esPerfilPropio) return false;
    if (!datos) return false;
    const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
    const esAdmin = (usuario?.roles || []).includes("Administrador");
    const objetivoEsSuperAdmin = datos.Es_Administrador && datos.Administrador_Tipo === "Super Admin";
    const objetivoEsAdmin = datos.Es_Administrador && datos.Administrador_Tipo !== "Super Admin";
    if (objetivoEsSuperAdmin) return false;
    if (objetivoEsAdmin) return esSuperAdmin;
    return esSuperAdmin || esAdmin;
  })();

  return (
    <div className="perfil-container perfil-container--amplio">
      <div className="perfil-header">
        <h1>{esPerfilPropio ? "Mi Perfil" : `Perfil de ${datos?.Usuario_Nombre_Completo || "Usuario"}`}</h1>
        <p>{esPerfilPropio ? "Información de tu cuenta en SIGAE" : "Vista de perfil (solo lectura)"}</p>
      </div>

      {/* Grilla en bloques: la identidad ocupa todo el ancho (sus datos en a lo más
          dos filas), cursos y estudiantes anchos y las tarjetas de la cuenta debajo */}
      <div className="perfil-bento">
        <div className="perfil-card perfil-card--identidad">
          <div className="perfil-identidad">
            <img
              src={previewFoto || datos?.Usuario_Foto_Perfil || FOTO_PERFIL_PLACEHOLDER}
              alt="Fotografía de perfil"
              className="perfil-identidad-foto"
            />
            <div style={{ minWidth: 0 }}>
              <div className="perfil-identidad-nombre">{datos?.Usuario_Nombre_Completo || "Sin nombre registrado"}</div>
              <div className="perfil-roles">
                {roles.length > 0
                  ? roles.map((r) => getBadgeRol(r))
                  : <span>Sin roles asignados</span>}
                {datos?.Usuario_Estado_Cuenta
                  ? <span className="badge-activo" title="Estado de cuenta">Cuenta activa</span>
                  : <span className="badge-inactivo" title="Estado de cuenta">Cuenta inactiva</span>}
              </div>
            </div>
          </div>
          <h2>Información Personal</h2>
          <div className="perfil-grid perfil-grid--fluida">
            <div className="perfil-campo">
              <label>RUT</label>
              <span>{datos?.Usuario_RUT || "Sin RUT registrado"}</span>
            </div>
            <div className="perfil-campo">
              <label>Teléfono</label>
              <span>{datos?.Usuario_Telefono || "Sin teléfono registrado"}</span>
            </div>
            <div className="perfil-campo perfil-campo--doble">
              <label>Correo(s)</label>
              {/* Espacio invisible tras la @: si no cabe, el correo corta ahí y no a mitad de palabra */}
              <span>{correos.length > 0 ? correos.join(" · ").replaceAll("@", "@\u200B") : "Sin correos registrados"}</span>
            </div>
            {/* CU17 - Excepción "Sin información complementaria": el usuario no tiene ningún rol con datos adicionales */}
            {roles.length === 0 && (
              <div className="usuarios-empty" style={{ gridColumn: "1 / -1" }}>
                No existe información complementaria disponible
              </div>
            )}
            {datos?.Es_Docente ? (
              <>
                <div className="perfil-campo">
                  <label>Especialidades</label>
                  <span><EtiquetasLectura texto={datos.Docente_Especialidad} /></span>
                </div>
                <div className="perfil-campo">
                  <label>Carga Horaria Semanal</label>
                  <span>{datos.Docente_Carga_Horaria_Maxima || "Sin carga horaria registrada"} hrs</span>
                </div>
              </>
            ) : null}
            <div className="perfil-campo perfil-campo--doble">
              <label>Dirección</label>
              <span>{formatearDireccion(datos) || "Sin dirección registrada"}</span>
            </div>
          </div>
        </div>

        {!!datos?.Es_Docente && (
          <div className="perfil-card perfil-card--ancha">
            <h2>{esPerfilPropio ? "Mis cursos y asignaturas" : "Cursos y asignaturas"}</h2>

            {cargandoAsignaciones && <p>Cargando asignaciones académicas...</p>}

            {!cargandoAsignaciones && errorAsignaciones && (
              <div className="usuarios-empty" style={{ color: "#dc2626" }}>{errorAsignaciones}</div>
            )}

            {!cargandoAsignaciones && !errorAsignaciones && mensajeAsignaciones && (
              <div className="usuarios-empty">{mensajeAsignaciones}</div>
            )}

            {!cargandoAsignaciones && !errorAsignaciones && !mensajeAsignaciones && (
              <>
                <div className="usuarios-filtros" style={{ marginBottom: "12px" }}>
                  <select
                    className="usuarios-select"
                    value={ordenAsignaciones}
                    onChange={(e) => setOrdenAsignaciones(e.target.value)}
                  >
                    <option value="curso">Ordenar por curso</option>
                    <option value="asignatura">Ordenar por asignatura</option>
                    <option value="horas">Ordenar por carga horaria</option>
                    <option value="estado">Ordenar por estado de vigencia</option>
                  </select>
                </div>

                <div className="perfil-bloques">
                  {[...asignaciones]
                    .sort((a, b) => {
                      if (ordenAsignaciones === "asignatura") return a.asignatura.localeCompare(b.asignatura);
                      if (ordenAsignaciones === "horas") return b.horasSemanales - a.horasSemanales;
                      if (ordenAsignaciones === "estado") return a.estadoVigencia.localeCompare(b.estadoVigencia);
                      return a.curso.localeCompare(b.curso);
                    })
                    .map((asig) => (
                      <div key={`${asig.cursoId}-${asig.asignaturaId}`} className="perfil-bloque perfil-bloque--docente">
                        <div className="perfil-bloque-cabecera">
                          <strong>{asig.asignatura}</strong>
                          {asig.estadoVigencia === "Activo" ? (
                            <span className="badge-activo">Activo</span>
                          ) : (
                            <span className="badge-inactivo">Suspendido</span>
                          )}
                        </div>
                        <div className="perfil-bloque-detalle">{asig.curso} · {asig.nivelEducativo}</div>
                        <div className="perfil-bloque-metricas">
                          <span><b>{asig.bloques.length}</b> {asig.bloques.length === 1 ? "bloque" : "bloques"}</span>
                          <span><b>{asig.horasSemanales}</b> h/sem</span>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {!!datos?.Es_Apoderado && (
          <div className="perfil-card perfil-card--ancha">
            <h2>{esPerfilPropio ? "Mis estudiantes asociados" : "Estudiantes asociados"}</h2>

            {cargandoEstudiantes && <p>Cargando estudiantes asociados...</p>}

            {!cargandoEstudiantes && errorEstudiantes && (
              <div className="usuarios-empty" style={{ color: "#dc2626" }}>{errorEstudiantes}</div>
            )}

            {avisoLista && (
              <div className="usuarios-empty" style={{ marginBottom: "12px" }}>
                {avisoLista}
                <button
                  type="button"
                  className="btn-roles"
                  style={{ marginLeft: "10px", fontSize: "0.8rem", padding: "2px 8px" }}
                  onClick={() => setAvisoLista("")}
                >
                  Cerrar
                </button>
              </div>
            )}

            {!cargandoEstudiantes && !errorEstudiantes && mensajeEstudiantes && (
              <div className="usuarios-empty">{mensajeEstudiantes}</div>
            )}

            {!cargandoEstudiantes && !errorEstudiantes && !mensajeEstudiantes && (
              <>
                <div className="usuarios-filtros" style={{ marginBottom: "12px" }}>
                  <select
                    className="usuarios-select"
                    value={ordenEstudiantes}
                    onChange={(e) => setOrdenEstudiantes(e.target.value)}
                  >
                    <option value="nombre">Ordenar por nombre</option>
                    <option value="curso">Ordenar por curso</option>
                  </select>
                </div>

                <div className="perfil-bloques">
                  {[...estudiantesAsociados]
                    .sort((a, b) =>
                      ordenEstudiantes === "curso"
                        ? a.Curso_Nombre.localeCompare(b.Curso_Nombre)
                        : a.Estudiante_Nombre_Completo.localeCompare(b.Estudiante_Nombre_Completo)
                    )
                    .map((est) => (
                      <div key={est.Estudiante_Id} className="perfil-bloque perfil-bloque--apoderado">
                        <div className="perfil-bloque-cabecera">
                          <strong>{est.Estudiante_Nombre_Completo}</strong>
                          {est.Estudiante_Estado_Academico === "Regular" ? (
                            <span className="badge-activo">Regular</span>
                          ) : (
                            <span className="badge-inactivo">{est.Estudiante_Estado_Academico}</span>
                          )}
                        </div>
                        <div className="perfil-bloque-detalle">{est.Curso_Nombre} · RUT {est.Estudiante_RUT}</div>
                        <button
                          type="button"
                          className="btn-roles perfil-bloque-accion"
                          onClick={() => abrirDetalleEstudiante(est.Estudiante_Id)}
                        >
                          Ver detalle
                        </button>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* CU20: editar fotografía de perfil mediante carga de archivo */}
        {esPerfilPropio && (
          <div className="perfil-card">
            <h2>Fotografía de Perfil</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              <img
                src={previewFoto || datos?.Usuario_Foto_Perfil || FOTO_PERFIL_PLACEHOLDER}
                alt="Vista previa de la fotografía"
                style={{ width: "72px", height: "72px", borderRadius: "50%", objectFit: "cover", border: "1px solid #e2e8f0" }}
              />
              <form style={{ display: "flex", flexDirection: "column", gap: "10px" }} onSubmit={handleSubirFoto}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSeleccionArchivo}
                />
                {msgExitoFoto && <div className="msg-exito">{msgExitoFoto}</div>}
                {msgErrorFoto && <div className="msg-error-form">{msgErrorFoto}</div>}
                {archivoFoto && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="submit" className="btn-primario" disabled={subiendoFoto}>
                      {subiendoFoto ? "Guardando..." : "Guardar fotografía"}
                    </button>
                    <button type="button" className="btn-desactivar" onClick={cancelarSeleccionFoto} disabled={subiendoFoto}>
                      Cancelar
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* CU19: editar datos personales del propio perfil (correo, teléfono y/o dirección) */}
        {esPerfilPropio && (
          <div className="perfil-card">
            <h2>Editar Perfil</h2>
            {!editandoPerfil ? (
              <button className="btn-roles" onClick={abrirEdicionPerfil}>Editar perfil</button>
            ) : (
              <form className="cambiar-pwd-form" onSubmit={handleGuardarPerfil}>
                <div className="campo-pwd">
                  <label>Nombre Completo</label>
                  <input value={datos?.Usuario_Nombre_Completo || ""} readOnly disabled />
                </div>
                <div className="campo-pwd">
                  <label>RUT</label>
                  <input value={datos?.Usuario_RUT || ""} readOnly disabled />
                </div>
                {!!(datos?.Es_Administrador || datos?.Es_Docente || datos?.Es_Apoderado) && (
                  <div className="campo-pwd">
                    <label htmlFor="correoPerfil">Correo</label>
                    <input
                      id="correoPerfil"
                      value={formPerfil.correo}
                      onChange={(e) => setFormPerfil((f) => ({ ...f, correo: e.target.value }))}
                    />
                  </div>
                )}
                <div className="campo-pwd">
                  <label htmlFor="telefonoPerfil">Teléfono</label>
                  <input
                    id="telefonoPerfil"
                    type="tel"
                    placeholder="912345678 o +56912345678"
                    value={formPerfil.telefono}
                    onChange={(e) => setFormPerfil((f) => ({ ...f, telefono: e.target.value }))}
                  />
                </div>
                {[
                  { name: "calle",  label: "Calle",                  maxLength: 100 },
                  { name: "numero", label: "Número",                 maxLength: 7 },
                  { name: "depto",  label: "Depto./Casa (opcional)", maxLength: 20 },
                  { name: "comuna", label: "Comuna",                 maxLength: 60 },
                ].map((campo) => (
                  <div className="campo-pwd" key={campo.name}>
                    <label htmlFor={`${campo.name}Perfil`}>{campo.label}</label>
                    <input
                      id={`${campo.name}Perfil`}
                      maxLength={campo.maxLength}
                      value={formPerfil[campo.name]}
                      onChange={(e) => setFormPerfil((f) => ({ ...f, [campo.name]: e.target.value }))}
                    />
                  </div>
                ))}

                {msgExitoPerfil && <div className="msg-exito">{msgExitoPerfil}</div>}
                {msgErrorPerfil && <div className="msg-error-form">{msgErrorPerfil}</div>}

                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button type="submit" className="btn-primario" disabled={guardandoPerfil}>
                    {guardandoPerfil ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button type="button" className="btn-desactivar" onClick={cancelarEdicionPerfil} disabled={guardandoPerfil}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {esPerfilPropio && (
          <div className="perfil-card">
            <h2>Cambiar Contraseña</h2>
            <form className="cambiar-pwd-form" onSubmit={handleCambiarContrasena}>
              <div className="campo-pwd">
                <label htmlFor="contrasenaActual">Contraseña Actual</label>
                <input
                  id="contrasenaActual"
                  type="password"
                  value={contrasenaActual}
                  onChange={(e) => setContrasenaActual(e.target.value)}
                  required
                />
              </div>
              <div className="campo-pwd">
                <label htmlFor="nuevaContrasena">Nueva Contraseña</label>
                <input
                  id="nuevaContrasena"
                  type="password"
                  value={nuevaContrasena}
                  onChange={(e) => setNuevaContrasena(e.target.value)}
                  required
                />
                <span className="pwd-error" style={{ display: nuevaContrasena && nuevaContrasena.length < 8 ? "block" : "none" }}>
                  Mínimo 8 caracteres, una mayúscula y un número
                </span>
              </div>
              <div className="campo-pwd">
                <label htmlFor="confirmarContrasena">Confirmar Nueva Contraseña</label>
                <input
                  id="confirmarContrasena"
                  type="password"
                  value={confirmarContrasena}
                  onChange={(e) => setConfirmarContrasena(e.target.value)}
                  className={confirmarContrasena && confirmarContrasena !== nuevaContrasena ? "input-invalid" : ""}
                  required
                />
              </div>
              {msgExito && <div className="msg-exito">{msgExito}</div>}
              {msgError && <div className="msg-error-form">{msgError}</div>}
              <button type="submit" className="btn-primario" disabled={enviando}>
                {enviando ? "Actualizando..." : "Actualizar contraseña"}
              </button>
            </form>
          </div>
        )}

        {/* CU107: el docente ve su disponibilidad laboral (la edita solo el administrador) */}
        {esPerfilPropio && !!datos?.Es_Docente && <MiDisponibilidadLaboral usuarioId={datos.Usuario_Id} />}

        {/* Edición por el administrador, en bloques separados (cada uno se guarda por su cuenta) */}
        {puedeEditar && <FormEditarUsuario datos={datos} onGuardado={recargarDatos} />}
      </div>

      {/* CU41: Detalle de estudiante desde la lista de asociados — modal de solo lectura */}
      {(cargandoDetalle || errorDetalle || detalleEstudiante) && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div className="form-card" style={{ width: "420px", maxWidth: "95vw" }}>
            <h2 style={{ marginBottom: "16px" }}>Ficha del estudiante</h2>

            {cargandoDetalle && <p>Cargando ficha estudiantil...</p>}

            {!cargandoDetalle && errorDetalle && (
              <p style={{ color: "#dc2626", marginBottom: "16px" }}>{errorDetalle}</p>
            )}

            {!cargandoDetalle && detalleEstudiante && (
              <div className="perfil-grid" style={{ marginBottom: "16px" }}>
                <div className="perfil-campo">
                  <label>Nombre Completo</label>
                  <span>{detalleEstudiante.Estudiante_Nombre_Completo}</span>
                </div>
                <div className="perfil-campo">
                  <label>RUT</label>
                  <span>{detalleEstudiante.Estudiante_RUT}</span>
                </div>
                <div className="perfil-campo">
                  <label>Curso</label>
                  <span>{detalleEstudiante.Curso_Nombre}</span>
                </div>
                <div className="perfil-campo">
                  <label>Estado Académico</label>
                  <span>
                    {detalleEstudiante.Estudiante_Estado_Academico === "Regular" ? (
                      <span className="badge-activo">Regular</span>
                    ) : (
                      <span className="badge-inactivo">{detalleEstudiante.Estudiante_Estado_Academico}</span>
                    )}
                  </span>
                </div>
                <div className="perfil-campo" style={{ gridColumn: "1 / -1" }}>
                  <label>Dirección</label>
                  <span>
                    {formatearDireccion(detalleEstudiante, COLUMNAS_DIRECCION_ESTUDIANTE) || "Sin dirección registrada"}
                  </span>
                </div>
              </div>
            )}

            {/* Opción adicional para Admin/SuperAdmin: gestionar la asociación (CU39) */}
            {!cargandoDetalle && detalleEstudiante && (usuario?.roles || []).includes("Administrador") && (
              <p style={{ marginBottom: "16px" }}>
                <Link to="/apoderados" onClick={cerrarDetalleEstudiante}>
                  Gestionar asociación de este estudiante →
                </Link>
              </p>
            )}

            <button type="button" className="btn-roles" onClick={cerrarDetalleEstudiante}>
              Cerrar
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default Perfil;