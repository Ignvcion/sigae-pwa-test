import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const TOKEN = () => localStorage.getItem("token");
const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` });

function TablaAsignaturas({ asignaturas }) {
  if (!asignaturas || asignaturas.length === 0) {
    return <p className="empty-state-text">Este plan no tiene asignaturas registradas.</p>;
  }
  return (
    <table className="tabla-asignaturas">
      <thead>
        <tr>
          <th>Asignatura</th>
          <th>Prioridad</th>
          <th>Tipo</th>
          <th>Horas / sem</th>
        </tr>
      </thead>
      <tbody>
        {asignaturas.map((a) => (
          <tr key={a.IncluyeAsig_Id}>
            <td>{a.Asignatura_Nombre}</td>
            <td>{a.Asignatura_Prioridad_Academica}</td>
            <td>
              <span className={`badge-estado ${a.Tipo === "Obligatorio" ? "badge-vigente" : "badge-inactiva"}`}>
                {a.Tipo}
              </span>
            </td>
            <td>{a.Horas_Semanales_Requeridas}h</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* Catálogo de asignaturas disponibles: siempre visible; el buscador solo filtra */
function SelectorAsignaturas({ disponibles, busqueda, onBuscar, onAgregar, maxHeight }) {
  return (
    <>
      <input
        type="text"
        placeholder="Filtrar asignaturas..."
        value={busqueda}
        onChange={(e) => onBuscar(e.target.value)}
        style={{ display: "block", width: "100%", marginTop: "0.25rem", boxSizing: "border-box" }}
      />
      {disponibles.length === 0 ? (
        <p className="empty-state-text" style={{ marginTop: "0.25rem" }}>
          {busqueda
            ? `No hay asignaturas que coincidan con "${busqueda}".`
            : "Todas las asignaturas ya fueron agregadas al plan."}
        </p>
      ) : (
        <div className="asignaturas-lista" style={{ maxHeight, overflowY: "auto", marginTop: "0.25rem" }}>
          {disponibles.map((a) => (
            <div
              key={a.Asignatura_Id}
              className="asignatura-item"
              onClick={() => onAgregar(a)}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}
              title="Agregar al plan"
            >
              <span className="asig-nombre">{a.Asignatura_Nombre}</span>
              <span className="asig-tipo">{a.Asignatura_Prioridad_Academica}</span>
              {a.Horas_Semanales_Requeridas ? (
                <span className="asig-tipo" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                  {a.Horas_Semanales_Requeridas}h/sem
                </span>
              ) : null}
              <span style={{ color: "#6366f1", fontWeight: 600 }}>＋</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FilaAsignatura({ asig, onChange, onRemove }) {
  return (
    <div className="asignatura-item" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <span className="asig-nombre" style={{ flex: "1 1 180px" }}>{asig.Asignatura_Nombre}</span>
      <span className="asig-tipo" style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
        {asig.Asignatura_Prioridad_Academica}
      </span>
      <select
        value={asig.tipo}
        onChange={(e) => onChange(asig.Asignatura_Id, "tipo", e.target.value)}
        style={{ width: "140px" }}
      >
        <option value="Obligatorio">Obligatorio</option>
        <option value="Complementario">Complementario</option>
      </select>
      <input
        type="number"
        min={1}
        max={40}
        value={asig.horas_semanales}
        onChange={(e) => onChange(asig.Asignatura_Id, "horas_semanales", e.target.value)}
        placeholder="Horas"
        style={{ width: "70px" }}
      />
      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>h/sem</span>
      <button type="button" className="btn-cerrar" onClick={() => onRemove(asig.Asignatura_Id)} title="Quitar">✕</button>
    </div>
  );
}

function ModalDetallePlan({ planId, onClose, onEditar }) {
  const [plan, setPlan] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(`/api/planes/${planId}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
        const data = await res.json();
        if (!res.ok) setError(data.error || "Error al cargar el plan");
        else setPlan(data);
      } catch {
        setError("Error al conectar con el servidor");
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [planId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "640px" }}>
        <div className="modal-header">
          <h2>{plan ? `${plan.Nivel_Educativo_Nombre} – ${plan.Plan_Educativo_Periodo_Lectivo}` : "Detalle del plan"}</h2>
          <button className="btn-cerrar" onClick={onClose}>✕</button>
        </div>
        {cargando ? (
          <p>Cargando...</p>
        ) : error ? (
          <p className="msg-error">{error}</p>
        ) : (
          <>
            <TablaAsignaturas asignaturas={plan.asignaturas} />
            <div className="modal-actions" style={{ marginTop: "1.25rem" }}>
              <button type="button" className="btn-secundario" onClick={onClose}>Cerrar</button>
              <button type="button" className="btn-primary" onClick={() => onEditar(planId)}>Editar plan</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FormCrearPlan({ onExito, onCancelar, periodoPropuesto }) {
  const [niveles, setNiveles]             = useState([]);
  const [todasAsig, setTodasAsig]         = useState([]);
  const [nivelId, setNivelId]             = useState("");
  const [periodo, setPeriodo]             = useState(periodoPropuesto || new Date().getFullYear().toString());
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [asigBuscada, setAsigBuscada]     = useState("");
  const [error, setError]                 = useState("");
  const [enviando, setEnviando]           = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [rNiveles, rAsig] = await Promise.all([
          fetch(`/api/planes/niveles-sin-plan?periodo=${periodo}`, { headers: { Authorization: `Bearer ${TOKEN()}` } }),
          fetch(`/api/planes/asignaturas`, { headers: { Authorization: `Bearer ${TOKEN()}` } }),
        ]);
        setNiveles(await rNiveles.json());
        const asig = await rAsig.json();
        setTodasAsig(Array.isArray(asig) ? asig : []);
      } catch {
        setError("Error al cargar datos");
      }
    };
    cargar();
  }, [periodo]);

  const agregarAsig = (asig) => {
    if (seleccionadas.find((a) => a.Asignatura_Id === asig.Asignatura_Id)) return;
    setSeleccionadas((prev) => [...prev, { ...asig, tipo: "Obligatorio", horas_semanales: 2 }]);
    setAsigBuscada("");
  };

  const actualizarAsig = (asigId, campo, valor) => {
    setSeleccionadas((prev) =>
      prev.map((a) => (a.Asignatura_Id === asigId ? { ...a, [campo]: campo === "horas_semanales" ? Number(valor) : valor } : a))
    );
  };

  const quitarAsig = (asigId) => {
    setSeleccionadas((prev) => prev.filter((a) => a.Asignatura_Id !== asigId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!nivelId) return setError("Debe seleccionar un nivel educativo");
    if (seleccionadas.length === 0) return setError("Debe incluir al menos una asignatura");

    const payload = {
      nivel_educativo_id: Number(nivelId),
      periodo_lectivo: periodo,
      asignaturas: seleccionadas.map((a) => ({
        asignatura_id   : a.Asignatura_Id,
        tipo            : a.tipo,
        horas_semanales : a.horas_semanales,
      })),
    };

    setEnviando(true);
    try {
      const res = await fetch("/api/planes", { method: "POST", headers: authH(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else onExito(data.mensaje);
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  };

  const asigNoSeleccionadas = todasAsig.filter(
    (a) =>
      !seleccionadas.find((s) => s.Asignatura_Id === a.Asignatura_Id) &&
      (asigBuscada === "" || a.Asignatura_Nombre.toLowerCase().includes(asigBuscada.toLowerCase()))
  );

  return (
    <form onSubmit={handleSubmit} className="form-card">
      <h2>Nuevo Plan Educativo</h2>
      {error && <p className="msg-error">{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label>Periodo Lectivo</label>
          <input
            type="text"
            value={periodo}
            onChange={(e) => { setPeriodo(e.target.value); setNivelId(""); }}
            placeholder="Ej: 2026"
            required
          />
        </div>
        <div>
          <label>Nivel Educativo</label>
          <select value={nivelId} onChange={(e) => setNivelId(e.target.value)} required>
            <option value="">Seleccionar nivel...</option>
            {niveles.map((n) => (
              <option key={n.Nivel_Educativo_Id} value={n.Nivel_Educativo_Id}>
                {n.Nivel_Educativo_Nombre}
              </option>
            ))}
          </select>
          {niveles.length === 0 && periodo && (
            <small style={{ color: "var(--text-secondary)" }}>
              Todos los niveles ya tienen plan para {periodo}.
            </small>
          )}
        </div>
      </div>

      <label style={{ marginTop: "1rem" }}>Agregar asignatura al plan</label>
      <SelectorAsignaturas
        disponibles={asigNoSeleccionadas}
        busqueda={asigBuscada}
        onBuscar={setAsigBuscada}
        onAgregar={agregarAsig}
        maxHeight="220px"
      />

      <label style={{ marginTop: "1rem" }}>Asignaturas incluidas ({seleccionadas.length})</label>
      {seleccionadas.length === 0 ? (
        <p className="empty-state-text">Aún no has agregado asignaturas. Haz clic en una de la lista de arriba para agregarla.</p>
      ) : (
        <div className="asignaturas-lista">
          {seleccionadas.map((a) => (
            <FilaAsignatura key={a.Asignatura_Id} asig={a} onChange={actualizarAsig} onRemove={quitarAsig} />
          ))}
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={enviando || seleccionadas.length === 0}>
          {enviando ? "Registrando..." : "Crear Plan"}
        </button>
      </div>
    </form>
  );
}

function FormEditarPlan({ planId, onExito, onCancelar }) {
  const [niveles, setNiveles]         = useState([]);
  const [todasAsig, setTodasAsig]     = useState([]);
  const [nivelId, setNivelId]         = useState("");
  const [periodo, setPeriodo]         = useState("");
  const [asignaturas, setAsignaturas] = useState([]);
  const [asigBuscada, setAsigBuscada] = useState("");
  const [error, setError]             = useState("");
  const [cargando, setCargando]       = useState(true);
  const [enviando, setEnviando]       = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const h = { Authorization: `Bearer ${TOKEN()}` };
        const [rPlan, rNiveles, rAsig] = await Promise.all([
          fetch(`/api/planes/${planId}`, { headers: h }),
          fetch("/api/cursos/niveles", { headers: h }),
          fetch("/api/planes/asignaturas", { headers: h }),
        ]);
        const plan = await rPlan.json();
        if (!rPlan.ok) { setError(plan.error || "Error al cargar el plan"); return; }
        const niv = await rNiveles.json();
        const asig = await rAsig.json();
        setNiveles(Array.isArray(niv) ? niv : []);
        setTodasAsig(Array.isArray(asig) ? asig : []);
        setNivelId(String(plan.Nivel_Educativo_Id));
        setPeriodo(plan.Plan_Educativo_Periodo_Lectivo);
        setAsignaturas(
          plan.asignaturas.map((a) => ({
            Asignatura_Id                 : a.Asignatura_Id,
            Asignatura_Nombre             : a.Asignatura_Nombre,
            Asignatura_Prioridad_Academica: a.Asignatura_Prioridad_Academica,
            tipo                          : a.Tipo,
            horas_semanales               : a.Horas_Semanales_Requeridas,
          }))
        );
      } catch {
        setError("Error al conectar con el servidor");
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [planId]);

  const agregarAsig = (asig) => {
    if (asignaturas.find((a) => a.Asignatura_Id === asig.Asignatura_Id)) return;
    setAsignaturas((prev) => [...prev, { ...asig, tipo: "Obligatorio", horas_semanales: 2 }]);
    setAsigBuscada("");
  };

  const actualizarAsig = (asigId, campo, valor) => {
    setAsignaturas((prev) =>
      prev.map((a) => (a.Asignatura_Id === asigId ? { ...a, [campo]: campo === "horas_semanales" ? Number(valor) : valor } : a))
    );
  };

  const quitarAsig = (asigId) => {
    setAsignaturas((prev) => prev.filter((a) => a.Asignatura_Id !== asigId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!nivelId) return setError("Debe seleccionar un nivel educativo");
    if (!periodo.trim()) return setError("Debe indicar el periodo lectivo");
    if (asignaturas.length === 0) return setError("El plan debe contener al menos una asignatura");

    const payload = {
      nivel_educativo_id: Number(nivelId),
      periodo_lectivo   : periodo,
      asignaturas       : asignaturas.map((a) => ({
        asignatura_id  : a.Asignatura_Id,
        tipo           : a.tipo,
        horas_semanales: a.horas_semanales,
      })),
    };

    setEnviando(true);
    try {
      const res = await fetch(`/api/planes/${planId}`, { method: "PUT", headers: authH(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else onExito([data.mensaje, ...(data.advertencias || [])].join(" · "));
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  };

  const asigNoSeleccionadas = todasAsig.filter(
    (a) =>
      !asignaturas.find((s) => s.Asignatura_Id === a.Asignatura_Id) &&
      (asigBuscada === "" || a.Asignatura_Nombre.toLowerCase().includes(asigBuscada.toLowerCase()))
  );

  if (cargando) return <div className="form-card"><p>Cargando plan...</p></div>;

  return (
    <form onSubmit={handleSubmit} className="form-card">
      <h2>Editar Plan Educativo</h2>
      {error && <p className="msg-error">{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label>Periodo Lectivo</label>
          <input
            type="text"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            placeholder="Ej: 2026"
            required
          />
        </div>
        <div>
          <label>Nivel Educativo</label>
          <select value={nivelId} onChange={(e) => setNivelId(e.target.value)} required>
            <option value="">Seleccionar nivel...</option>
            {niveles.map((n) => (
              <option key={n.Nivel_Educativo_Id} value={n.Nivel_Educativo_Id}>
                {n.Nivel_Educativo_Nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label style={{ marginTop: "1rem" }}>Agregar asignatura al plan</label>
      <SelectorAsignaturas
        disponibles={asigNoSeleccionadas}
        busqueda={asigBuscada}
        onBuscar={setAsigBuscada}
        onAgregar={agregarAsig}
        maxHeight="200px"
      />

      <label style={{ marginTop: "1rem" }}>Asignaturas del plan ({asignaturas.length})</label>
      {asignaturas.length === 0 ? (
        <p className="empty-state-text">El plan debe tener al menos una asignatura. Agrégala desde la lista de arriba.</p>
      ) : (
        <div className="asignaturas-lista">
          {asignaturas.map((a) => (
            <FilaAsignatura key={a.Asignatura_Id} asig={a} onChange={actualizarAsig} onRemove={quitarAsig} />
          ))}
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={enviando || asignaturas.length === 0}>
          {enviando ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function FormClonarPlan({ planesExistentes, onExito, onCancelar }) {
  const [niveles, setNiveles]           = useState([]);
  const [todasAsig, setTodasAsig]       = useState([]);
  const [planOrigenId, setPlanOrigenId] = useState("");
  const [nivelDestId, setNivelDestId]   = useState("");
  const [nuevoPeriodo, setNuevoPeriodo] = useState(new Date().getFullYear().toString());
  const [asignaturas, setAsignaturas]   = useState([]);
  const [asigBuscada, setAsigBuscada]   = useState("");
  const [error, setError]               = useState("");
  const [enviando, setEnviando]         = useState(false);
  const [cargandoAsig, setCargandoAsig] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [rNiveles, rAsig] = await Promise.all([
          fetch("/api/cursos/niveles", { headers: { Authorization: `Bearer ${TOKEN()}` } }),
          fetch("/api/planes/asignaturas", { headers: { Authorization: `Bearer ${TOKEN()}` } }),
        ]);
        setNiveles(await rNiveles.json());
        const asig = await rAsig.json();
        setTodasAsig(Array.isArray(asig) ? asig : []);
      } catch {
        setError("Error al cargar datos");
      }
    };
    cargar();
  }, []);

  useEffect(() => {
    if (!planOrigenId) { setAsignaturas([]); return; }
    const precargar = async () => {
      setCargandoAsig(true);
      try {
        const res = await fetch(`/api/planes/${planOrigenId}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
        const data = await res.json();
        if (!res.ok) { setError(data.error); return; }
        setAsignaturas(
          data.asignaturas.map((a) => ({
            Asignatura_Id                 : a.Asignatura_Id,
            Asignatura_Nombre             : a.Asignatura_Nombre,
            Asignatura_Prioridad_Academica: a.Asignatura_Prioridad_Academica,
            tipo                          : a.Tipo,
            horas_semanales               : a.Horas_Semanales_Requeridas,
          }))
        );
      } catch {
        setError("Error al cargar asignaturas del plan origen");
      } finally {
        setCargandoAsig(false);
      }
    };
    precargar();
  }, [planOrigenId]);

  const agregarAsig = (asig) => {
    if (asignaturas.find((a) => a.Asignatura_Id === asig.Asignatura_Id)) return;
    setAsignaturas((prev) => [...prev, { ...asig, tipo: "Obligatorio", horas_semanales: 2 }]);
    setAsigBuscada("");
  };

  const actualizarAsig = (asigId, campo, valor) => {
    setAsignaturas((prev) =>
      prev.map((a) => (a.Asignatura_Id === asigId ? { ...a, [campo]: campo === "horas_semanales" ? Number(valor) : valor } : a))
    );
  };

  const quitarAsig = (asigId) => {
    setAsignaturas((prev) => prev.filter((a) => a.Asignatura_Id !== asigId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!planOrigenId) return setError("Debe seleccionar un plan origen");
    if (!nivelDestId)  return setError("Debe seleccionar el nivel educativo destino");
    if (asignaturas.length === 0) return setError("El plan debe contener al menos una asignatura");

    const payload = {
      plan_origen_id       : Number(planOrigenId),
      nuevo_periodo_lectivo: nuevoPeriodo,
      nivel_educativo_id   : Number(nivelDestId),
      asignaturas          : asignaturas.map((a) => ({
        asignatura_id  : a.Asignatura_Id,
        tipo           : a.tipo,
        horas_semanales: a.horas_semanales,
      })),
    };

    setEnviando(true);
    try {
      const res = await fetch("/api/planes/clonar", { method: "POST", headers: authH(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else onExito(data.mensaje);
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  };

  const asigNoSeleccionadas = todasAsig.filter(
    (a) =>
      !asignaturas.find((s) => s.Asignatura_Id === a.Asignatura_Id) &&
      (asigBuscada === "" || a.Asignatura_Nombre.toLowerCase().includes(asigBuscada.toLowerCase()))
  );

  return (
    <form onSubmit={handleSubmit} className="form-card">
      <h2>Clonar Plan Educativo</h2>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "0.875rem" }}>
        Selecciona un plan existente como base. Podrás ajustar las asignaturas antes de guardar.
      </p>
      {error && <p className="msg-error">{error}</p>}

      <label>Plan Origen</label>
      <select value={planOrigenId} onChange={(e) => setPlanOrigenId(e.target.value)} required>
        <option value="">Seleccionar plan origen...</option>
        {planesExistentes.map((p) => (
          <option key={p.Plan_Educativo_Id} value={p.Plan_Educativo_Id}>
            {p.Nivel_Educativo_Nombre} – {p.Plan_Educativo_Periodo_Lectivo} ({p.total_asignaturas} asig.)
          </option>
        ))}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
        <div>
          <label>Nuevo Periodo Lectivo</label>
          <input
            type="text"
            value={nuevoPeriodo}
            onChange={(e) => setNuevoPeriodo(e.target.value)}
            placeholder="Ej: 2027"
            required
          />
        </div>
        <div>
          <label>Nivel Educativo Destino</label>
          <select value={nivelDestId} onChange={(e) => setNivelDestId(e.target.value)} required>
            <option value="">Seleccionar nivel...</option>
            {niveles.map((n) => (
              <option key={n.Nivel_Educativo_Id} value={n.Nivel_Educativo_Id}>
                {n.Nivel_Educativo_Nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cargandoAsig && <p style={{ marginTop: "1rem" }}>Cargando asignaturas del plan origen...</p>}

      {!cargandoAsig && planOrigenId && (
        <>
          <label style={{ marginTop: "1rem" }}>Agregar asignatura adicional</label>
          <SelectorAsignaturas
            disponibles={asigNoSeleccionadas}
            busqueda={asigBuscada}
            onBuscar={setAsigBuscada}
            onAgregar={agregarAsig}
            maxHeight="200px"
          />

          <label style={{ marginTop: "1rem" }}>Asignaturas del plan ({asignaturas.length})</label>
          {asignaturas.length === 0 ? (
            <p className="empty-state-text">Sin asignaturas. Selecciona un plan origen o agrega manualmente.</p>
          ) : (
            <div className="asignaturas-lista">
              {asignaturas.map((a) => (
                <FilaAsignatura key={a.Asignatura_Id} asig={a} onChange={actualizarAsig} onRemove={quitarAsig} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="modal-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={enviando || asignaturas.length === 0}>
          {enviando ? "Clonando..." : "Crear Plan Clonado"}
        </button>
      </div>
    </form>
  );
}

function PlanEducativo() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.roles?.some((r) => r === "Administrador" || r === "Super Admin");

  const [planes, setPlanes]               = useState([]);
  const [cargando, setCargando]           = useState(true);
  const [error, setError]                 = useState("");
  const [exito, setExito]                 = useState("");
  const [vista, setVista]                 = useState("lista");
  const [planDetalleId, setPlanDetalleId] = useState(null);
  const [planEditarId, setPlanEditarId]   = useState(null);

  const cargarPlanes = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/planes", { headers: { Authorization: `Bearer ${TOKEN()}` } });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error al cargar planes");
      else setPlanes(data);
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarPlanes(); }, [cargarPlanes]);

  const handleExito = (msg) => {
    setExito(msg);
    setVista("lista");
    setPlanEditarId(null);
    cargarPlanes();
    setTimeout(() => setExito(""), 5000);
  };

  const abrirEditar = (planId) => {
    setError("");
    setPlanDetalleId(null);
    setPlanEditarId(planId);
    setVista("editar");
  };

  const planesAgrupados = planes.reduce((acc, plan) => {
    const p = plan.Plan_Educativo_Periodo_Lectivo;
    if (!acc[p]) acc[p] = [];
    acc[p].push(plan);
    return acc;
  }, {});

  const periodosOrdenados = Object.keys(planesAgrupados).sort((a, b) => b.localeCompare(a));

  if (!esAdmin) {
    return (
      <div className="page-container">
        <p className="msg-error">No tienes permisos para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      {vista === "lista" && (
        <div className="page-header">
          <div>
            <h1>Plan Educativo por Nivel</h1>
            <p>Gestión de planes educativos y sus asignaturas por nivel y periodo</p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn-secundario" onClick={() => { setError(""); setVista("clonar"); }}>
              Clonar Plan Existente
            </button>
            <button className="btn-primary" onClick={() => { setError(""); setVista("crear"); }}>
              + Nuevo Plan
            </button>
          </div>
        </div>
      )}

      {exito && <p className="msg-exito">{exito}</p>}
      {error && vista === "lista" && <p className="msg-error">{error}</p>}

      {vista === "crear" && (
        <FormCrearPlan
          onExito={handleExito}
          onCancelar={() => setVista("lista")}
          periodoPropuesto={new Date().getFullYear().toString()}
        />
      )}

      {vista === "editar" && planEditarId && (
        <FormEditarPlan
          key={planEditarId}
          planId={planEditarId}
          onExito={handleExito}
          onCancelar={() => { setPlanEditarId(null); setVista("lista"); }}
        />
      )}

      {vista === "clonar" && (
        <FormClonarPlan
          planesExistentes={planes}
          onExito={handleExito}
          onCancelar={() => setVista("lista")}
        />
      )}

      {vista === "lista" && (
        cargando ? (
          <p>Cargando planes...</p>
        ) : planes.length === 0 ? (
          <div className="empty-state">
            <p>No hay planes educativos registrados.</p>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              Crea el primero usando el botón "+ Nuevo Plan".
            </p>
          </div>
        ) : (
          periodosOrdenados.map((periodo) => (
            <div key={periodo} className="cursos-grupo">
              <h3>Periodo {periodo}</h3>
              <div className="cursos-grid">
                {planesAgrupados[periodo].map((plan) => (
                  <div
                    key={plan.Plan_Educativo_Id}
                    className="curso-card curso-card-clickable"
                    onClick={() => setPlanDetalleId(plan.Plan_Educativo_Id)}
                    title="Ver asignaturas del plan"
                  >
                    <div className="curso-card-header">
                      <span className="curso-nombre">{plan.Nivel_Educativo_Nombre}</span>
                    </div>
                    <div className="curso-card-body">
                      <div className="plan-stats">
                        <div className="plan-stat">
                          <span className="plan-stat-valor">{plan.total_obligatorias ?? 0}</span>
                          <span className="plan-stat-label">Obligatorias</span>
                        </div>
                        <div className="plan-stat plan-stat-sep">
                          <span className="plan-stat-valor">{plan.total_complementarias ?? 0}</span>
                          <span className="plan-stat-label">Complementarias</span>
                        </div>
                        <div className="plan-stat">
                          <span className="plan-stat-valor">{plan.total_horas_semanales ?? 0}h</span>
                          <span className="plan-stat-label">h/sem</span>
                        </div>
                      </div>
                    </div>
                    <div className="curso-card-footer" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ padding: "4px 12px", fontSize: "0.75rem" }}
                        onClick={(e) => { e.stopPropagation(); abrirEditar(plan.Plan_Educativo_Id); }}
                        title="Editar plan"
                      >
                        ✏ Editar
                      </button>
                      <span className="curso-link">Ver asignaturas →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )
      )}

      {planDetalleId && (
        <ModalDetallePlan planId={planDetalleId} onClose={() => setPlanDetalleId(null)} onEditar={abrirEditar} />
      )}
    </div>
  );
}

export default PlanEducativo;
