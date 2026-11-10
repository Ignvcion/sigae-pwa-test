# Correo de SIGAE (mailer) en producción

Cómo dejar funcionando el envío de códigos de verificación desde la EC2, cómo probarlo **antes** de abrir el sistema y cómo diagnosticarlo si falla.

> **Si solo lees una cosa:** con `NODE_ENV=production` el primer ingreso de **cualquier cuenta** (incluido el primer super administrador) exige un código que llega por correo. Si el SMTP no funciona, **nadie puede entrar**, ni para arreglarlo. Por eso el correo se prueba **antes** de crear al primer administrador.

## 1. Qué hace el mailer y de qué depende

- Código: `webSIGAE/BackEnd/utils/mailer.js` (envío por SMTP con nodemailer) y `utils/codigosVerificacion.js` (generación, vencimiento y bloqueo del código).
- Se usa en tres flujos: **activar la cuenta** en el primer ingreso, **recuperar la contraseña** (CU14) y **confirmar un cambio de correo** (CU19).
- El remitente es la cuenta `noreply@colegiojc.cl`. Los correos van marcados como automáticos y sin enlaces.
- Un código vence a los 10 minutos, sirve una vez, se bloquea tras 5 intentos fallidos y entre dos envíos al mismo usuario deben pasar 60 segundos.
- En desarrollo, sin `SMTP_HOST`, el código se muestra en la consola y en pantalla. **En producción eso no existe**: si el envío falla, el código se invalida y el usuario ve _"No fue posible enviar el código por correo"_ (HTTP 503).

### Por qué el primer super administrador queda atrapado

`scripts/crearSuperAdmin.js` crea la cuenta con `Usuario_Correo_Verificado = 0`. En su primer login el sistema no entrega la sesión: envía un código al correo que se indicó con `--correo` y pide ingresarlo. Entonces:

1. El SMTP tiene que funcionar **antes** del primer login.
2. El `--correo` tiene que ser una casilla **real y legible** (`@colegiojc.cl` o `@colegiojacquescousteau.cl`), no una inventada.

## 2. Preparar la cuenta `noreply@colegiojc.cl` (Google Workspace)

> Supuesto: el dominio `colegiojc.cl` está en Google Workspace (la cuenta de respaldos usa Google Drive). Si el correo lo da otro proveedor, usa los datos SMTP de ese proveedor (puerto 465, o 587 con STARTTLS) y salta al paso 3.

1. Entra a la cuenta `noreply@colegiojc.cl` y activa la **verificación en 2 pasos** (Cuenta de Google › Seguridad).
2. Crea una **contraseña de aplicación** (Cuenta de Google › Seguridad › Contraseñas de aplicaciones). Da 16 letras; cópialas **sin espacios**. Si la opción no aparece, el administrador de Workspace debe permitirla (Consola de administración › Seguridad › Autenticación), o la cuenta tiene una política que exige llaves de seguridad.
3. La contraseña normal de la cuenta **no sirve** para SMTP: Google responde `535 Username and Password not accepted`.
4. Opcional: una respuesta automática en esa casilla que diga que no se lee.
5. Límites: Google Workspace permite unos 2.000 correos al día por cuenta; sobra para códigos de verificación.

## 3. `.env` de producción

En `webSIGAE/BackEnd/.env` (`chmod 600`, dueño: el usuario que corre pm2):

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@colegiojc.cl
SMTP_PASS="abcdefghijklmnop"
EMAIL_FROM="SIGAE <noreply@colegiojc.cl>"
```

Reglas que evitan los errores más comunes:

| Regla | Por qué |
| --- | --- |
| `EMAIL_FROM` con el **mismo correo** que `SMTP_USER` | Gmail reescribe o rechaza un remitente distinto de la cuenta autenticada. |
| `SMTP_PORT=465` **con** `SMTP_SECURE=true`, o bien `SMTP_PORT=587` **sin** `SMTP_SECURE` | Mezclarlos (`587` con `SMTP_SECURE=true`) falla con un error de TLS (`wrong version number`). Con 587 el backend exige STARTTLS. |
| No uses el puerto 25 | AWS lo bloquea en EC2. |
| Comillas en `SMTP_PASS` y `EMAIL_FROM`, y sin espacios dentro de la contraseña | `dotenv` toma ` #` como inicio de comentario y `EMAIL_FROM` lleva `<>`. |
| `SMTP_PORT` es opcional (por defecto 587), pero **pónlo siempre** | El README y esta guía asumen 465. |

Después de editar el `.env`: `pm2 restart sigae-api`. Si falta `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` o `EMAIL_FROM`, el backend no arranca y `pm2 logs sigae-api` nombra la variable que falta (nunca muestra valores).

## 4. Dos cosas de AWS y DNS que no son código

**Salida desde la EC2.** El grupo de seguridad de una EC2 permite toda la salida por defecto. Si alguien la restringió, abre el 465 (o el 587) hacia internet. El 22, el 80 y el 443 de entrada no tienen relación con esto.

**Que el correo no caiga en spam** (lo más probable si "funciona pero no llega"). Con Google Workspace el dominio `colegiojc.cl` debería tener:

- **SPF:** registro TXT `v=spf1 include:_spf.google.com ~all` en el dominio.
- **DKIM:** en la Consola de administración (Aplicaciones › Google Workspace › Gmail › Autenticar correo), generar la clave y publicar el registro TXT que indica; luego pulsar _Iniciar autenticación_.
- **DMARC:** registro TXT `_dmarc` con al menos `v=DMARC1; p=none; rua=mailto:<una casilla del colegio>`.

Las tres cosas las configura quien administra el DNS y el Workspace del colegio. Sin ellas, los códigos (que vencen a los 10 minutos) pueden llegar tarde o quedar en spam, sobre todo hacia cuentas de otros dominios como las de los apoderados.

## 5. Probar el correo desde la EC2 (antes de crear usuarios)

Desde `webSIGAE/BackEnd`, con el `.env` de producción. Usa el mismo código que usa la aplicación, así que prueba justo lo que importa. Reemplaza `tucorreo@...` por una casilla tuya:

```bash
node -e "const m=require('./utils/mailer'); if(!m.correoConfigurado()){console.error('Falta SMTP_HOST o EMAIL_FROM en el .env');process.exit(1)} m.enviarCodigoVerificacion({para:'tucorreo@colegiojc.cl',nombre:'Prueba',codigo:'123456',minutos:10,proposito:'Recuperacion'}).then(()=>console.log('OK: enviado'),e=>{console.error('FALLO',e.code||'',e.responseCode||'',e.message);process.exit(1)})"
```

Criterios para dar el correo por bueno:

1. Imprime `OK: enviado`.
2. El mensaje llega a la bandeja de entrada (revisa también spam) con el remitente `SIGAE <noreply@colegiojc.cl>`.
3. Repite con una casilla de **otro dominio** (por ejemplo, un Gmail personal) y confirma que tampoco cae en spam. Los apoderados usarán correos así.
4. Con la app ya en marcha, prueba el flujo real: _¿Olvidó su contraseña?_ con una cuenta propia. Esa prueba es posible cuando exista al menos un usuario (ver el orden del paso 7).

## 6. Diagnóstico si falla

En producción los logs ocultan correos, RUT y textos entre comillas. Busca la línea con:

```bash
pm2 logs sigae-api --err --lines 100 | grep "falló el envío"
```

| Lo que ves | Causa probable | Qué hacer |
| --- | --- | --- |
| `EAUTH`, `535`, _Username and Password not accepted_ | Contraseña normal en lugar de la de aplicación, la de aplicación mal copiada (espacios), o la de aplicación revocada | Crear otra contraseña de aplicación (paso 2) y actualizar `SMTP_PASS` |
| `ETIMEDOUT`, `ECONNECTION`, `ESOCKET` | La EC2 no sale al puerto (grupo de seguridad, ACL de la subred, puerto 25) o `SMTP_HOST`/`SMTP_PORT` mal puestos | Probar `nc -vz smtp.gmail.com 465` desde la EC2; revisar la salida del grupo de seguridad |
| `ESOCKET`, `wrong version number` | `SMTP_SECURE=true` con el puerto 587 (o `SMTP_SECURE` ausente con el 465 y `SMTP_PORT` omitido) | Combinar como indica el paso 3 |
| `EENVELOPE`, `550`, _recipient rejected_ | La casilla de destino no existe (un correo mal escrito o de dominio inexistente) | Corregir el correo del usuario |
| `Greeting never received`, `Connection timeout` | Bloqueo de red o `SMTP_HOST` incorrecto | Igual que `ETIMEDOUT` |
| `OK` en la prueba pero el usuario "no recibe nada" | Spam o falta de SPF/DKIM/DMARC | Paso 4 |
| El usuario ve _"El envío de códigos por correo no está disponible"_ | No ocurre con el backend arrancado en producción (exige las variables) | Revisar que `NODE_ENV=production` y el `.env` estén bien |

## 7. Orden recomendado en el despliegue

1. Cuenta `noreply` con contraseña de aplicación (paso 2) y SPF/DKIM/DMARC en el DNS (paso 4).
2. `.env` completo (paso 3).
3. **Probar el correo desde la EC2** (paso 5), a una casilla del colegio y a una externa.
4. Recién entonces, crear al primer super administrador con `scripts/crearSuperAdmin.js`, con una casilla real que puedas abrir.
5. Entrar con esa cuenta: debe llegar el código de activación. Si no llega, ver el paso 6.

## 8. Plan B: si el correo se rompe y nadie puede entrar

Como **último recurso** y solo con acceso al servidor: marcar la cuenta como verificada directamente en la base, y así el login no pide código. Con una cuenta concreta:

```sql
UPDATE usuario SET Usuario_Correo_Verificado = 1 WHERE Usuario_RUT = '12345678-9';
```

Hay que arreglar el SMTP después. Mientras tanto, la recuperación de contraseña de todos los usuarios tampoco funciona. Usarlo no es una forma de "saltarse" la verificación del colegio: es solo para recuperar el acceso del super administrador que va a corregir el correo.

## 9. Pendientes conocidos

- **Decisión del PO:** en una base **con datos** (no es el caso hoy), si se marca el correo de los usuarios existentes como verificado o se les exige el código. Ver `docs/correos-institucionales-y-codigos.txt`, sección 3. En una base nueva, nadie parte verificado.
- No hay respuesta automática de bienvenida ni alertas si el SMTP cae: se nota porque los usuarios reportan el 503. Conviene revisar `pm2 logs` después de cada cambio de `.env`.
