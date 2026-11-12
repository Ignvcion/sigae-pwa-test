# Notificaciones (CU101)

SIGAE avisa dentro de la plataforma, con la campana del menú lateral, de los mensajes
y de los cambios en las citaciones. Usa la tabla `notificacion`, que estaba reservada
desde el Incremento 4: **no hubo cambios en la base de datos**.

| Qué pasa | Quién recibe la notificación |
|---|---|
| Mensaje nuevo | La contraparte de la conversación (una sola notificación sin leer por conversación) |
| Citación nueva (la crea el docente o un administrador) | El apoderado citado |
| Solicitud de citación (la pide el apoderado) | El docente |
| Citación confirmada, cancelada o reprogramada | Docente y apoderado de la citación, menos quien hizo el cambio |

- Mientras haya una notificación sin leer de la misma citación (o conversación), se
  actualiza esa en vez de crear otra, para no llenar la lista.
- La campana muestra cuántas hay sin leer y se actualiza cada minuto y al cambiar de
  página. Al elegir una, se marca como leída y abre el mensaje (`/mensajes?conversacion=ID`)
  o la citación (`/citaciones?citacion=ID`).
- También se marcan como leídas al abrir la conversación o el detalle de la citación,
  y con «Marcar todas como leídas».
- Docente y Apoderado ven solo las del perfil con que ingresaron. El administrador con
  la etiqueta UTP no tiene campana (no participa en mensajes ni citaciones).
- Si el mensaje o la citación se eliminan, la notificación se borra en cascada
  (CU101, Excepción 1). Una notificación nunca hace fallar la acción que la origina.

API (sesión iniciada):

- `GET /api/notificaciones?rol=Docente|Apoderado&limite=20` → `{ noLeidas, notificaciones: [{ id, tipo, fecha, leida, rol, titulo, detalle, enlace }] }`
- `PATCH /api/notificaciones/:id/leida`
- `PATCH /api/notificaciones/leidas` `{ rol? }`

Código: `BackEnd/utils/notificaciones.js`, `controllers/notificacionController.js`,
`routes/notificacionRoutes.js`, `FrontEnd/src/components/CampanaNotificaciones.jsx`.
Pruebas: `tests/superAdminNotificaciones.test.js`.

**No incluye (todavía):** avisos por correo electrónico ni notificaciones del
navegador (push). Se pueden agregar sobre esta misma base.
