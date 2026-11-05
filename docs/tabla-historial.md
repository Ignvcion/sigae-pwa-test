# Tabla `historial` — estado de la auditoría

La tabla `historial` (definida en `SIGAE.sql`) es un registro de auditoría genérico:
guarda `Historial_Valor_Anterior`, `Historial_Valor_Nuevo`, `Historial_Atributo_Modificado`,
fecha/hora del cambio y el usuario responsable, con referencias opcionales a
`Usuario_Id`, `Estudiante_Id`, `Citacion_Id` y `Horario_Asignatura_Id`.

## Estado actual

**Escriben en esta tabla:**

| Módulo | Casos de uso | Dónde |
| --- | --- | --- |
| Citaciones | CU75 confirmar, CU76 cancelar, CU77 reprogramar (CU79 lo lee) | `citacionController.js` (`registrarHistorial`) |
| Asociaciones apoderado-estudiante | CU9 eliminar todas, CU10 eliminar una, CU39 editar | `estudianteController.js`, con `utils/historial.js` |

Se activó CU9, CU10 y CU39 antes de la marcha blanca, para que la auditoría parta
limpia con los datos reales. En las tres operaciones:

- El `UPDATE` de `estudiante` y el `INSERT INTO historial` van en **la misma
  transacción**: si falla el registro, se revierte el cambio.
- Se guarda una fila por estudiante afectado (CU9 puede afectar a varios), con
  `Historial_Atributo_Modificado = 'Apoderado_Usuario_Id'`, el valor anterior y el
  nuevo (sin apoderado = el texto `NULL`, porque las columnas de valor son NOT NULL),
  `Estudiante_Id`, `Usuario_Id` = apoderado afectado y
  `Usuario_Responsable_Id = req.user.id`.
- El `UPDATE` exige que el apoderado siga siendo el que se leyó; si otro usuario lo
  cambió entre medio, no se modifica nada ni se registra historial (CU10 responde
  400 y CU39, 409).

**El resto del backend todavía no escribe en `historial`** (otras ediciones de
`estudiante`, `usuario` y `horario_asignatura`).

## Qué falta

Para cada controlador que modifique `estudiante`, `usuario` o `horario_asignatura`,
agregar la llamada a `registrarHistorial` de `utils/historial.js` **dentro de la
transacción del cambio**, con el valor anterior, el nuevo, el atributo modificado y
`responsableId: req.user.id`, y actualizar sus pruebas unitarias (ver
`tests/asociaciones.test.js` como ejemplo de cómo simular la conexión).
