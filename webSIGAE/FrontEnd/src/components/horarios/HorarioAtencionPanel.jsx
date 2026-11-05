import { useState } from "react";
import {
  crearBloqueAtencion,
  actualizarBloqueAtencion,
  eliminarBloqueAtencion,
} from "../../services/api";
import { DIAS_SEMANA, minutosAHHMM } from "../../utils/horarios";
import { formatearFecha } from "../../utils/citaciones";

// Horas seleccionables: tramos de 30 minutos entre 08:00 y 18:00 (mismo formato que las citaciones)
const HORAS = Array.from({ length: 21 }, (_, i) => minutosAHHMM(8 * 60 + i * 30));

const FORM_VACIO = { dia: "", horaInicio: "", horaFin: "" };

/**
 * RF55 / CU87–CU88: el docente registra, modifica y elimina los bloques semanales en que
 * atiende apoderados. El backend rechaza los bloques que se superponen con sus clases o
 * con otro bloque, y pide confirmación si un cambio deja fuera citaciones ya agendadas.
 *
 * bloques: lista actual; onCambio(mensaje): el padre recarga los bloques y muestra el aviso.
 */
function HorarioAtencionPanel({ bloques, cargando, error, onCambio }) {
  const [editando, setEditando] = useState(null); // null | { modo: "nuevo" | "editar" | "eliminar", id }
  const [form, setForm] = useState(FORM_VACIO);
  const [errores, setErrores] = useState({});
  const [msgError, setMsgError] = useState("");
  const [guardando, setGuardando] = useState(false);
  // CU88 Excepción 1: acción pendiente de confirmar por tener citaciones a futuro
  const [confirmacion, setConfirmacion] = useState(null); // { mensaje, citaciones, ejecutar }

  const abrir = (bloque) => {
    setEditando(bloque ? { modo: "editar", id: bloque.Horario_Atencion_Id } : { modo: "nuevo" });
    setForm(
      bloque
        ? {
            dia: bloque.Horario_Atencion_Dia_Semana,
            horaInicio: bloque.Horario_Atencion_Hora_Inicio,
            horaFin: bloque.Horario_Atencion_Hora_Fin,
          }
        : FORM_VACIO
    );
    setErrores({});
    setMsgError("");
    setConfirmacion(null);
  };

  const cerrar = () => {
    setEditando(null);
    setConfirmacion(null);
    setMsgError("");
  };

  const actualizar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
    setMsgError("");
  };

  // Ejecuta la acción; si el backend pide confirmación (409 + requiereConfirmacion) la deja pendiente
  const ejecutar = async (accion, mensajeExito) => {
    setGuardando(true);
    setMsgError("");
    try {
      const data = await accion(false);
      cerrar();
      onCambio(data?.mensaje || mensajeExito);
    } catch (err) {
      if (err.data?.requiereConfirmacion) {
        setConfirmacion({ mensaje: err.message, citaciones: err.data.citaciones || [], ejecutar: accion, mensajeExito });
      } else {
        setMsgError(err.message || "No fue posible guardar el bloque de atención");
        if (err.data?.errores) setErrores(err.data.errores);
      }
    } finally {
      setGuardando(false);
    }
  };

  const confirmar = async () => {
    const { ejecutar: accion, mensajeExito } = confirmacion;
    setGuardando(true);
    try {
      const data = await accion(true);
      cerrar();
      onCambio(data?.mensaje || mensajeExito);
    } catch (err) {
      setConfirmacion(null);
      setMsgError(err.message || "No fue posible completar la operación");
    } finally {
      setGuardando(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // CU87 Excepción 1: datos incompletos o inicio no anterior al término
    const faltantes = {};
    if (!form.dia) faltantes.dia = "Selecciona el día";
    if (!form.horaInicio) faltantes.horaInicio = "Selecciona la hora de inicio";
    if (!form.horaFin) faltantes.horaFin = "Selecciona la hora de término";
    if (form.horaInicio && form.horaFin && form.horaInicio >= form.horaFin) {
      faltantes.horaFin = "La hora de inicio debe ser anterior a la hora de término";
    }
    if (Object.keys(faltantes).length > 0) {
      setErrores(faltantes);
      return;
    }
    if (editando.modo === "nuevo") {
      ejecutar(() => crearBloqueAtencion(form), "Bloque de atención registrado");
    } else {
      const id = editando.id;
      ejecutar((confirmado) => actualizarBloqueAtencion(id, form, confirmado), "Bloque de atención actualizado");
    }
  };

  const eliminar = (bloque) => {
    const texto = `${bloque.Horario_Atencion_Dia_Semana} ${bloque.Horario_Atencion_Hora_Inicio}–${bloque.Horario_Atencion_Hora_Fin}`;
    if (!window.confirm(`¿Eliminar el bloque de atención del ${texto}?`)) return;
    setEditando({ modo: "eliminar", id: bloque.Horario_Atencion_Id });
    setMsgError("");
    ejecutar((confirmado) => eliminarBloqueAtencion(bloque.Horario_Atencion_Id, confirmado), "Bloque de atención eliminado");
  };

  const formAbierto = editando !== null && editando.modo !== "eliminar";
  const esNuevo = editando?.modo === "nuevo";

  return (
    <section className="cit-panel atencion-panel">
      <div className="atencion-encabezado">
        <h2 className="cit-panel-titulo">Horario de atención de apoderados</h2>
        {(editando === null || editando.modo === "eliminar") && (
          <button type="button" className="btn-primario" onClick={() => abrir(null)}>
            + Agregar bloque
          </button>
        )}
      </div>
      <p className="cit-nota">
        Define los bloques semanales en que atiendes apoderados, en tramos de 30 minutos entre 08:00 y 18:00.
        No pueden coincidir con tus clases. Los apoderados solo pueden solicitar citaciones dentro de estos bloques.
      </p>

      {cargando ? (
        <p className="empty-state-text">Cargando horario de atención...</p>
      ) : error ? (
        <div className="msg-error-form">{error}</div>
      ) : bloques.length === 0 ? (
        <p className="empty-state-text cit-panel-vacio">Aún no registras bloques de atención de apoderados.</p>
      ) : (
        <div className="cit-tabla-wrap">
          <table className="tabla-usuarios">
            <thead>
              <tr>
                <th>Día</th>
                <th>Inicio</th>
                <th>Término</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {bloques.map((b) => (
                <tr key={b.Horario_Atencion_Id}>
                  <td>{b.Horario_Atencion_Dia_Semana}</td>
                  <td>{b.Horario_Atencion_Hora_Inicio}</td>
                  <td>{b.Horario_Atencion_Hora_Fin}</td>
                  <td>
                    <div className="acciones-grupo">
                      <button type="button" className="btn-roles" onClick={() => abrir(b)} disabled={guardando}>
                        Editar
                      </button>
                      <button type="button" className="btn-desactivar" onClick={() => eliminar(b)} disabled={guardando}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error al eliminar (el formulario no está abierto) */}
      {editando?.modo === "eliminar" && msgError && !confirmacion && (
        <div className="msg-error-form">{msgError}</div>
      )}

      {formAbierto && !confirmacion && (
        <form onSubmit={handleSubmit} className="atencion-form" noValidate>
          <h3 className="atencion-form-titulo">{esNuevo ? "Nuevo bloque de atención" : "Modificar bloque de atención"}</h3>
          <div className="cit-form-fila atencion-form-fila">
            <div className="campo-pwd">
              <label htmlFor="at-dia">Día</label>
              <select id="at-dia" className="usuarios-select" value={form.dia} onChange={(e) => actualizar("dia", e.target.value)}>
                <option value="">Selecciona...</option>
                {DIAS_SEMANA.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {errores.dia && <span className="pwd-error">{errores.dia}</span>}
            </div>
            <div className="campo-pwd">
              <label htmlFor="at-inicio">Hora de inicio</label>
              <select id="at-inicio" className="usuarios-select" value={form.horaInicio} onChange={(e) => actualizar("horaInicio", e.target.value)}>
                <option value="">Selecciona...</option>
                {HORAS.slice(0, -1).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              {errores.horaInicio && <span className="pwd-error">{errores.horaInicio}</span>}
            </div>
            <div className="campo-pwd">
              <label htmlFor="at-fin">Hora de término</label>
              <select id="at-fin" className="usuarios-select" value={form.horaFin} onChange={(e) => actualizar("horaFin", e.target.value)}>
                <option value="">Selecciona...</option>
                {HORAS.slice(1).filter((h) => !form.horaInicio || h > form.horaInicio).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              {errores.horaFin && <span className="pwd-error">{errores.horaFin}</span>}
            </div>
          </div>

          {msgError && <div className="msg-error-form">{msgError}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={cerrar} disabled={guardando}>Cancelar</button>
            <button type="submit" className="btn-primario" disabled={guardando}>
              {guardando ? "Guardando..." : esNuevo ? "Registrar bloque" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}

      {/* CU88 Excepción 1: el bloque tiene citaciones agendadas a futuro */}
      {confirmacion && (
        <div className="atencion-confirmacion" role="alertdialog">
          <p><strong>{confirmacion.mensaje}</strong></p>
          <ul className="cit-lista-pendientes">
            {confirmacion.citaciones.map((c) => (
              <li key={c.Citacion_Id} className="cit-pendiente-item">
                <span>
                  <strong>{formatearFecha(c.Citacion_Fecha, { corta: true })}</strong> · {c.Citacion_Tramo_Horario}
                  {c.Estudiante_Nombre_Completo ? ` · ${c.Estudiante_Nombre_Completo}` : ""}
                  {c.Apoderado_Nombre ? ` · Apoderado: ${c.Apoderado_Nombre}` : ""}
                </span>
                <span className="cit-sub">{c.Citacion_Estado}</span>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={cerrar} disabled={guardando}>Volver</button>
            <button type="button" className="btn-danger" onClick={confirmar} disabled={guardando}>
              {guardando ? "Guardando..." : "Continuar de todos modos"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default HorarioAtencionPanel;
