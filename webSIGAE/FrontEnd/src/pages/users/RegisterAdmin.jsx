import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registrarAdmin, textoContrasenaEnviada } from "../../services/api";
import {
  validarRut, normalizarRut, validarNombreCompleto, validarCorreoInstitucional, DOMINIO_INSTITUCIONAL, TEXTO_DOMINIOS_INSTITUCIONALES,
  validarTelefonoChileno, MENSAJE_TELEFONO, MAX_NOMBRE_COMPLETO,
  validarDireccion,
} from "../../utils/validaciones";
import CamposDireccion, { CAMPOS_DIRECCION, errorCampoDireccion } from "../../components/CamposDireccion";

function RegisterAdmin() {

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    nombre: "",
    rut: "",
    correo: "",
    telefono: "",
    calle: "",
    numero: "",
    depto: "",
    comuna: "",
    estado: "Activo",
  });

  const [errores, setErrores] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


  const validarCampo = (name, value, datos = formData) => {
    if (CAMPOS_DIRECCION.includes(name)) return errorCampoDireccion(name, value, datos);
    switch (name) {
      case "nombre":
        return value && !validarNombreCompleto(value)
          ? "Ingrese nombre y apellido, solo letras y espacios (ej: Juan Pérez)"
          : "";
      case "rut":
        return value && !validarRut(value)
          ? "RUT inválido. Formato esperado: 12345678-9"
          : "";
      case "correo":
        return value && !validarCorreoInstitucional(value)
          ? `El correo debe pertenecer al dominio ${TEXTO_DOMINIOS_INSTITUCIONALES}`
          : "";
      case "telefono":
        return value && !validarTelefonoChileno(value) ? MENSAJE_TELEFONO : "";
      default:
        return "";
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const valorNorm = name === "rut" ? normalizarRut(value) : value;
    setFormData({ ...formData, [name]: valorNorm });
    setErrores({ ...errores, [name]: validarCampo(name, valorNorm) });
  };


  const handleSubmit = async (e) => {

    e.preventDefault();

    const nuevosErrores = {
      nombre: validarCampo("nombre", formData.nombre),
      rut: validarCampo("rut", formData.rut),
      correo: validarCampo("correo", formData.correo),
      telefono: validarCampo("telefono", formData.telefono),
      ...validarDireccion(formData),
    };

    if (Object.values(nuevosErrores).some((msg) => msg)) {
      setErrores(nuevosErrores);
      return;
    }

    setLoading(true);
    setError(null);

    try {

      const creado = await registrarAdmin(formData);

      alert(`Administrador registrado correctamente.\n\n${textoContrasenaEnviada(creado)}`);

      navigate("/usuarios");


    } catch(err) {


      if(err.data?.requiereAsignacionRol){

        alert(err.data.mensaje);

        navigate(
          `/gestion-roles/${err.data.usuarioId}`
        );

        return;

      }


      setError(
        err.message ||
        "Error al registrar administrador"
      );


    } finally {

      setLoading(false);

    }

  };


  return (

    <div className="page-container">

      <div className="form-card form-registro">

        <h1>Registrar Administrador</h1>


        {error &&
          <p style={{color:"red"}}>
            {error}
          </p>
        }


        <p className="form-registro-aviso">
          La contraseña se genera automáticamente y se envía al correo del usuario.
        </p>

        <form onSubmit={handleSubmit}>


          <div>
            <input
              type="text"
              name="nombre"
              placeholder="Nombre completo (ej: Juan Pérez)"
              maxLength={MAX_NOMBRE_COMPLETO}
              value={formData.nombre}
              onChange={handleChange}
              className={errores.nombre ? "input-invalid" : ""}
              required
            />
            {errores.nombre && <span className="input-error-msg">{errores.nombre}</span>}
          </div>


          <div>
            <input
              type="text"
              name="rut"
              placeholder="RUT (ej: 12345678-9)"
              value={formData.rut}
              onChange={handleChange}
              className={errores.rut ? "input-invalid" : ""}
              required
            />
            {errores.rut && <span className="input-error-msg">{errores.rut}</span>}
          </div>


          <div>
            <input
              type="text"
              name="correo"
              placeholder={`Correo institucional (ej: nombre${DOMINIO_INSTITUCIONAL})`}
              value={formData.correo}
              onChange={handleChange}
              className={errores.correo ? "input-invalid" : ""}
              required
            />
            {errores.correo && <span className="input-error-msg">{errores.correo}</span>}
          </div>


          <div>
            <input
              type="tel"
              name="telefono"
              placeholder="Número telefónico (ej: 912345678 o +56912345678)"
              value={formData.telefono}
              onChange={handleChange}
              className={errores.telefono ? "input-invalid" : ""}
              required
            />
            {errores.telefono && <span className="input-error-msg">{errores.telefono}</span>}
          </div>


          <CamposDireccion valores={formData} errores={errores} onChange={handleChange} />


          <select
            name="estado"
            value={formData.estado}
            onChange={handleChange}
          >

            <option value="Activo">
              Activo
            </option>

            <option value="Inactivo">
              Inactivo
            </option>

          </select>


          <button disabled={loading}>

            {
              loading
              ? "Registrando..."
              : "Registrar Administrador"
            }

          </button>


        </form>

      </div>

    </div>

  );

}


export default RegisterAdmin;
