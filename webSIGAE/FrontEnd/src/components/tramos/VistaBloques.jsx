// Vista por bloques de 45 minutos (y recreos) de la jornada: una fila por bloque y una
// columna por día. `celda(dia, bloque)` devuelve { estado, texto, titulo, onClick }:
// estado = "on" | "fuera" | "atencion" | "clase" | "bloqueada" | "".
function VistaBloques({ dias, bloques, celda, titulo = "Vista por bloques de clase", nota, leyenda }) {
  if (bloques.length === 0) return null;
  return (
    <details className="disp-vista-bloques" open>
      <summary>{titulo}</summary>
      {nota && <p className="disp-nota">{nota}</p>}
      {leyenda && (
        <div className="disp-leyenda">
          {leyenda.map((l) => (
            <span key={l.estado} className="disp-leyenda-item">
              <span className={`disp-muestra disp-celda--${l.estado}`} aria-hidden="true" />
              {l.texto}
            </span>
          ))}
        </div>
      )}
      <div className="disp-tabla-wrap">
        <table className="disp-tabla">
          <thead>
            <tr>
              <th scope="col">Bloque</th>
              {dias.map((d) => <th key={d} scope="col">{d.slice(0, 3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {bloques.map((b) => {
              const recreo = b.tipo === "Recreo";
              return (
                <tr key={b.Bloque_Horario_Id} className={recreo ? "disp-fila-recreo" : ""}>
                  <th scope="row">
                    {b.hora_inicio}–{b.hora_fin}
                    {recreo && <span className="disp-etiqueta-recreo">Recreo</span>}
                  </th>
                  {dias.map((d) => {
                    const c = celda(d, b);
                    const clase = `disp-celda${c.estado ? ` disp-celda--${c.estado}` : ""}`;
                    return (
                      <td key={d}>
                        {c.onClick ? (
                          <button type="button" className={clase} title={c.titulo} aria-label={c.etiqueta || c.titulo} onClick={c.onClick}>
                            {c.texto}
                          </button>
                        ) : (
                          <span className={clase} title={c.titulo}>{c.texto}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default VistaBloques;
