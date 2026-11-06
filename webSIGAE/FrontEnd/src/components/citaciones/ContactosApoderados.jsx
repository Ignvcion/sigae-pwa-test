import { useEffect, useState } from "react";
import { getContactosApoderados } from "../../services/api";

function FilaContacto({ apoderado, etiqueta }) {
  return (
    <li className="contacto-item">
      <div className="contacto-nombre">
        {apoderado.Usuario_Nombre_Completo}
        <span className={`contacto-rol contacto-rol-${etiqueta.toLowerCase()}`}>{etiqueta}</span>
      </div>
      <div className="contacto-datos">
        {apoderado.Usuario_Correo ? (
          <a href={`mailto:${apoderado.Usuario_Correo}`}>{apoderado.Usuario_Correo}</a>
        ) : (
          <span className="dato-sin-registrar">Sin correo registrado</span>
        )}
        {apoderado.Usuario_Telefono ? (
          <a href={`tel:${apoderado.Usuario_Telefono}`}>{apoderado.Usuario_Telefono}</a>
        ) : (
          <span className="dato-sin-registrar">Sin teléfono registrado</span>
        )}
      </div>
    </li>
  );
}

/**
 * RF57 / CU91: al crear o revisar una citación, el docente (o un administrador) ve el
 * nombre, correo y teléfono del apoderado titular y de los suplentes del estudiante.
 */
function ContactosApoderados({ estudianteId }) {
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: "" });

  useEffect(() => {
    if (!estudianteId) return undefined;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado({ cargando: true, datos: null, error: "" });
    getContactosApoderados(estudianteId)
      .then((datos) => activo && setEstado({ cargando: false, datos, error: "" }))
      .catch((error) => activo && setEstado({
        cargando: false,
        datos: null,
        // Excepción 2: el docente no imparte clases al estudiante
        error: error.message || "No fue posible cargar los contactos de los apoderados",
      }));
    return () => { activo = false; };
  }, [estudianteId]);

  if (!estudianteId) return null;

  return (
    <section className="contactos-apoderados" aria-label="Contactos de los apoderados">
      <h3 className="contactos-titulo">Contactos de los apoderados</h3>
      {estado.cargando ? (
        <p className="cit-sub">Cargando contactos...</p>
      ) : estado.error ? (
        <p className="cit-sub">{estado.error}</p>
      ) : (
        <ul className="contacto-lista">
          {estado.datos?.titular ? (
            <FilaContacto apoderado={estado.datos.titular} etiqueta="Titular" />
          ) : (
            <li className="cit-sub">El estudiante no tiene un apoderado titular designado.</li>
          )}
          {/* Excepción 1: sin suplentes, solo se muestra el titular */}
          {(estado.datos?.suplentes || []).map((s) => (
            <FilaContacto key={s.Usuario_Id} apoderado={s} etiqueta="Suplente" />
          ))}
        </ul>
      )}
    </section>
  );
}

export default ContactosApoderados;
