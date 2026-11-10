// Cambio de período lectivo (docs/decisiones-rf60-rf61-periodos.txt, puntos 5 y 6).
// Administración: ve el avance. Super Admin: inicia el cierre, descarga el respaldo e
// inicia el nuevo período.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getEstadoPeriodo, iniciarCierre, descargarRespaldo, iniciarNuevoPeriodo } from "../../services/promocion";
import { CORREO_RESPALDOS } from "../../config/institucion";

function CierrePeriodo() {
  const { usuario } = useAuth();
  const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [respaldoDescargado, setRespaldoDescargado] = useState(false);
  const [respaldoGuardado, setRespaldoGuardado] = useState(false);

  const cargar = async () => {
    try {
      const d = await getEstadoPeriodo();
      if (d) setEstado(d);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    getEstadoPeriodo().then((d) => d && setEstado(d)).catch((e) => setError(e.message));
  }, []);

  const accion = async (fn, confirmacion) => {
    if (confirmacion && !window.confirm(confirmacion)) return;
    setError("");
    setExito("");
    setOcupado(true);
    try {
      const r = await fn();
      if (r?.mensaje) setExito(r.mensaje);
      await cargar();
      return r;
    } catch (e) {
      setError(e.data?.motivos ? `${e.message}: ${e.data.motivos.join(". ")}` : e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!estado) {
    return <div className="page-container">{error ? <p className="msg-error">{error}</p> : <p>Cargando...</p>}</div>;
  }

  const { periodos, cursosVigentes, cursosSiguientes, puedeIniciarNuevoPeriodo, motivos, limpieza } = estado;
  const hayLimpieza = Object.values(limpieza).some((n) => n > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Cierre de período</h1>
          <p>
            Período vigente: <strong>{periodos.vigente}</strong>
            {periodos.siguiente ? <> · en preparación: <strong>{periodos.siguiente}</strong></> : " · cierre no iniciado"}
          </p>
        </div>
      </div>

      {error && <p className="msg-error">{error}</p>}
      {exito && <p className="msg-exito">{exito}</p>}

      {!periodos.cierreIniciado && (
        <div className="form-card">
          <h3 style={{ marginTop: 0 }}>1. Iniciar cierre</h3>
          <p>
            Abre el período {Number(periodos.vigente) + 1}: desde ahí se aplican las promociones y se arman los cursos y
            horarios del año nuevo. El trabajo diario sigue en {periodos.vigente}.
          </p>
          {esSuperAdmin ? (
            <button
              className="btn-primary"
              disabled={ocupado}
              onClick={() => accion(iniciarCierre, `¿Iniciar el cierre de ${periodos.vigente}?`)}
            >
              Iniciar cierre
            </button>
          ) : (
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Solo el super administrador puede iniciar el cierre.</p>
          )}
        </div>
      )}

      <div className="form-card">
        <h3 style={{ marginTop: 0 }}>Promoción de los cursos de {periodos.vigente}</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="tabla-asignaturas">
            <thead>
              <tr>
                <th>Curso</th><th>Profesor jefe</th><th>En el curso</th><th>Sin situación</th>
                <th>Borrador</th><th>Registradas</th><th>Aplicadas</th><th>Pendientes</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cursosVigentes.map((c) => (
                <tr key={c.Curso_Id}>
                  <td>{c.Curso_Nombre}</td>
                  <td>{c.Profesor_Jefe_Nombre || "—"}</td>
                  <td>{c.enCurso}</td>
                  <td>{c.sinSituacion}</td>
                  <td>{c.borradores}</td>
                  <td>{c.registrados}</td>
                  <td>{c.aplicados}</td>
                  <td><strong>{c.pendientes}</strong></td>
                  <td><Link to={`/situacion-final?curso=${c.Curso_Id}`}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {periodos.cierreIniciado && (
        <div className="form-card">
          <h3 style={{ marginTop: 0 }}>Cursos y horarios de {periodos.siguiente}</h3>
          {cursosSiguientes.length === 0 ? (
            <p>Aún no hay cursos de {periodos.siguiente}. Se crean al aplicar la promoción o desde Cursos.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tabla-asignaturas">
                <thead>
                  <tr><th>Curso</th><th>Profesor jefe</th><th>Estudiantes</th><th>Horas programadas</th><th>Horario</th></tr>
                </thead>
                <tbody>
                  {cursosSiguientes.map((c) => (
                    <tr key={c.Curso_Id}>
                      <td>{c.Curso_Nombre}</td>
                      <td>{c.Profesor_Jefe_Nombre || "—"}</td>
                      <td>{c.estudiantes}</td>
                      <td>{c.horasProgramadas} / {c.horasRequeridas} h</td>
                      <td>{c.horarioCompleto ? "Completo" : "Incompleto"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {periodos.cierreIniciado && (
        <div className="form-card">
          <h3 style={{ marginTop: 0 }}>2. Iniciar nuevo período ({periodos.siguiente})</h3>
          {motivos.length > 0 ? (
            <>
              <p>Todavía no se puede iniciar:</p>
              <ul>{motivos.map((m) => <li key={m}>{m}</li>)}</ul>
            </>
          ) : (
            <p>Todos los casos están resueltos y los horarios de {periodos.siguiente} están completos.</p>
          )}

          <p><strong>Al iniciar el nuevo período se eliminará o modificará:</strong></p>
          <ul>
            <li>{limpieza.cursos} curso(s) de períodos anteriores a {periodos.vigente}, con {limpieza.estudiantes} estudiante(s) (egresados, en práctica y retirados) y su historial, citaciones, evaluaciones y horarios</li>
            <li>{limpieza.apoderadosEliminar} apoderado(s) sin estudiantes desde el cambio anterior: se eliminan</li>
            <li>{limpieza.apoderadosDesactivar} apoderado(s) sin estudiantes: quedan inactivos hasta una nueva asociación</li>
            <li>{limpieza.apoderadosQuitarRol} usuario(s) que también son docentes o administradores: pierden el rol de apoderado</li>
          </ul>

          {esSuperAdmin ? (
            <>
              <p style={{ fontSize: "0.9rem" }}>
                Descarga el respaldo y súbelo al Google Drive de la cuenta de respaldos{" "}
                <strong>{CORREO_RESPALDOS}</strong>. Tiene datos personales de menores: no lo guardes en equipos
                personales.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <button
                  className="btn-volver"
                  disabled={ocupado}
                  onClick={() => accion(async () => { await descargarRespaldo(); setRespaldoDescargado(true); })}
                >
                  Descargar respaldo
                </button>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={respaldoGuardado}
                    disabled={!respaldoDescargado && hayLimpieza}
                    onChange={(e) => setRespaldoGuardado(e.target.checked)}
                  />
                  Subí el respaldo al Drive de {CORREO_RESPALDOS}
                </label>
                <button
                  className="btn-primary"
                  disabled={ocupado || !puedeIniciarNuevoPeriodo || !respaldoGuardado}
                  onClick={() => accion(
                    iniciarNuevoPeriodo,
                    `¿Iniciar el período ${periodos.siguiente}? Se aplicará la limpieza indicada y no se puede deshacer.`
                  )}
                >
                  Iniciar nuevo período
                </button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Solo el super administrador puede iniciar el nuevo período.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default CierrePeriodo;
