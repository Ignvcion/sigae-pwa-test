import { useEffect, useState } from "react";
import { getDocentes } from "../../services/api";

function Docentes() {
  const [docentes, setDocentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [especialidad, setEspecialidad] = useState("");
  const [estado, setEstado] = useState("");
  const [orden, setOrden] = useState({ campo: "Usuario_Nombre_Completo", ascendente: true });
  const [mensajeInfo, setMensajeInfo] = useState("");
  const [errorCarga, setErrorCarga] = useState("");

  useEffect(() => {
    cargarDocentes({ especialidad: "", estado: "" });
  }, []);

  const cargarDocentes = async (filtros) => {
    setLoading(true);
    setErrorCarga("");
    setMensajeInfo("");
    try {
      const data = await getDocentes(filtros);
      if (Array.isArray(data)) {
        setDocentes(data);
      } else {
        // CU30/CU31 - Excepción "Sin coincidencias": sin docentes registrados o sin coincidencias con los filtros
        setDocentes(data.docentes || []);
        setMensajeInfo(data.mensaje || "No existen docentes registrados");
      }
    } catch (error) {
      // CU30/CU31 - Excepción "Problema técnico"
      setErrorCarga(error.message || "No fue posible obtener el listado, reintente posteriormente");
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltros = (e) => {
    e.preventDefault();
    cargarDocentes({ especialidad, estado });
  };

  const limpiarFiltros = () => {
    setEspecialidad("");
    setEstado("");
    cargarDocentes({ especialidad: "", estado: "" });
  };

  const alternarOrden = (campo) => {
    setOrden((prev) => ({
      campo,
      ascendente: prev.campo === campo ? !prev.ascendente : true,
    }));
  };

  const flechaOrden = (campo) => (orden.campo === campo ? (orden.ascendente ? " ↑" : " ↓") : "");

  const docentesOrdenados = [...docentes].sort((a, b) => {
    const factor = orden.ascendente ? 1 : -1;
    const valorA = a[orden.campo] ?? "";
    const valorB = b[orden.campo] ?? "";
    return String(valorA).localeCompare(String(valorB)) * factor;
  });

  // CU31 - Excepción "Información incompleta": mostrar los datos faltantes en vez de dejarlos en blanco
  const renderDato = (valor, textoSinRegistrar) =>
    valor === null || valor === undefined || valor === "" ? (
      <span className="dato-sin-registrar">{textoSinRegistrar}</span>
    ) : (
      valor
    );

  if (loading) {
    return (
      <div className="usuarios-container">
        <p>Cargando docentes...</p>
      </div>
    );
  }

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h1>Docentes</h1>
        <p>Listado de docentes registrados en el sistema</p>
      </div>

      <form className="usuarios-filtros" onSubmit={aplicarFiltros}>
        <input
          type="text"
          className="usuarios-search"
          placeholder="Buscar por especialidad..."
          value={especialidad}
          onChange={(e) => setEspecialidad(e.target.value)}
        />
        <select
          className="usuarios-select"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="1">Activo</option>
          <option value="0">Inactivo</option>
        </select>
        <button type="submit" className="btn-roles">Filtrar</button>
        <button type="button" className="btn-roles" onClick={limpiarFiltros}>Limpiar</button>
      </form>

      {errorCarga && (
        <div className="usuarios-empty" style={{ color: "#dc2626" }}>
          {errorCarga}
        </div>
      )}

      {!errorCarga && mensajeInfo && (
        <div className="usuarios-empty">{mensajeInfo}</div>
      )}

      {!errorCarga && !mensajeInfo && (
        <div className="tabla-responsive-container">
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
                Especialidad{flechaOrden("Docente_Especialidad")}
              </th>
              <th style={{ minWidth: "240px" }}>Correo institucional</th>
              <th>Teléfono</th>
              <th>Carga horaria máxima</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {docentesOrdenados.map((d, idx) => (
              <tr key={d.Usuario_Id}>
                <td>{idx + 1}</td>
                <td>{d.Usuario_Nombre_Completo}</td>
                <td>{d.Usuario_RUT}</td>
                <td>{renderDato(d.Docente_Especialidad, "Sin especialidad registrada")}</td>
                <td style={{ minWidth: "240px", wordBreak: "break-all", whiteSpace: "normal" }}>{renderDato(d.Docente_Correo_Institucional, "Sin correo institucional registrado")}</td>
                <td>{renderDato(d.Usuario_Telefono, "Sin teléfono registrado")}</td>
                <td>{renderDato(d.Docente_Carga_Horaria_Maxima, "Sin carga horaria registrada")}</td>
                <td>
                  {d.Usuario_Estado_Cuenta ? (
                    <span className="badge-activo">Activo</span>
                  ) : (
                    <span className="badge-inactivo">Inactivo</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

export default Docentes;
