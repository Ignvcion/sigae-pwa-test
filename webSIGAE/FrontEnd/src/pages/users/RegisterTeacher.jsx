import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { registrarDocente, getEspecialidades, getOpcionesDisponibilidad } from "../../services/api";
import EtiquetasInput from "../../components/EtiquetasInput";
import DisponibilidadSemanal from "../../components/DisponibilidadSemanal";
import {
  validarRut, normalizarRut, validarNombreCompleto, validarCorreoInstitucional, DOMINIO_INSTITUCIONAL,
  validarTelefonoChileno, validarFortalezaContrasena, MENSAJE_TELEFONO, MAX_NOMBRE_COMPLETO,
  validarDireccion,
} from "../../utils/validaciones";
import CamposDireccion, { CAMPOS_DIRECCION, errorCampoDireccion } from "../../components/CamposDireccion";


function RegisterTeacher() {

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
    password: "",
    especialidades: [],
    cargaHoraria: "",
    disponibilidad: [],
    estado: "Activo",
  });


  const [errores, setErrores] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [opcionesDisp, setOpcionesDisp] = useState(null);

  // RF04: etiquetas de especialidad existentes; CU107: bloques para la disponibilidad semanal
  useEffect(() => {
    getEspecialidades().then((d) => setCatalogo((d || []).map((e) => e.Especialidad_Nombre))).catch(() => {});
    getOpcionesDisponibilidad().then(setOpcionesDisp).catch(() => setOpcionesDisp({ dias: [], bloques: [] }));
  }, []);


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
          ? `El correo debe pertenecer al dominio ${DOMINIO_INSTITUCIONAL}`
          : "";
      case "telefono":
        return value && !validarTelefonoChileno(value) ? MENSAJE_TELEFONO : "";
      case "password":
        return value ? validarFortalezaContrasena(value) : "";
      case "cargaHoraria":
        return value && (isNaN(value) || Number(value) <= 0 || Number(value) > 44)
          ? "La carga horaria semanal debe ser un número entre 1 y 44 horas"
          : "";
      case "especialidades":
        return value.length === 0 ? "Agrega al menos una especialidad" : "";
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
      password: validarCampo("password", formData.password),
      cargaHoraria: validarCampo("cargaHoraria", formData.cargaHoraria),
      especialidades: validarCampo("especialidades", formData.especialidades),
      ...validarDireccion(formData),
    };

    if (Object.values(nuevosErrores).some((msg) => msg)) {
      setErrores(nuevosErrores);
      return;
    }

    setLoading(true);
    setError(null);


    try {


      const creado = await registrarDocente(formData);

      const advertencia = creado?.Disponibilidad_Laboral?.advertencia;
      alert(
        advertencia
          ? `Docente registrado correctamente.\n\n⚠ ${advertencia}`
          : "Docente registrado correctamente"
      );


      navigate("/usuarios");



    } catch (err) {


      if(err.data?.requiereAsignacionRol){


        alert(
          err.data.mensaje
        );


        navigate(
          `/gestion-roles/${err.data.usuarioId}`
        );


        return;

      }



      setError(
        err.message ||
        "Error al registrar el docente"
      );


    } finally {


      setLoading(false);


    }

  };



  return (

    <div className="page-container">

      <div className="form-card">


        <h1>
          Registrar Docente
        </h1>



        {
          error &&
          <p style={{color:"red"}}>
            {error}
          </p>
        }



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



          <div>
            <input
              type="password"
              name="password"
              placeholder="Contraseña (mín. 8 caracteres, una mayúscula y un número)"
              value={formData.password}
              onChange={handleChange}
              className={errores.password ? "input-invalid" : ""}
              required
            />
            {errores.password && <span className="input-error-msg">{errores.password}</span>}
          </div>



          <div className="campo-pwd">
            <label htmlFor="especialidades-docente">Especialidades</label>
            <EtiquetasInput
              id="especialidades-docente"
              valores={formData.especialidades}
              opciones={catalogo}
              invalido={!!errores.especialidades}
              onChange={(especialidades) => {
                setFormData({ ...formData, especialidades });
                setErrores({ ...errores, especialidades: validarCampo("especialidades", especialidades) });
              }}
            />
            {errores.especialidades && <span className="input-error-msg">{errores.especialidades}</span>}
          </div>



          <div className="campo-pwd">
            <label htmlFor="carga-horaria-semanal">Carga horaria semanal (hrs)</label>
            <input
              id="carga-horaria-semanal"
              type="number"
              name="cargaHoraria"
              placeholder="Carga horaria semanal (hrs)"
              value={formData.cargaHoraria}
              onChange={handleChange}
              min="1"
              max="44"
              className={errores.cargaHoraria ? "input-invalid" : ""}
              required
            />
            {errores.cargaHoraria && <span className="input-error-msg">{errores.cargaHoraria}</span>}
          </div>



          <div className="campo-pwd">
            <label>Disponibilidad laboral semanal</label>
            <span className="etiquetas-ayuda">
              Marca los bloques en que el docente puede trabajar en el colegio. Déjala vacía si no tiene restricción.
            </span>
            {opcionesDisp ? (
              <DisponibilidadSemanal
                dias={opcionesDisp.dias}
                bloques={opcionesDisp.bloques}
                periodo={opcionesDisp.periodos?.vigente}
                seleccion={formData.disponibilidad}
                cargaSemanal={formData.cargaHoraria}
                onChange={(disponibilidad) => setFormData({ ...formData, disponibilidad })}
              />
            ) : (
              <span className="etiquetas-ayuda">Cargando bloques horarios…</span>
            )}
          </div>



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



          <button
            type="submit"
            disabled={loading}
          >

            {
              loading
              ? "Registrando..."
              : "Registrar Docente"
            }


          </button>


        </form>


      </div>


    </div>


  );


}


export default RegisterTeacher;
