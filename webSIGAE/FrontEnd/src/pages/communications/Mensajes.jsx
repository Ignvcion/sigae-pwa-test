import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import {
  getConversaciones,
  getMensajesConversacion,
  enviarMensaje,
  marcarMensajesLeidos,
  getContactosMensajeria,
  iniciarConversacion,
  getDetalleContactoConversacion,
  getRecepcionMensajes,
  actualizarRecepcionMensajes,
  habilitarRespuestasConversacion
} from '../../services/api';
import './Mensajes.css';

// RF54: "2026-11-12T16:00" → "12/11 16:00"
function fechaHoraCorta(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(String(valor || ''));
  return m ? `${m[3]}/${m[2]} ${m[4]}` : '';
}

// Valor por defecto del selector de término: mañana a esta hora
function mananaLocal() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** RF54: texto del estado de respuesta del apoderado en una conversación. */
function estadoRespuesta(conversacion, miRol) {
  if (!conversacion || conversacion.Recepcion_General) return null;
  if (conversacion.Apoderado_Puede_Responder && conversacion.Habilitada_Hasta) {
    return miRol === 'Docente'
      ? `Puede responder hasta ${fechaHoraCorta(conversacion.Habilitada_Hasta)}`
      : `Puedes responder hasta ${fechaHoraCorta(conversacion.Habilitada_Hasta)}`;
  }
  return miRol === 'Docente' ? 'Sin respuestas del apoderado' : 'Solo lectura';
}

// Iniciales para el avatar cuando el contacto no tiene fotografía
function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// Fila etiqueta / valor del panel de datos del contacto
function DatoContacto({ etiqueta, valor }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>
        {etiqueta}
      </div>
      <div style={{ wordBreak: 'break-word' }}>
        {valor || <span style={{ color: '#999' }}>No registrado</span>}
      </div>
    </div>
  );
}

// Panel lateral con los datos no invasivos de la contraparte
function PanelContacto({ detalle, cargando, error, onCerrar }) {
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: '10px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '12px 15px',
          borderBottom: '1px solid #ddd',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        Datos del contacto
        <button
          type="button"
          onClick={onCerrar}
          title="Ocultar datos"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
        {cargando && <p>Cargando datos...</p>}

        {error && (
          <div
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: '#fee2e2',
              color: '#991b1b'
            }}
          >
            {error}
          </div>
        )}

        {!cargando && !error && detalle && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              {detalle.Foto ? (
                <img
                  src={detalle.Foto}
                  alt={detalle.Nombre}
                  style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    background: '#dbeafe',
                    color: '#1e40af',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '24px'
                  }}
                >
                  {iniciales(detalle.Nombre)}
                </div>
              )}
              <div style={{ fontWeight: 'bold', marginTop: '8px' }}>
                {detalle.Nombre}
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                {detalle.Rol}
              </div>
            </div>

            {detalle.Rol === 'Apoderado' ? (
              <>
                <DatoContacto etiqueta="Teléfono" valor={detalle.Telefono} />
                <DatoContacto etiqueta="Correo" valor={detalle.Correo} />

                <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>
                  Estudiantes asociados
                </div>
                {detalle.Estudiantes?.length ? (
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    {detalle.Estudiantes.map((e) => (
                      <li key={e.Estudiante_Id} style={{ marginBottom: '4px' }}>
                        {e.Nombre}
                        {e.Curso && (
                          <span style={{ color: '#666', fontSize: '13px' }}> · {e.Curso}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: '#999' }}>Sin estudiantes asociados</span>
                )}
              </>
            ) : (
              <>
                <DatoContacto etiqueta="Especialidad" valor={detalle.Especialidad} />
                <DatoContacto etiqueta="Correo institucional" valor={detalle.Correo} />

                <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>
                  Asignaturas que dicta a tus estudiantes
                </div>
                {detalle.Asignaturas?.length ? (
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    {detalle.Asignaturas.map((a) => (
                      <li key={`${a.Nombre}-${a.Curso}`} style={{ marginBottom: '4px' }}>
                        {a.Nombre}
                        <span style={{ color: '#666', fontSize: '13px' }}> · {a.Curso}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: '#999' }}>Sin asignaturas registradas</span>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// CU73 / RF47: mensajería interna entre docentes y apoderados
function Mensajes() {
  const { usuario, rolActivo } = useAuth();
  const rol = rolActivo || usuario?.roles?.[0];

  const [conversaciones, setConversaciones] = useState([]);
  const [conversacionSeleccionada, setConversacionSeleccionada] = useState(null);
  const [mensajes, setMensajes] = useState([]);

  const [nuevoMensaje, setNuevoMensaje] = useState('');

  const [cargandoConversaciones, setCargandoConversaciones] = useState(true);
  const [cargandoMensajes, setCargandoMensajes] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [error, setError] = useState('');
  const [errorMensaje, setErrorMensaje] = useState('');

  // Nueva conversación (selección de contacto válido)
  const [mostrarContactos, setMostrarContactos] = useState(false);
  const [contactos, setContactos] = useState([]);
  const [cargandoContactos, setCargandoContactos] = useState(false);
  const [errorContactos, setErrorContactos] = useState('');
  const [iniciando, setIniciando] = useState(null);

  // Panel lateral con los datos de la contraparte
  const [mostrarDetalle, setMostrarDetalle] = useState(true);
  const [detalleContacto, setDetalleContacto] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  // RF54 / CU85, CU86: recepción de mensajes (solo docente)
  const [recepcion, setRecepcion] = useState(null); // { recepcion, conversacionesHabilitadas }
  const [confirmandoRecepcion, setConfirmandoRecepcion] = useState(false);
  const [guardandoRecepcion, setGuardandoRecepcion] = useState(false);
  const [msgRecepcion, setMsgRecepcion] = useState({ tipo: '', texto: '' });
  const [habilitacion, setHabilitacion] = useState(null); // { hasta, guardando, error }

  // Evita que una respuesta lenta pise la ficha de otra conversación
  const conversacionActivaRef = useRef(null);

  // ─────────────────────────────────────────
  // Cargar conversaciones
  // ─────────────────────────────────────────

  const cargarConversaciones = useCallback(async () => {
    try {
      setCargandoConversaciones(true);
      setError('');

      const data = await getConversaciones(rol);
      const lista = Array.isArray(data) ? data : [];

      setConversaciones(lista);
      return lista;

    } catch (err) {
      setError(
        err.message || 'No se pudieron cargar las conversaciones'
      );
      return [];
    } finally {
      setCargandoConversaciones(false);
    }
  }, [rol]);

  // ─────────────────────────────────────────
  // Cargar mensajes de una conversación
  // ─────────────────────────────────────────

  const cargarDetalleContacto = async (conversacionId) => {
    setDetalleContacto(null);
    setErrorDetalle('');
    setCargandoDetalle(true);

    try {
      const data = await getDetalleContactoConversacion(conversacionId);
      if (conversacionActivaRef.current === conversacionId) {
        setDetalleContacto(data);
      }
    } catch (err) {
      if (conversacionActivaRef.current === conversacionId) {
        setErrorDetalle(err.message || 'No se pudieron cargar los datos del contacto');
      }
    } finally {
      if (conversacionActivaRef.current === conversacionId) {
        setCargandoDetalle(false);
      }
    }
  };

  const seleccionarConversacion = async (conversacion) => {
    conversacionActivaRef.current = conversacion.Conversacion_Id;
    cargarDetalleContacto(conversacion.Conversacion_Id);

    try {
      setConversacionSeleccionada(conversacion);
      setMostrarContactos(false);
      setMensajes([]);
      setErrorMensaje('');
      setCargandoMensajes(true);

      const data = await getMensajesConversacion(
        conversacion.Conversacion_Id
      );

      setMensajes(data?.mensajes || []);

      // Marcar como leídos los mensajes recibidos
      if (conversacion.No_Leidos > 0) {
        await marcarMensajesLeidos(conversacion.Conversacion_Id);

        setConversaciones((prev) =>
          prev.map((item) =>
            item.Conversacion_Id === conversacion.Conversacion_Id
              ? { ...item, No_Leidos: 0 }
              : item
          )
        );
      }

    } catch (err) {
      setErrorMensaje(
        err.message || 'No se pudieron cargar los mensajes'
      );
    } finally {
      setCargandoMensajes(false);
    }
  };

  // ─────────────────────────────────────────
  // Nueva conversación
  // ─────────────────────────────────────────

  const abrirContactos = async () => {
    setMostrarContactos(true);
    setConversacionSeleccionada(null);
    setErrorContactos('');
    setCargandoContactos(true);

    try {
      const data = await getContactosMensajeria(rol);
      setContactos(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorContactos(
        err.message || 'No se pudieron cargar los contactos'
      );
    } finally {
      setCargandoContactos(false);
    }
  };

  const handleIniciarConversacion = async (contacto) => {
    try {
      setIniciando(contacto.Contacto_Id);
      setErrorContactos('');

      const data = await iniciarConversacion(contacto.Contacto_Id, rol);
      const lista = await cargarConversaciones();

      const conversacion = lista.find(
        (c) => c.Conversacion_Id === data?.conversacionId
      );

      if (conversacion) {
        await seleccionarConversacion(conversacion);
      }

    } catch (err) {
      setErrorContactos(
        err.message || 'No se pudo iniciar la conversación'
      );
    } finally {
      setIniciando(null);
    }
  };

  // ─────────────────────────────────────────
  // Enviar mensaje
  // ─────────────────────────────────────────

  const handleEnviarMensaje = async (e) => {
    e?.preventDefault();

    if (enviando) {
      return;
    }

    if (!conversacionSeleccionada) {
      return;
    }

    const contenido = nuevoMensaje.trim();

    if (!contenido) {
      return;
    }

    try {
      setEnviando(true);
      setErrorMensaje('');

      await enviarMensaje(
        conversacionSeleccionada.Conversacion_Id,
        contenido
      );

      setNuevoMensaje('');

      // Volver a cargar los mensajes
      const data = await getMensajesConversacion(
        conversacionSeleccionada.Conversacion_Id
      );

      setMensajes(data?.mensajes || []);

      // Actualizar la vista previa de la conversación
      setConversaciones((prev) =>
        prev.map((item) =>
          item.Conversacion_Id ===
          conversacionSeleccionada.Conversacion_Id
            ? { ...item, Ultimo_Mensaje: contenido }
            : item
        )
      );

    } catch (err) {
      // Excepción 2: error al enviar o guardar el mensaje
      setErrorMensaje(
        err.message || 'No se pudo enviar el mensaje'
      );
    } finally {
      setEnviando(false);
    }
  };

  // ─────────────────────────────────────────
  // Carga inicial
  // ─────────────────────────────────────────

  useEffect(() => {
    cargarConversaciones();
  }, [cargarConversaciones]);

  useEffect(() => {
    if (rol !== 'Docente') return;
    getRecepcionMensajes().then(setRecepcion).catch(() => {});
  }, [rol]);

  // CU85: el docente cambia la recepción general y confirma
  const cambiarRecepcion = async () => {
    setGuardandoRecepcion(true);
    setMsgRecepcion({ tipo: '', texto: '' });
    try {
      const data = await actualizarRecepcionMensajes(!recepcion.recepcion);
      setRecepcion((r) => ({ ...r, recepcion: data.recepcion }));
      setMsgRecepcion({ tipo: 'exito', texto: data.mensaje });
      const lista = await cargarConversaciones();
      if (conversacionSeleccionada) {
        const actual = lista.find((c) => c.Conversacion_Id === conversacionSeleccionada.Conversacion_Id);
        if (actual) setConversacionSeleccionada(actual);
      }
    } catch (err) {
      // CU85 Excepción 1: se mantiene el estado anterior
      setMsgRecepcion({ tipo: 'error', texto: err.message || 'No fue posible guardar la configuración' });
    } finally {
      setGuardandoRecepcion(false);
      setConfirmandoRecepcion(false);
    }
  };

  // CU86: habilitar (o cerrar con null) las respuestas del apoderado en la conversación abierta
  const guardarHabilitacion = async (hasta) => {
    const id = conversacionSeleccionada.Conversacion_Id;
    setHabilitacion((h) => ({ ...(h || {}), guardando: true, error: '' }));
    try {
      await habilitarRespuestasConversacion(id, hasta);
      const cambios = {
        Habilitada_Hasta: hasta,
        Apoderado_Puede_Responder: Boolean(hasta) || conversacionSeleccionada.Recepcion_General,
        Habilitada_Por_Citacion: null,
      };
      setConversacionSeleccionada((c) => ({ ...c, ...cambios }));
      setConversaciones((prev) => prev.map((c) => (c.Conversacion_Id === id ? { ...c, ...cambios } : c)));
      setHabilitacion(null);
      getRecepcionMensajes().then(setRecepcion).catch(() => {});
    } catch (err) {
      setHabilitacion((h) => ({ ...(h || {}), guardando: false, error: err.message || 'No fue posible guardar' }));
    }
  };

  // Enter envía; Shift + Enter inserta un salto de línea
  const handleTeclaMensaje = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleEnviarMensaje();
    }
  };

  const miRol = conversacionSeleccionada?.Mi_Rol || rol;
  const panelDetalleVisible =
    Boolean(conversacionSeleccionada) && !mostrarContactos && mostrarDetalle;
  const conversacionCerrada =
    conversacionSeleccionada &&
    !conversacionSeleccionada.Conversacion_Estado;

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────

  return (
    <div
      style={{
        padding: '24px',
        height: 'calc(100vh - 120px)',
        boxSizing: 'border-box'
      }}
    >

      <h1 style={{ marginBottom: '20px' }}>
        Mensajes
      </h1>

      {/* RF54 / CU85: recepción general de mensajes de apoderados */}
      {rol === 'Docente' && recepcion && (
        <div className={`msj-recepcion ${recepcion.recepcion ? 'msj-recepcion--on' : 'msj-recepcion--off'}`}>
          <div className="msj-recepcion-estado">
            <strong>Recepción de mensajes de apoderados: {recepcion.recepcion ? 'habilitada' : 'deshabilitada'}</strong>
            <span>
              {recepcion.recepcion
                ? 'Tus apoderados pueden responderte.'
                : `Tus apoderados pueden leer tus mensajes, pero no responder${recepcion.conversacionesHabilitadas > 0 ? `, salvo en ${recepcion.conversacionesHabilitadas} conversación(es) habilitada(s) por un período` : ''}.`}
            </span>
          </div>
          {!confirmandoRecepcion ? (
            <button type="button" className="btn-secondary" onClick={() => { setConfirmandoRecepcion(true); setMsgRecepcion({ tipo: '', texto: '' }); }}>
              {recepcion.recepcion ? 'Deshabilitar recepción' : 'Habilitar recepción'}
            </button>
          ) : (
            <div className="msj-recepcion-confirmar">
              <span>
                {recepcion.recepcion
                  ? '¿Deshabilitar? Los apoderados no podrán responderte hasta que la habilites de nuevo.'
                  : '¿Habilitar? Todos tus apoderados podrán responderte.'}
              </span>
              <button type="button" className="btn-primary" onClick={cambiarRecepcion} disabled={guardandoRecepcion}>
                {guardandoRecepcion ? 'Guardando...' : 'Confirmar'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmandoRecepcion(false)} disabled={guardandoRecepcion}>
                Cancelar
              </button>
            </div>
          )}
          {msgRecepcion.texto && (
            <div className={msgRecepcion.tipo === 'error' ? 'msj-recepcion-error' : 'msj-recepcion-exito'} role="status">
              {msgRecepcion.texto}
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '8px',
            background: '#fee2e2',
            color: '#991b1b'
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: panelDetalleVisible
            ? 'minmax(240px, 300px) 1fr minmax(240px, 300px)'
            : 'minmax(260px, 320px) 1fr',
          gap: '20px',
          height: 'calc(100% - 70px)'
        }}
      >

        {/* ─────────────────────────────── */}
        {/* LISTA DE CONVERSACIONES */}
        {/* ─────────────────────────────── */}

        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '10px',
            overflow: 'hidden',
            background: '#fff'
          }}
        >

          <div
            style={{
              padding: '12px 15px',
              borderBottom: '1px solid #ddd',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            Conversaciones

            <button
              type="button"
              className="btn-primary"
              onClick={abrirContactos}
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              + Nueva
            </button>
          </div>

          <div
            style={{
              overflowY: 'auto',
              height: 'calc(100% - 55px)'
            }}
          >

            {cargandoConversaciones && (
              <p style={{ padding: '15px' }}>
                Cargando conversaciones...
              </p>
            )}

            {!cargandoConversaciones &&
              !error &&
              conversaciones.length === 0 && (
                <p style={{ padding: '15px' }}>
                  No hay conversaciones. Usa "+ Nueva" para iniciar una.
                </p>
              )}

            {!cargandoConversaciones &&
              conversaciones.map((conversacion) => {

                const seleccionada =
                  conversacionSeleccionada?.Conversacion_Id ===
                  conversacion.Conversacion_Id;

                return (
                  <button
                    key={conversacion.Conversacion_Id}
                    type="button"
                    onClick={() =>
                      seleccionarConversacion(conversacion)
                    }
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #eee',
                      padding: '15px',
                      cursor: 'pointer',
                      background: seleccionada
                        ? '#f3f4f6'
                        : '#fff'
                    }}
                  >

                    <div
                      style={{
                        fontWeight: 'bold',
                        marginBottom: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '8px'
                      }}
                    >
                      <span>
                        {conversacion.Contacto_Nombre || 'Sin nombre'}
                      </span>

                      {conversacion.No_Leidos > 0 && (
                        <span
                          style={{
                            background: '#2563eb',
                            color: '#fff',
                            borderRadius: '999px',
                            padding: '0 8px',
                            fontSize: '12px',
                            lineHeight: '20px'
                          }}
                          title="Mensajes sin leer"
                        >
                          {conversacion.No_Leidos}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '13px',
                        color: '#666',
                        marginBottom: '6px'
                      }}
                    >
                      {conversacion.Mi_Rol === 'Docente'
                        ? 'Apoderado'
                        : 'Docente'}
                      {!conversacion.Conversacion_Estado && ' · Cerrada'}
                      {conversacion.Conversacion_Estado && estadoRespuesta(conversacion, conversacion.Mi_Rol) && (
                        <span className={`msj-chip ${conversacion.Apoderado_Puede_Responder ? 'msj-chip--on' : 'msj-chip--off'}`}>
                          {estadoRespuesta(conversacion, conversacion.Mi_Rol)}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '13px',
                        color: '#555',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {conversacion.Ultimo_Mensaje ||
                        'Sin mensajes'}
                    </div>

                  </button>
                );
              })}

          </div>
        </div>

        {/* ─────────────────────────────── */}
        {/* CHAT / CONTACTOS */}
        {/* ─────────────────────────────── */}

        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '10px',
            overflow: 'hidden',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column'
          }}
        >

          {mostrarContactos ? (

            <>
              <div
                style={{
                  padding: '15px',
                  borderBottom: '1px solid #ddd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                    Nueva conversación
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    {rol === 'Docente'
                      ? 'Apoderados de los estudiantes de tus cursos'
                      : 'Docentes que hacen clases a tus estudiantes'}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setMostrarContactos(false)}
                >
                  Cerrar
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>

                {cargandoContactos && <p>Cargando contactos...</p>}

                {errorContactos && (
                  <div
                    style={{
                      padding: '10px',
                      marginBottom: '10px',
                      borderRadius: '8px',
                      background: '#fee2e2',
                      color: '#991b1b'
                    }}
                  >
                    {errorContactos}
                  </div>
                )}

                {!cargandoContactos &&
                  !errorContactos &&
                  contactos.length === 0 && (
                    <p style={{ color: '#777' }}>
                      No existen contactos con una relación docente-apoderado válida.
                    </p>
                  )}

                {!cargandoContactos &&
                  contactos.map((contacto) => (
                    <div
                      key={contacto.Contacto_Id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        borderBottom: '1px solid #eee'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold' }}>
                          {contacto.Contacto_Nombre}
                        </div>
                        <div style={{ fontSize: '13px', color: '#666' }}>
                          {contacto.Contacto_Rol} · {contacto.Estudiantes.join(', ')}
                        </div>
                        {contacto.Recibe_Mensajes === false && (
                          <span className="msj-chip msj-chip--off">No está recibiendo mensajes</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn-primary"
                        disabled={iniciando !== null}
                        onClick={() => handleIniciarConversacion(contacto)}
                      >
                        {iniciando === contacto.Contacto_Id
                          ? 'Abriendo...'
                          : 'Escribir'}
                      </button>
                    </div>
                  ))}
              </div>
            </>

          ) : !conversacionSeleccionada ? (

            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#777'
              }}
            >
              Selecciona una conversación para ver los mensajes.
            </div>

          ) : (

            <>
              {/* ENCABEZADO */}

              <div
                style={{
                  padding: '15px',
                  borderBottom: '1px solid #ddd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >

                <div>
                  <div
                    style={{
                      fontWeight: 'bold',
                      fontSize: '18px'
                    }}
                  >
                    {conversacionSeleccionada.Contacto_Nombre}
                  </div>

                  <div
                    style={{
                      fontSize: '14px',
                      color: '#666'
                    }}
                  >
                    {miRol === 'Docente' ? 'Apoderado' : 'Docente'}
                  </div>
                </div>

                {!mostrarDetalle && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setMostrarDetalle(true)}
                  >
                    Ver datos
                  </button>
                )}

              </div>

              {/* RF54 / CU86: el docente habilita respuestas en esta conversación por un período */}
              {miRol === 'Docente' && !conversacionCerrada && !conversacionSeleccionada.Recepcion_General && (
                <div className="msj-habilitacion">
                  <span>
                    {conversacionSeleccionada.Apoderado_Puede_Responder && conversacionSeleccionada.Habilitada_Hasta
                      ? `El apoderado puede responder hasta ${fechaHoraCorta(conversacionSeleccionada.Habilitada_Hasta)}${conversacionSeleccionada.Habilitada_Por_Citacion ? ' (habilitado desde una citación)' : ''}.`
                      : 'Tu recepción está deshabilitada: el apoderado no puede responder en esta conversación.'}
                  </span>
                  {!habilitacion ? (
                    <span className="msj-habilitacion-acciones">
                      <button type="button" className="btn-secondary" onClick={() => setHabilitacion({ hasta: conversacionSeleccionada.Habilitada_Hasta || mananaLocal(), guardando: false, error: '' })}>
                        {conversacionSeleccionada.Habilitada_Hasta ? 'Cambiar término' : 'Habilitar respuestas'}
                      </button>
                      {conversacionSeleccionada.Habilitada_Hasta && (
                        <button type="button" className="btn-secondary" onClick={() => guardarHabilitacion(null)}>
                          Cerrar ahora
                        </button>
                      )}
                    </span>
                  ) : (
                    <span className="msj-habilitacion-acciones">
                      <label>
                        Hasta{' '}
                        <input
                          type="datetime-local"
                          value={habilitacion.hasta}
                          onChange={(e) => setHabilitacion((h) => ({ ...h, hasta: e.target.value, error: '' }))}
                        />
                      </label>
                      <button type="button" className="btn-primary" disabled={habilitacion.guardando || !habilitacion.hasta} onClick={() => guardarHabilitacion(habilitacion.hasta)}>
                        {habilitacion.guardando ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setHabilitacion(null)}>Cancelar</button>
                      {habilitacion.error && <span className="msj-recepcion-error">{habilitacion.error}</span>}
                    </span>
                  )}
                </div>
              )}

              {/* MENSAJES */}

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px',
                  background: '#f8f9fa'
                }}
              >

                {cargandoMensajes && (
                  <p>
                    Cargando mensajes...
                  </p>
                )}

                {errorMensaje && (
                  <div
                    style={{
                      padding: '10px',
                      marginBottom: '10px',
                      borderRadius: '8px',
                      background: '#fee2e2',
                      color: '#991b1b'
                    }}
                  >
                    {errorMensaje}
                  </div>
                )}

                {!cargandoMensajes &&
                  !errorMensaje &&
                  mensajes.length === 0 && (
                    <p
                      style={{
                        textAlign: 'center',
                        color: '#777'
                      }}
                    >
                      No hay mensajes todavía. Escribe el primero.
                    </p>
                  )}

                {mensajes.map((mensaje) => {

                  // Los mensajes propios van a la derecha
                  const esPropio =
                    mensaje.Mensaje_Remitente_Rol === miRol;

                  return (
                    <div
                      key={mensaje.Mensaje_Id}
                      style={{
                        display: 'flex',
                        justifyContent: esPropio
                          ? 'flex-end'
                          : 'flex-start',
                        marginBottom: '12px'
                      }}
                    >

                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          background: esPropio
                            ? '#dbeafe'
                            : '#e5e7eb'
                        }}
                      >

                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 'bold',
                            marginBottom: '4px'
                          }}
                        >
                          {esPropio ? 'Tú' : mensaje.Mensaje_Remitente_Rol}
                        </div>

                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {mensaje.Mensaje_Contenido}
                        </div>

                        <div
                          style={{
                            marginTop: '5px',
                            fontSize: '11px',
                            color: '#666',
                            textAlign: 'right'
                          }}
                        >
                          {mensaje.Mensaje_Fecha_Envio}{' '}
                          {String(mensaje.Mensaje_Hora_Envio || '').slice(0, 5)}
                          {esPropio && ` · ${mensaje.Mensaje_Estado}`}
                        </div>

                      </div>

                    </div>
                  );
                })}

              </div>

              {/* FORMULARIO */}

              {miRol === 'Apoderado' && !conversacionCerrada && !conversacionSeleccionada.Apoderado_Puede_Responder ? (
                <div className="msj-solo-lectura" role="status">
                  El docente no está recibiendo mensajes de apoderados en este momento.
                  Puedes leer los mensajes, pero no responder.
                </div>
              ) : conversacionCerrada ? (
                <div
                  style={{
                    padding: '15px',
                    borderTop: '1px solid #ddd',
                    color: '#777',
                    textAlign: 'center'
                  }}
                >
                  Esta conversación está cerrada; no se pueden enviar mensajes.
                </div>
              ) : (
                <form
                  onSubmit={handleEnviarMensaje}
                  style={{
                    padding: '15px 15px 8px',
                    borderTop: '1px solid #ddd'
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>

                    <textarea
                      value={nuevoMensaje}
                      onChange={(e) =>
                        setNuevoMensaje(e.target.value)
                      }
                      onKeyDown={handleTeclaMensaje}
                      placeholder="Escribe un mensaje..."
                      maxLength={5000}
                      readOnly={enviando}
                      rows={2}
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: '1px solid #ccc',
                        borderRadius: '8px',
                        resize: 'none',
                        fontFamily: 'inherit',
                        fontSize: 'inherit'
                      }}
                    />

                    <button
                      type="submit"
                      disabled={
                        enviando ||
                        !nuevoMensaje.trim()
                      }
                      style={{
                        padding: '12px 20px',
                        border: 'none',
                        borderRadius: '8px',
                        cursor:
                          enviando ||
                          !nuevoMensaje.trim()
                            ? 'not-allowed'
                            : 'pointer'
                      }}
                    >
                      {enviando ? 'Enviando...' : 'Enviar'}
                    </button>

                  </div>

                  {miRol === 'Apoderado' && !conversacionSeleccionada.Recepcion_General && conversacionSeleccionada.Habilitada_Hasta && (
                    <div className="msj-plazo">Puedes responder hasta {fechaHoraCorta(conversacionSeleccionada.Habilitada_Hasta)}.</div>
                  )}
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      color: '#666'
                    }}
                  >
                    <strong>PRESIONE ENTER PARA ENVIAR</strong>
                    {' · '}Shift + Enter para un salto de línea
                  </div>

                </form>
              )}

            </>
          )}

        </div>

        {panelDetalleVisible && (
          <PanelContacto
            detalle={detalleContacto}
            cargando={cargandoDetalle}
            error={errorDetalle}
            onCerrar={() => setMostrarDetalle(false)}
          />
        )}

      </div>

    </div>
  );
}

export default Mensajes;
