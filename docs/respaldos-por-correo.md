# Respaldos por correo a la cuenta de respaldos

La cuenta de Google del colegio para respaldos es **`respaldosigae@colegiojc.cl`**
(`config/institucion.js`). SIGAE le envía los respaldos **por correo**, desde la
cuenta no-reply que ya usa para los códigos (`utils/mailer.js`). Así no hacen falta
credenciales de Google en el servidor: basta con el SMTP que ya está configurado.

| Respaldo | Cuándo | Adjuntos |
|---|---|---|
| **Base de datos completa** (`scripts/enviarRespaldo.js`) | Todos los días (cron / timer) | `sigae_AAAAMMDD_HHMM.sql.gz` + `..._LEEME.txt` |
| **Cierre de período** (Excel) | Cuando el Super Admin lo descarga en *Cierre de Período* | `respaldo_cambio_periodo_AAAA.xlsx` |

Cada correo trae en el cuerpo la **fecha y hora (de Chile)**, el servidor, el tamaño,
el número de tablas, el **SHA-256** del archivo y **cómo cargarlo en caso de
contingencia**. El LEEME repite esas instrucciones para que queden junto al archivo
si se guarda en Drive. Todos los correos automáticos terminan con
*«Este correo fue enviado automáticamente por SIGAE. No respondas a este mensaje.
Nadie revisa esta cuenta.»*

Código: `utils/respaldo.js` (volcado, detalle e instrucciones), `scripts/enviarRespaldo.js`
(respaldo diario), `controllers/periodoController.js` (copia del Excel del cierre).
Pruebas: `tests/respaldoCorreo.test.js`.

---

## 1. Puesta en marcha en el servidor (EC2)

### 1.1 Cliente de MariaDB

```bash
sudo apt install -y mariadb-client
```

Trae `mariadb-dump`, que el script usa para el volcado (si no está, usa `mysqldump`).

### 1.2 Usuario de solo lectura para los respaldos (recomendado)

El usuario de la aplicación (`sigae_app`) puede escribir; para respaldar basta uno que
solo lea. En la RDS, con el usuario administrador:

```sql
CREATE USER 'sigae_respaldo'@'%' IDENTIFIED BY '<contraseña larga y aleatoria>';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES ON sigae.* TO 'sigae_respaldo'@'%';
```

(El grupo de seguridad de la RDS ya limita el acceso a la EC2.)

### 1.3 Variables del `.env` del backend

Las de la base (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SSL`) y las de SMTP ya están.
Se agregan:

```dotenv
RESPALDO_DB_USER=sigae_respaldo
RESPALDO_DB_PASSWORD=<la contraseña del paso 1.2>
# Opcionales:
# RESPALDO_CORREO=respaldosigae@colegiojc.cl   (destino; este es el valor por defecto)
# RESPALDO_DIR=/var/sigae/respaldos            (carpeta temporal del archivo)
# RESPALDO_MAX_MB=18                           (máximo del adjunto)
# RESPALDO_SSL_CA=/etc/ssl/rds-global-bundle.pem (CA de la RDS si DB_SSL=true)
```

### 1.4 Probarlo una vez

```bash
cd /ruta/webSIGAE/BackEnd && node scripts/enviarRespaldo.js
```

Debe terminar con `Enviado a respaldosigae@colegiojc.cl` y el correo debe llegar a la
cuenta de respaldos. Por defecto **no deja copia en el servidor** (tiene datos
personales); con `--conservar` la deja en `RESPALDO_DIR`. Con `--sin-correo` solo
genera el archivo.

| Código de salida | Significado |
|---|---|
| 0 | Enviado (o generado con `--sin-correo`) |
| 1 | Error (volcado o envío); si el volcado salió bien, el archivo queda en el servidor |
| 2 | El archivo supera `RESPALDO_MAX_MB`: no se envió y queda en el servidor |

### 1.5 Programarlo todos los días

**Opción A — timer de systemd (recomendada: entiende la hora de Chile).**
`/etc/systemd/system/sigae-respaldo.service`:

```ini
[Unit]
Description=Respaldo diario de SIGAE por correo

[Service]
Type=oneshot
User=<usuario-pm2>
WorkingDirectory=/ruta/webSIGAE/BackEnd
ExecStart=/usr/bin/node scripts/enviarRespaldo.js
```

`/etc/systemd/system/sigae-respaldo.timer`:

```ini
[Unit]
Description=Respaldo diario de SIGAE a las 03:17 (hora de Chile)

[Timer]
OnCalendar=*-*-* 03:17:00 America/Santiago
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now sigae-respaldo.timer
systemctl list-timers sigae-respaldo.timer     # próxima ejecución
journalctl -u sigae-respaldo.service           # registro de cada ejecución
```

**Opción B — cron del usuario de pm2** (`crontab -e`). La EC2 está en UTC, así que
06:17 UTC son las 03:17 en verano de Chile (04:17 en invierno; da igual a esa hora):

```cron
17 6 * * * cd /ruta/webSIGAE/BackEnd && /usr/bin/node scripts/enviarRespaldo.js >> /var/log/sigae-respaldo.log 2>&1
```

---

## 2. En la cuenta `respaldosigae@colegiojc.cl`

### 2.1 Filtro de Gmail (para que no llenen la bandeja)

Gmail › Configuración › Filtros › Crear filtro:

- **De:** `noreply@colegiojc.cl` · **Asunto:** `Respaldo SIGAE`
- Acciones: *Omitir Recibidos (archivar)*, *Aplicar la etiqueta* `Respaldos SIGAE`,
  *Nunca enviar a Spam*.

Con esto los respaldos ya quedan guardados en el almacenamiento de la cuenta
(Gmail y Drive comparten la cuota). Un respaldo comprimido de la base pesa hoy unos
pocos KB/MB.

### 2.2 Copiar los adjuntos a Google Drive (opcional)

Si se prefiere tenerlos como archivos en Drive (más fáciles de buscar y descargar),
un Apps Script de la misma cuenta los copia cada hora a la carpeta
`Respaldos SIGAE` y borra los de más de 90 días. En https://script.google.com, con la
sesión de `respaldosigae@colegiojc.cl`, crear un proyecto con:

```javascript
const ETIQUETA = 'Respaldos SIGAE';
const ETIQUETA_GUARDADO = 'Respaldos SIGAE/Guardado';
const CARPETA = 'Respaldos SIGAE';
const DIAS_CONSERVAR = 90;

function guardarRespaldos() {
  const carpeta = obtenerCarpeta_();
  const guardado = GmailApp.getUserLabelByName(ETIQUETA_GUARDADO) || GmailApp.createLabel(ETIQUETA_GUARDADO);
  const hilos = GmailApp.search(
    'from:noreply@colegiojc.cl subject:"Respaldo SIGAE" has:attachment -label:"' + ETIQUETA_GUARDADO + '"');
  hilos.forEach((hilo) => {
    hilo.getMessages().forEach((msg) => {
      msg.getAttachments().forEach((adjunto) => carpeta.createFile(adjunto.copyBlob()));
    });
    hilo.addLabel(guardado);
  });
  // Conserva DIAS_CONSERVAR días en Drive (los correos se mantienen en Gmail)
  const limite = Date.now() - DIAS_CONSERVAR * 24 * 3600 * 1000;
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    if (archivo.getDateCreated().getTime() < limite) archivo.setTrashed(true);
  }
}

function obtenerCarpeta_() {
  const existentes = DriveApp.getFoldersByName(CARPETA);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CARPETA);
}
```

Ejecutar `guardarRespaldos` una vez a mano (pide autorizar Gmail y Drive) y luego, en
*Activadores*, agregar uno **basado en tiempo, cada hora**. Si el administrador de
Google Workspace del colegio bloquea Apps Script, basta con el filtro del punto 2.1.

### 2.3 Seguridad de la cuenta

- Los respaldos tienen **datos personales de menores**: la cuenta debe tener
  verificación en 2 pasos y solo deben conocer su contraseña quienes administran SIGAE.
- El correo viaja cifrado (SMTP con TLS) y entre cuentas del mismo dominio de Google.
- No reenviar los respaldos ni descargarlos en equipos personales.

---

## 3. Cargar un respaldo en caso de contingencia

Cada correo y su LEEME traen los pasos con el nombre exacto del archivo. En resumen:

1. Descargar el adjunto `sigae_AAAAMMDD_HHMM.sql.gz` en el servidor.
2. Comprobar el SHA-256 (`sha256sum archivo`) contra el del correo.
3. Sacar un snapshot de la RDS si la base actual todavía existe (la carga **reemplaza**
   las tablas).
4. `pm2 stop sigae-api`
5. `gunzip -c archivo.sql.gz | mariadb --default-character-set=utf8mb4 -h <endpoint> -u <admin> -p`
   (el volcado trae `CREATE DATABASE` y `USE sigae`, igual que `schema_base.sql`).
6. `pm2 start sigae-api` y probar un inicio de sesión.

Las fotografías de perfil (`/var/sigae/uploads`) no van en este respaldo.

El **Excel del cierre de período** no se carga de forma automática: es el registro de
lo que se eliminó. Si un estudiante o curso se eliminó por error (o un estudiante se
reincorpora), sus datos se buscan en el Excel y se vuelven a registrar en SIGAE.

---

## 4. Límites y alternativas

- **Tamaño:** Gmail acepta mensajes de hasta 25 MB y el adjunto crece ~33 % al
  codificarse; por eso el máximo es 18 MB (`RESPALDO_MAX_MB`). Comprimida, la base
  está muy lejos de ese límite. Si algún día lo supera, el script avisa (código 2) y
  conviene pasar a subir el archivo directo a Drive (API de Drive con una cuenta de
  servicio o `rclone`), que requiere credenciales de Google en el servidor.
- **Snapshots de la RDS:** siguen siendo el respaldo principal para restaurar el
  servidor completo; el correo es una copia fuera de AWS, en la cuenta del colegio.
