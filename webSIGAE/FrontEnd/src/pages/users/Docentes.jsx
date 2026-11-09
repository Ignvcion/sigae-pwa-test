import { useEffect, useMemo, useState } from "react";
import { getDocentes, getEspecialidades, actualizarEspecialidadesDocente } from "../../services/api";
import EtiquetasInput, { separarEtiquetas } from "../../components/EtiquetasInput";
import "./Docentes.css";

// CU30 y CU31: listado y filtros de docentes.
// - Barra de especialidades (etiquetas): clic para filtrar; varias elegidas muestran a los
//   docentes que tengan CUALQUIERA de ellas. También se filtra al hacer clic en una
//   etiqueta de la tabla.
// - Buscador por palabra clave: nombre, RUT, correo o especialidad (sin distinguir tildes).
// - RF04: las especialidades de cada docente se editan en la misma fila; escribir una
//   que no existe la crea en el catálogo.
// Los filtros se aplican al instante sobre el listado ya cargado.

const normalizar = (t) =>
  String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

function Docentes() {
  const [docentes, setDocentes] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [texto, setTexto] = useState("");
  const [etiquetasSel, setEtiquetasSel] = useState([]);
  const [estado, setEstado] = useState("");
  const [orden, setOrden] = useState({ campo: "Usuario_Nombre_Completo", ascendente: true });
  const [edicion, setEdicion] = useState(null); // { id, valores, guardando, error }
  const [aviso, setAviso] = useState("");

  const cargarCatalogo = () =>
    getEspecialidades().then((d) => setCatalogo(d || [])).catch(() => {});

  useEffect(() => {
    getDocentes({})
      .then((data) => setDocentes(Array.isArray(data) ? data : data?.docentes || []))
      // CU30/CU31 - Excepción "Problema técnico"
      .catch((error) => setErrorCarga(error.message || "No fue posible obtener el listado, reintente posteriormente"))
      .finally(() => setLoading(false));
    cargarCatalogo();
  }, []);

  const alternarEtiqueta = (nombre) => {
    setEtiquetasSel((sel) =>
      sel.some((e) => normalizar(e) === normalizar(nombre))
        ? sel.filter((e) => normalizar(e) !== normalizar(nombre))
        : [...sel, nombre]
    );
  };

  const limpiarFiltros = () => {
    setTexto("");
    setEtiquetasSel([]);
    setEstado("");
  };

  const hayFiltros = texto.trim() !== "" || etiquetasSel.length > 0 || estado !== "";

  const filtrados = useMemo(() => {
    const consulta = normalizar(texto);
    const elegidas = new Set(etiquetasSel.map(normalizar));
    return docentes.filter((d) => {
      const etiquetas = separarEtiquetas(d.Docente_Especialidad);
      if (elegidas.size > 0 && !etiquetas.some((e) => elegidas.has(normalizar(e)))) return false;
      if (estado !== "" && Number(d.Usuario_Estado_Cuenta) !== Number(estado)) return false;
      if (consulta) {
        const campos = [d.Usuario_Nombre_Completo, d.Usuario_RUT, d.Docente_Correo_Institucional, ...etiquetas];
        if (!campos.some((c) => normalizar(c).includes(consulta))) return false;
      }
      return true;
    });
  }, [docentes, texto, etiquetasSel, estado]);

  const alternarOrden = (campo) => {
    setOrden((prev) => ({ campo, ascendente: prev.campo === campo ? !prev.ascendente : true }));
  };
  const flechaOrden = (campo) => (orden.campo === campo ? (orden.ascendente ? " ↑" : " ↓") : "");

  const docentesOrdenados = [...filtrados].sort((a, b) => {
    const factor = orden.ascendente ? 1 : -1;
    return String(a[orden.campo] ?? "").localeCompare(String(b[orden.campo] ?? "")) * factor;
  });

  // CU31 - Excepción "Información incompleta": mostrar los datos faltantes en vez de dejarlos en blanco
  const renderDato = (valor, textoSinRegistrar) =>
    valor === null || valor === undefined || valor === "" ? (
      <span className="dato-sin-registrar">{textoSinRegistrar}</span>
    ) : (
      valor
    );

  const abrirEdicion = (d) => {
    setAviso("");
    setEdicion({ id: d.Usuario_Id, valores: separarEtiquetas(d.Docente_Especialidad), guardando: false, error: "" });
  };

  const guardarEdicion = async () => {
    if (edicion.valores.length === 0) {
      setEdicion({ ...edicion, error: "Agrega al menos una especialidad" });
      return;
    }
    setEdicion({ ...edicion, guardando: true, error: "" });
    try {
      const actualizado = await actualizarEspecialidadesDocente(edicion.id, edicion.valores);
      setDocentes((lista) => lista.map((d) => (
        d.Usuario_Id === edicion.id ? { ...d, Docente_Especialidad: actualizado.Docente_Especialidad } : d
      )));
      setAviso(`Especialidades de ${actualizado.Usuario_Nombre_Completo} actualizadas`);
      setEdicion(null);
      cargarCatalogo();
    } catch (error) {
      setEdicion((e) => e && { ...e, guardando: false, error: error.message || "No fue posible guardar" });
    }
  };

  if (loading) {
    return (
      <div className="usuarios-container">
        <p>Cargando docentes...</p>
      </div>
    );
  }

  const elegidas = new Set(etiquetasSel.map(normalizar));
  const nombresCatalogo = catalogo.map((e) => e.Especialidad_Nombre);

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Docentes</h1>
        <p>Listado de docentes registrados en el sistema</p>
      </div>

      <div className="usuarios-filtros">
        <input
          type="search"
          className="usuarios-search"
          placeholder="Buscar por nombre, RUT, correo o especialidad…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Buscar docentes"
        />
        <select
          className="usuarios-select"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="1">Activo</option>
          <option value="0">Inactivo</option>
        </select>
        {hayFiltros && (
          <button type="button" className="btn-roles" onClick={limpiarFiltros}>Limpiar filtros</button>
        )}
      </div>

      {catalogo.length > 0 && (
        <div className="filtro-especialidades" role="group" aria-label="Filtrar por especialidad">
          <span className="filtro-especialidades-titulo">Especialidades</span>
          {catalogo.map((e) => {
            const activa = elegidas.has(normalizar(e.Especialidad_Nombre));
            return (
              <button
                key={e.Especialidad_Id}
                type="button"
                className={`filtro-chip${activa ? " filtro-chip--activa" : ""}`}
                aria-pressed={activa}
                onClick={() => alternarEtiqueta(e.Especialidad_Nombre)}
              >
                {e.Especialidad_Nombre}
                <span className="filtro-chip-cuenta">{e.Total_Docentes}</span>
              </button>
            );
          })}
          {etiquetasSel.length > 1 && (
            <span className="filtro-especialidades-nota">Docentes con cualquiera de las elegidas</span>
          )}
        </div>
      )}

      {aviso && <div className="msg-exito" role="status">{aviso}</div>}

      {errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!errorCarga && docentesOrdenados.length === 0 && (
        <div className="usuarios-empty">
          {hayFiltros ? "No existen docentes asociados a los filtros aplicados" : "No existen docentes registrados"}
        </div>
      )}

      {!errorCarga && docentesOrdenados.length > 0 && (
        <>
          <p className="docentes-conteo">
            {hayFiltros ? `${docentesOrdenados.length} de ${docentes.length} docentes` : `${docentes.length} docentes`}
          </p>
          <div className="docentes-tabla-wrap">
            <table className="tabla-usuarios">
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ cursor: "pointer" }} onClick={() => alternarOrden("Usuario_Nombre_Completo")}>
                    Nombre{flechaOrden("Usuario_Nombre_Completo")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => alternarOrden("Usuario_RUT")}>
                    RUT{flechaOrden("Usuario_RUT")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => alternarOrden("Docente_Especialidad")}>
                    Especialidades{flechaOrden("Docente_Especialidad")}
                  </th>
                  <th>Correo institucional</th>
                  <th>Teléfono</th>
                  <th>Carga horaria semanal</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {docentesOrdenados.map((d, idx) => {
                  const etiquetas = separarEtiquetas(d.Docente_Especialidad);
                  const editando = edicion?.id === d.Usuario_Id;
                  return (
                    <tr key={d.Usuario_Id}>
                      <td>{idx + 1}</td>
                      <td>{d.Usuario_Nombre_Completo}</td>
                      <td>{d.Usuario_RUT}</td>
                      <td className="docentes-celda-especialidades">
                        {editando ? (
                          <div className="docentes-edicion">
                            <EtiquetasInput
                              valores={edicion.valores}
                              opciones={nombresCatalogo}
                              invalido={!!edicion.error}
                              onChange={(valores) => setEdicion({ ...edicion, valores, error: "" })}
                            />
                            {edicion.error && <span className="input-error-msg">{edicion.error}</span>}
                            <div className="docentes-edicion-acciones">
                              <button type="button" className="btn-mini btn-mini--primario" onClick={guardarEdicion} disabled={edicion.guardando}>
                                {edicion.guardando ? "Guardando…" : "Guardar"}
                              </button>
                              <button type="button" className="btn-mini" onClick={() => setEdicion(null)} disabled={edicion.guardando}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="docentes-etiquetas">
                            {etiquetas.length === 0 && <span className="dato-sin-registrar">Sin especialidad registrada</span>}
                            {etiquetas.map((e) => (
                              <button
                                key={e}
                                type="button"
                                className={`filtro-chip filtro-chip--tabla${elegidas.has(normalizar(e)) ? " filtro-chip--activa" : ""}`}
                                title={`Filtrar por ${e}`}
                                onClick={() => alternarEtiqueta(e)}
                              >
                                {e}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="btn-mini btn-mini--icono"
                              aria-label={`Editar especialidades de ${d.Usuario_Nombre_Completo}`}
                              title="Agregar o quitar especialidades"
                              onClick={() => abrirEdicion(d)}
                            >
                              {etiquetas.length === 0 ? "+ Agregar" : "✎ Editar"}
                            </button>
                          </div>
                        )}
                      </td>
                      <td>{renderDato(d.Docente_Correo_Institucional, "Sin correo institucional registrado")}</td>
                      <td>{renderDato(d.Usuario_Telefono, "Sin teléfono registrado")}</td>
                      <td>
                        {d.Docente_Carga_Horaria_Semanal == null || d.Docente_Carga_Horaria_Semanal === ""
                          ? renderDato(null, "Sin carga horaria registrada")
                          : `${d.Docente_Carga_Horaria_Semanal} h`}
                      </td>
                      <td>
                        {d.Usuario_Estado_Cuenta ? (
                          <span className="badge-activo">Activo</span>
                        ) : (
                          <span className="badge-inactivo">Inactivo</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default Docentes;
