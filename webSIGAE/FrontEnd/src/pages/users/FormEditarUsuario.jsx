import { useEffect, useState } from "react";
import { getEspecialidades, getDisponibilidadDocente } from "../../services/api";
import EtiquetasInput, { separarEtiquetas } from "../../components/EtiquetasInput";
import DisponibilidadSemanal, { errorTramos } from "../../components/DisponibilidadSemanal";
import "./FormEditarUsuario.css";
import {
  validarNombreCompleto, validarCorreoInstitucional, validarCorreo, DOMINIO_INSTITUCIONAL, TEXTO_DOMINIOS_INSTITUCIONALES,
  validarTelefonoChileno, validarDireccion, MENSAJE_TELEFONO, MAX_NOMBRE_COMPLETO,
} from "../../utils/validaciones";

// Edición de un usuario por el administrador, separada en bloques que se guardan por
// separado: datos personales, datos de cada rol y, para docentes, la disponibilidad
// laboral semanal (CU107). Cada bloque envía solo sus campos a PUT /api/usuarios/:id.

// Columnas de la dirección estructurada ↔ claves que usa validarDireccion.
// La dirección particular aplica a todo usuario, sin importar su rol.
const COLUMNAS_DIRECCION = {
  Usuario_Direccion_Calle : "calle",
  Usuario_Direccion_Numero: "numero",
  Usuario_Direccion_Depto : "depto",
  Usuario_Direccion_Comuna: "comuna",
};

const CAMPOS_DIRECCION = [
  { name: "Usuario_Direccion_Calle",  label: "Calle",                  maxLength: 100 },
  { name: "Usuario_Direccion_Numero", label: "Número",                 maxLength: 7 },
  { name: "Usuario_Direccion_Depto",  label: "Depto./Casa (opcional)", maxLength: 20 },
  { name: "Usuario_Direccion_Comuna", label: "Comuna",                 maxLength: 60 },
];

const direccionDesdeForm = (f) =>
  Object.fromEntries(Object.entries(COLUMNAS_DIRECCION).map(([col, clave]) => [clave, f[col] || ""]));

const CAMPOS_CORREO = ["Administrador_Correo_Institucional", "Docente_Correo_Institucional", "Apoderado_Correo_Natural"];

function validarCampo(name, value, form) {
  if (name === "Docente_Especialidades") {
    return value.length === 0 ? "Agrega al menos una especialidad" : "";
  }
  if (COLUMNAS_DIRECCION[name]) {
    return validarDireccion({ ...direccionDesdeForm(form), [COLUMNAS_DIRECCION[name]]: value })[COLUMNAS_DIRECCION[name]] || "";
  }
  switch (name) {
    case "Usuario_Nombre_Completo":
      return !validarNombreCompleto(value) ? "Ingrese nombre y apellido, solo letras y espacios (ej: Juan Pérez)" : "";
    case "Usuario_Telefono":
      return !validarTelefonoChileno(value) ? MENSAJE_TELEFONO : "";
    case "Docente_Carga_Horaria_Semanal":
      return value === "" || Number.isNaN(Number(value)) || Number(value) <= 0 || Number(value) > 44
        ? "La carga horaria semanal debe ser un número entre 1 y 44 horas"
        : "";
  }
  // Los correos de cada rol son obligatorios: el backend tampoco acepta dejarlos vacíos
  if (CAMPOS_CORREO.includes(name) && !String(value ?? "").trim()) return "El correo es obligatorio";
  if (!value) return "";
  switch (name) {
    case "Administrador_Correo_Institucional":
    case "Docente_Correo_Institucional":
      return !validarCorreoInstitucional(value) ? `El correo debe pertenecer al dominio ${TEXTO_DOMINIOS_INSTITUCIONALES}` : "";
    case "Apoderado_Correo_Natural":
      return !validarCorreo(value) ? "Ingrese un correo electrónico válido" : "";
    default:
      return "";
  }
}

/** Envía un bloque a PUT /api/usuarios/:id y maneja sus mensajes. */
function useGuardarBloque(usuarioId, onGuardado) {
  const [estado, setEstado] = useState({ enviando: false, exito: "", error: "" });
  const guardar = async (cuerpo, mensajeExito) => {
    setEstado({ enviando: true, exito: "", error: "" });
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstado({ enviando: false, exito: "", error: data.mensaje || "Error al guardar cambios" });
        return;
      }
      const advertencia = data.Disponibilidad_Laboral?.advertencia;
      setEstado({ enviando: false, error: "", exito: advertencia ? `${mensajeExito}. ⚠ ${advertencia}` : mensajeExito });
      if (onGuardado) onGuardado();
    } catch {
      setEstado({ enviando: false, exito: "", error: "Error de conexión al servidor" });
    }
  };
  return [estado, guardar];
}

/** Valida los campos indicados; devuelve los errores (vacío si todo está bien). */
function erroresDe(campos, form) {
  return Object.fromEntries(
    campos.map((name) => [name, validarCampo(name, form[name], form)]).filter(([, msg]) => msg)
  );
}

function Campo({ name, label, form, errores, onChange, ...props }) {
  return (
    <div className="campo-pwd">
      <label htmlFor={`editar-${name}`}>{label}</label>
      <input
        id={`editar-${name}`}
        name={name}
        value={form[name]}
        onChange={onChange}
        className={errores[name] ? "input-invalid" : ""}
        {...props}
      />
      {errores[name] && <span className="input-error-msg">{errores[name]}</span>}
    </div>
  );
}

function PieBloque({ estado, texto = "Guardar cambios" }) {
  return (
    <>
      {estado.exito && <div className="msg-exito" role="status">{estado.exito}</div>}
      {estado.error && <div className="msg-error-form" role="alert">{estado.error}</div>}
      <button type="submit" className="btn-primario" disabled={estado.enviando}>
        {estado.enviando ? "Guardando..." : texto}
      </button>
    </>
  );
}

/* ── Bloque 1: datos personales y dirección ─────────────────────────── */
function BloqueDatosPersonales({ datos, onGuardado }) {
  const [form, setForm] = useState({
    Usuario_Nombre_Completo: datos.Usuario_Nombre_Completo || "",
    Usuario_Telefono: datos.Usuario_Telefono || "",
    ...Object.fromEntries(Object.keys(COLUMNAS_DIRECCION).map((col) => [col, datos[col] || ""])),
  });
  const [errores, setErrores] = useState({});
  const [estado, guardar] = useGuardarBloque(datos.Usuario_Id, onGuardado);

  // La dirección es obligatoria para el apoderado; en los demás roles se valida y
  // envía solo si se ingresó (cuentas antiguas pueden no tenerla registrada)
  const incluyeDireccion =
    datos.Es_Apoderado || Object.keys(COLUMNAS_DIRECCION).some((col) => String(form[col]).trim() !== "");
  const campos = ["Usuario_Nombre_Completo", "Usuario_Telefono", ...(incluyeDireccion ? Object.keys(COLUMNAS_DIRECCION) : [])];

  const onChange = (e) => {
    const { name, value } = e.target;
    const nuevo = { ...form, [name]: value };
    setForm(nuevo);
    setErrores({ ...errores, [name]: validarCampo(name, value, nuevo) });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const nuevos = erroresDe(campos, form);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    guardar(Object.fromEntries(campos.map((c) => [c, form[c]])), "Datos personales actualizados");
  };

  return (
    <div className="perfil-card editar-bloque">
      <h2>Datos personales</h2>
      <form className="cambiar-pwd-form" onSubmit={onSubmit} noValidate>
        <div className="editar-grid">
          <Campo name="Usuario_Nombre_Completo" label="Nombre completo" form={form} errores={errores} onChange={onChange}
            placeholder="Nombre completo (ej: Juan Pérez)" maxLength={MAX_NOMBRE_COMPLETO} />
          <Campo name="Usuario_Telefono" label="Teléfono" type="tel" form={form} errores={errores} onChange={onChange}
            placeholder="912345678 o +56912345678" />
        </div>
        <h3 className="editar-subtitulo">Dirección</h3>
        <div className="editar-grid">
          {CAMPOS_DIRECCION.map((c) => (
            <Campo key={c.name} name={c.name} label={c.label} maxLength={c.maxLength}
              form={form} errores={errores} onChange={onChange} />
          ))}
        </div>
        <PieBloque estado={estado} />
      </form>
    </div>
  );
}

/* ── Bloque de correo de un rol (administrador o apoderado) ─────────── */
function BloqueCorreoRol({ datos, onGuardado, titulo, name, label, placeholder }) {
  const [form, setForm] = useState({ [name]: datos[name] || "" });
  const [errores, setErrores] = useState({});
  const [estado, guardar] = useGuardarBloque(datos.Usuario_Id, onGuardado);

  const onChange = (e) => {
    setForm({ [name]: e.target.value });
    setErrores({ [name]: validarCampo(name, e.target.value, form) });
  };
  const onSubmit = (e) => {
    e.preventDefault();
    const nuevos = erroresDe([name], form);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    guardar(form, `${titulo} actualizados`);
  };

  return (
    <div className="perfil-card editar-bloque">
      <h2>{titulo}</h2>
      <form className="cambiar-pwd-form" onSubmit={onSubmit} noValidate>
        <Campo name={name} label={label} placeholder={placeholder} form={form} errores={errores} onChange={onChange} />
        <PieBloque estado={estado} />
      </form>
    </div>
  );
}

/* ── Bloque docente: correo, especialidades y carga horaria semanal ─── */
function BloqueDocente({ datos, onGuardado }) {
  const [form, setForm] = useState({
    Docente_Correo_Institucional: datos.Docente_Correo_Institucional || "",
    Docente_Especialidades: separarEtiquetas(datos.Docente_Especialidad),
    Docente_Carga_Horaria_Semanal: datos.Docente_Carga_Horaria_Semanal ?? "",
  });
  const [errores, setErrores] = useState({});
  const [catalogo, setCatalogo] = useState([]);
  const [estado, guardar] = useGuardarBloque(datos.Usuario_Id, onGuardado);
  const campos = ["Docente_Correo_Institucional", "Docente_Especialidades", "Docente_Carga_Horaria_Semanal"];

  useEffect(() => {
    getEspecialidades().then((d) => setCatalogo((d || []).map((e) => e.Especialidad_Nombre))).catch(() => {});
  }, []);

  const cambiar = (name, value) => {
    const nuevo = { ...form, [name]: value };
    setForm(nuevo);
    setErrores({ ...errores, [name]: validarCampo(name, value, nuevo) });
  };
  const onSubmit = (e) => {
    e.preventDefault();
    const nuevos = erroresDe(campos, form);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    guardar(Object.fromEntries(campos.map((c) => [c, form[c]])), "Datos de docente actualizados");
  };

  return (
    <div className="perfil-card editar-bloque">
      <h2>Datos de docente</h2>
      <form className="cambiar-pwd-form" onSubmit={onSubmit} noValidate>
        <Campo name="Docente_Correo_Institucional" label="Correo institucional" placeholder={`nombre${DOMINIO_INSTITUCIONAL}`}
          form={form} errores={errores} onChange={(e) => cambiar(e.target.name, e.target.value)} />
        <div className="campo-pwd">
          <label htmlFor="editar-especialidades">Especialidades</label>
          <EtiquetasInput
            id="editar-especialidades"
            valores={form.Docente_Especialidades}
            opciones={catalogo}
            invalido={!!errores.Docente_Especialidades}
            onChange={(valores) => cambiar("Docente_Especialidades", valores)}
          />
          {errores.Docente_Especialidades && <span className="input-error-msg">{errores.Docente_Especialidades}</span>}
        </div>
        <Campo name="Docente_Carga_Horaria_Semanal" label="Carga horaria semanal (hrs)" type="number" min="1" max="44"
          form={form} errores={errores} onChange={(e) => cambiar(e.target.name, e.target.value)} />
        <PieBloque estado={estado} />
      </form>
    </div>
  );
}

/* ── Bloque disponibilidad laboral semanal (CU107; solo administrador) ── */
function BloqueDisponibilidad({ datos, onGuardado }) {
  const [disp, setDisp] = useState(null);
  const [periodoPedido, setPeriodoPedido] = useState(""); // vacío = período vigente
  const [errorCarga, setErrorCarga] = useState("");
  const [estado, guardar] = useGuardarBloque(datos.Usuario_Id, onGuardado);

  useEffect(() => {
    let vigente = true;
    getDisponibilidadDocente(datos.Usuario_Id, periodoPedido || undefined)
      .then((d) => { if (vigente) { setDisp(d); setErrorCarga(""); } })
      .catch((e) => vigente && setErrorCarga(e.message || "No fue posible cargar la disponibilidad"));
    return () => { vigente = false; };
  }, [datos.Usuario_Id, periodoPedido]);

  const errorDeTramos = disp ? errorTramos(disp.tramos, disp.dias) : "";

  const onSubmit = (e) => {
    e.preventDefault();
    if (!disp || errorDeTramos) return;
    guardar(
      { Docente_Disponibilidad: { periodo: disp.periodo, tramos: disp.tramos } },
      `Disponibilidad de ${disp.periodo} guardada`
    );
  };

  return (
    <div className="perfil-card editar-bloque editar-bloque--ancho">
      <h2>Disponibilidad laboral semanal</h2>
      <form className="cambiar-pwd-form" onSubmit={onSubmit}>
        <p className="etiquetas-ayuda">
          Tramos de cada día en que el docente está en el colegio, con recreos y horas sin clases
          (corregir pruebas, reuniones). Sin tramos, no tiene restricción.
        </p>
        {errorCarga && <span className="input-error-msg">{errorCarga}</span>}
        {!disp && !errorCarga && <span className="etiquetas-ayuda">Cargando disponibilidad…</span>}
        {disp && (
          <DisponibilidadSemanal
            dias={disp.dias}
            bloques={disp.bloques}
            jornada={disp.jornada}
            limites={disp.limites}
            tramos={disp.tramos}
            clases={disp.clases}
            atencion={disp.atencion}
            cargaSemanal={datos.Docente_Carga_Horaria_Semanal}
            periodo={disp.periodo}
            periodos={disp.periodos}
            onCambiarPeriodo={(p) => { setDisp(null); setErrorCarga(""); setPeriodoPedido(p); }}
            onChange={(tramos) => setDisp({ ...disp, tramos })}
          />
        )}
        {disp && <PieBloque estado={estado} texto="Guardar disponibilidad" />}
      </form>
    </div>
  );
}

function FormEditarUsuario({ datos, onGuardado }) {
  return (
    <section className="editar-seccion" aria-labelledby="editar-seccion-titulo">
      <h2 className="editar-seccion-titulo" id="editar-seccion-titulo">Editar datos de {datos.Usuario_Nombre_Completo}</h2>
      <BloqueDatosPersonales datos={datos} onGuardado={onGuardado} />
      {!!datos.Es_Docente && <BloqueDocente datos={datos} onGuardado={onGuardado} />}
      {!!datos.Es_Administrador && (
        <BloqueCorreoRol datos={datos} onGuardado={onGuardado} titulo="Datos de administrador"
          name="Administrador_Correo_Institucional" label="Correo institucional" placeholder={`nombre${DOMINIO_INSTITUCIONAL}`} />
      )}
      {!!datos.Es_Apoderado && (
        <BloqueCorreoRol datos={datos} onGuardado={onGuardado} titulo="Datos de apoderado"
          name="Apoderado_Correo_Natural" label="Correo personal" />
      )}
      {!!datos.Es_Docente && <BloqueDisponibilidad datos={datos} onGuardado={onGuardado} />}
    </section>
  );
}

export default FormEditarUsuario;
