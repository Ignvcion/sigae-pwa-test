// RF61: situación final de los estudiantes (CU98, CU99) y promoción curso a curso
// o caso por caso (CU100). La usan el profesor jefe (sus cursos) y la administración.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getMisJefaturas,
  getSituaciones,
  registrarSituaciones,
  descargarPlantilla,
  cargarExcel,
  promoverCurso,
} from "../../services/promocion";
import { apiUrl } from '../../services/api';

const ETIQUETA_ESTADO = { Borrador: "Borrador", Registrado: "Registrada", Aplicado: "Aplicada" };

function SituacionFinal() {
  const { usuario } = useAuth();
  const rolActivo = localStorage.getItem("rolActivo");
  const esAdmin = usuario?.roles?.includes("Administrador") && rolActivo !== "Docente";
  const [params, setParams] = useSearchParams();

  const [cursos, setCursos] = useState([]);
  const [cursoId, setCursoId] = useState(params.get("curso") || "");
  const [datos, setDatos] = useState(null);
  const [valores, setValores] = useState({}); // estudianteId -> valor elegido
  const [seleccion, setSeleccion] = useState({}); // estudianteId -> true (promoción individual)
  const [previa, setPrevia] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Cursos disponibles: administración = cursos del período vigente; docente = sus jefaturas vigentes
  useEffect(() => {
    (async () => {
      try {
        if (esAdmin) {
          const res = await fetch(apiUrl("/api/cursos"), { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
          const lista = await res.json();
          const vigente = lista.length ? lista.map((c) => c.Curso_Periodo_Lectivo).sort()[0] : null;
          setCursos(lista.filter((c) => c.Curso_Periodo_Lectivo === vigente));
        } else {
          const d = await getMisJefaturas();
          if (d) setCursos(d.cursos.filter((c) => c.Curso_Periodo_Lectivo === d.periodoVigente));
        }
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [esAdmin]);

  const aplicarDatos = (d) => {
    if (!d) return;
    setDatos(d);
    setValores(Object.fromEntries(d.estudiantes.filter((e) => e.situacion).map((e) => [e.Estudiante_Id, e.situacion.valor])));
    setSeleccion({});
    setPrevia(null);
  };
  const fallo = (e) => {
    setDatos(null);
    setError(e.message);
  };
  const cargar = () => getSituaciones(cursoId).then(aplicarDatos).catch(fallo);

  // Al elegir un curso: se guarda en la URL (para volver desde "Cierre de período") y se carga
  useEffect(() => {
    if (!cursoId) return;
    setParams({ curso: cursoId }, { replace: true });
    getSituaciones(cursoId).then(aplicarDatos).catch(fallo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoId]);

  const editables = useMemo(
    () => (datos?.estudiantes || []).filter((e) => e.enCurso && e.situacion?.estado !== "Aplicado"),
    [datos]
  );

  const guardar = async (confirmar) => {
    setError("");
    setExito("");
    const situaciones = editables
      .filter((e) => valores[e.Estudiante_Id])
      .map((e) => ({ estudianteId: e.Estudiante_Id, valor: valores[e.Estudiante_Id] }));
    if (situaciones.length === 0) {
      setError("Asigna la situación final de al menos un estudiante");
      return;
    }
    setOcupado(true);
    try {
      const r = await registrarSituaciones(cursoId, situaciones, confirmar);
      if (r) {
        setExito(r.faltantes?.length
          ? `${r.mensaje}: ${r.faltantes.map((f) => f.Estudiante_Nombre_Completo).join(", ")}`
          : r.mensaje);
        await cargar();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const subirExcel = async (confirmar) => {
    if (!archivo) {
      setError("Selecciona el archivo Excel");
      return;
    }
    setError("");
    setExito("");
    setOcupado(true);
    try {
      const r = await cargarExcel(cursoId, archivo, confirmar);
      if (!r) return;
      if (confirmar) {
        setExito(r.mensaje);
        setArchivo(null);
        await cargar();
      } else {
        setPrevia(r);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  // CU100: aplicar la promoción del curso completo o de los estudiantes marcados
  const promover = async (individual) => {
    const estudianteIds = individual ? Object.keys(seleccion).filter((k) => seleccion[k]).map(Number) : undefined;
    if (individual && estudianteIds.length === 0) {
      setError("Marca al menos un estudiante con su situación registrada");
      return;
    }
    const texto = individual
      ? `¿Aplicar la promoción de ${estudianteIds.length} estudiante(s)? Esta acción no se puede deshacer.`
      : `¿Aplicar la promoción de todas las situaciones registradas de ${datos.curso.Curso_Nombre}? Esta acción no se puede deshacer.`;
    if (!window.confirm(texto)) return;
    setError("");
    setExito("");
    setOcupado(true);
    try {
      const cuerpo = individual ? { estudianteIds } : {};
      let r = await promoverCurso(cursoId, cuerpo);
      if (r?.requiereCrearCursos) {
        if (!window.confirm(r.mensaje)) return;
        r = await promoverCurso(cursoId, { ...cuerpo, crearCursosFaltantes: true });
      }
      if (r) {
        const partes = [r.mensaje];
        if (r.cursosCreados?.length) partes.push(`Cursos creados: ${r.cursosCreados.join(", ")}`);
        if (r.advertencias?.length) partes.push(...r.advertencias);
        setExito(partes.join(". "));
        await cargar();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Situación final</h1>
          <p>
            {esAdmin
              ? "Registro de la situación final y promoción, curso a curso o caso por caso"
              : "Situación final de los estudiantes de tus cursos de jefatura"}
          </p>
        </div>
      </div>

      {error && <p className="msg-error">{error}</p>}
      {exito && <p className="msg-exito">{exito}</p>}

      <div className="form-card">
        <label>Curso</label>
        {cursos.length === 0 ? (
          <p>{esAdmin ? "No hay cursos en el período vigente." : "No eres profesor jefe de ningún curso del período vigente."}</p>
        ) : (
          <select value={cursoId} onChange={(e) => setCursoId(e.target.value)} style={{ maxWidth: "100%" }}>
            <option value="">Seleccionar curso...</option>
            {cursos.map((c) => (
              <option key={c.Curso_Id} value={c.Curso_Id}>{c.Curso_Nombre} ({c.Curso_Periodo_Lectivo})</option>
            ))}
          </select>
        )}
      </div>

      {datos && (
        <>
          <div className="form-card">
            <p style={{ margin: 0 }}>
              <strong>{datos.curso.Curso_Nombre}</strong> · período {datos.periodo} ·{" "}
              {datos.resumen.total} estudiante(s): {datos.resumen.sinSituacion} sin situación,{" "}
              {datos.resumen.borrador} en borrador, {datos.resumen.registrado} registradas,{" "}
              {datos.resumen.aplicado} aplicadas
            </p>
            {!datos.cierreIniciado && (
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                El cierre del período no se ha iniciado: por ahora solo se pueden aplicar retiros.
              </p>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="tabla-asignaturas">
              <thead>
                <tr>
                  {esAdmin && <th aria-label="Seleccionar"></th>}
                  <th>Estudiante</th>
                  <th>RUT</th>
                  <th>Situación final</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.estudiantes.map((e) => {
                  const aplicada = e.situacion?.estado === "Aplicado";
                  const registrada = e.situacion?.estado === "Registrado";
                  return (
                    <tr key={e.Estudiante_Id}>
                      {esAdmin && (
                        <td>
                          <input
                            type="checkbox"
                            disabled={!registrada}
                            checked={Boolean(seleccion[e.Estudiante_Id])}
                            onChange={(ev) => setSeleccion((s) => ({ ...s, [e.Estudiante_Id]: ev.target.checked }))}
                            aria-label={`Promover a ${e.Estudiante_Nombre_Completo}`}
                          />
                        </td>
                      )}
                      <td>{e.Estudiante_Nombre_Completo}</td>
                      <td>{e.Estudiante_RUT}</td>
                      <td>
                        {aplicada ? (
                          e.situacion.valor
                        ) : (
                          <select
                            value={valores[e.Estudiante_Id] || ""}
                            onChange={(ev) => setValores((v) => ({ ...v, [e.Estudiante_Id]: ev.target.value }))}
                          >
                            <option value="">—</option>
                            {datos.valoresPermitidos.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        )}
                      </td>
                      <td>{e.situacion ? ETIQUETA_ESTADO[e.situacion.estado] : "Sin situación"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {editables.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: "1rem 0" }}>
              <button className="btn-volver" disabled={ocupado} onClick={() => guardar(false)}>Guardar borrador</button>
              <button className="btn-primary" disabled={ocupado} onClick={() => guardar(true)}>Confirmar situación final</button>
            </div>
          )}

          {esAdmin && datos.resumen.registrado > 0 && (
            <div className="form-card">
              <h3 style={{ marginTop: 0 }}>Promoción</h3>
              <p style={{ fontSize: "0.9rem" }}>
                Promovidos pasan al curso del nivel siguiente y repitentes al mismo nivel, ambos en el período
                siguiente y en la misma sección. Egresados, en práctica y retirados se quedan en este curso.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <button className="btn-primary" disabled={ocupado} onClick={() => promover(false)}>Promover el curso</button>
                <button className="btn-volver" disabled={ocupado} onClick={() => promover(true)}>Promover los marcados</button>
              </div>
            </div>
          )}

          {editables.length > 0 && (
            <div className="form-card">
              <h3 style={{ marginTop: 0 }}>Carga por Excel</h3>
              <p style={{ fontSize: "0.9rem" }}>
                Descarga la plantilla del curso, completa la columna Situación y súbela. Antes de registrar se muestra
                un resumen con las filas válidas y las rechazadas.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <button className="btn-volver" disabled={ocupado} onClick={() => descargarPlantilla(cursoId).catch((e) => setError(e.message))}>
                  Descargar plantilla
                </button>
                <input type="file" accept=".xlsx" onChange={(e) => { setArchivo(e.target.files?.[0] || null); setPrevia(null); }} />
                <button className="btn-primary" disabled={ocupado || !archivo} onClick={() => subirExcel(false)}>Revisar archivo</button>
              </div>

              {previa && (
                <div style={{ marginTop: "1rem" }}>
                  <p><strong>{previa.validas.length}</strong> fila(s) válida(s), <strong>{previa.rechazadas.length}</strong> rechazada(s).</p>
                  {previa.rechazadas.length > 0 && (
                    <ul>
                      {previa.rechazadas.map((f) => <li key={`r${f.fila}`}>Fila {f.fila} ({f.rut || "sin RUT"}): {f.motivo}</li>)}
                    </ul>
                  )}
                  {previa.advertencias.length > 0 && (
                    <ul>
                      {previa.advertencias.map((a) => <li key={`a${a.fila}`}>Fila {a.fila}: {a.mensaje}</li>)}
                    </ul>
                  )}
                  {previa.validas.length > 0 && (
                    <button className="btn-primary" disabled={ocupado} onClick={() => subirExcel(true)}>
                      Registrar {previa.validas.length} fila(s) válida(s)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SituacionFinal;
