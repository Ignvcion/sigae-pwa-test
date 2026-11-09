import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registrarEstudiante, verificarRutEstudiante } from "../../services/api";
import { validarRut, obtenerErrorRut, normalizarRut, validarDireccion } from "../../utils/validaciones";
import CamposDireccion, { CAMPOS_DIRECCION, errorCampoDireccion } from "../../components/CamposDireccion";

function RegisterStudent() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    nombre         : "",
    rut            : "",
    curso          : "",
    estadoAcademico: "Regular",
    calle          : "",
    numero         : "",
    depto          : "",
    comuna         : "",
  });

  const [cursos, setCursos]           = useState([]);
  const [errores, setErrores]         = useState({});
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [rutExiste, setRutExiste]     = useState(false);
  const [verificandoRut, setVerificandoRut] = useState(false);

  useEffect(() => {
    fetch("/api/cursos", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((res) => res.json())
      .then((data) => setCursos(Array.isArray(data) ? data : []))
      .catch(() => setCursos([]));
  }, []);

  useEffect(() => {
    if (!formData.rut || !validarRut(formData.rut)) {
      setRutExiste(false);
      return;
    }
    setVerificandoRut(true);
    const timeout = setTimeout(async () => {
      try {
        const data = await verificarRutEstudiante(formData.rut);
        setRutExiste(data.existe);
      } catch {
        setRutExiste(false);
      } finally {
        setVerificandoRut(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [formData.rut]);

  const validarCampo = (name, value, datos = formData) => {
    if (CAMPOS_DIRECCION.includes(name)) return errorCampoDireccion(name, value, datos);
    if (name === "rut" && value) {
      return obtenerErrorRut(value);
    }
    return "";
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
      rut: validarCampo("rut", formData.rut),
      ...validarDireccion(formData),
    };

    if (Object.values(nuevosErrores).some((msg) => msg)) {
      setErrores(nuevosErrores);
      return;
    }

    if (rutExiste) return;

    setLoading(true);
    setError(null);
    try {
      await registrarEstudiante(formData);
      alert("Ficha estudiantil registrada correctamente");
      navigate("/usuarios");
    } catch (err) {
      setError(err.message || "Error al registrar el estudiante");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="form-card">
        <h1>Registrar Ficha Estudiantil</h1>

        {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="nombre"
            placeholder="Nombre completo"
            value={formData.nombre}
            onChange={handleChange}
            required
          />

          <div>
            <input
              type="text"
              name="rut"
              placeholder="RUT (ej: 12345678-9)"
              value={formData.rut}
              onChange={handleChange}
              className={errores.rut || rutExiste ? "input-invalid" : ""}
              required
            />
            {errores.rut && <span className="input-error-msg">{errores.rut}</span>}
            {!errores.rut && rutExiste && (
              <span className="input-error-msg">Ya existe un estudiante registrado con ese RUT</span>
            )}
            {!errores.rut && !rutExiste && verificandoRut && (
              <span style={{ fontSize: "0.82rem", color: "#64748b" }}>Verificando RUT...</span>
            )}
          </div>

          <select
            name="curso"
            value={formData.curso}
            onChange={handleChange}
            required
          >
            <option value="">Seleccione un curso</option>
            {cursos.map((c) => (
              <option key={c.Curso_Id} value={c.Curso_Id}>
                {c.Curso_Nombre}
              </option>
            ))}
          </select>

          <select
            name="estadoAcademico"
            value={formData.estadoAcademico}
            onChange={handleChange}
          >
            <option value="Regular">Regular</option>
            <option value="Irregular">Irregular</option>
            <option value="Retirado">Retirado</option>
          </select>

          {/* Incremento 3: dirección separada del estudiante */}
          <CamposDireccion valores={formData} errores={errores} onChange={handleChange} />

          <button type="submit" disabled={loading}>
            {loading ? "Registrando..." : "Registrar Estudiante"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default RegisterStudent;
