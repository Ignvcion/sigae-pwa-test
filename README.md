# SIGAE — Sistema de Gestión Académica y Escolar

> 🚦 En **marcha blanca**: corre en producción con datos reales de un grupo acotado de cursos. Antes de desplegar, lee [Deploy](#-deploy).

## ¿Qué es SIGAE?

SIGAE es una plataforma web para la gestión académica y escolar, con módulos para administración, docentes y apoderados. Permite gestionar cursos, asignaturas, citaciones, horarios y comunicaciones internas.

## Stack tecnológico

| Capa                  | Tecnología        |
| --------------------- | ----------------- |
| Frontend              | Vite + React      |
| Backend               | Node.js + Express |
| Base de datos         | MariaDB / MySQL   |
| Entorno de desarrollo | GitHub Codespaces |

---

## 🚀 Primeros pasos

Hay un script de setup por sistema. Ambos hacen lo mismo: crean la base de datos y el usuario `sigae`, importan `SIGAE.sql`, instalan las dependencias del backend y del frontend, crean `webSIGAE/BackEnd/.env` a partir de `.env.example` y hashean las contraseñas de prueba. Se pueden correr cuantas veces quieras; también sirven para **dejar todo al día** cuando algo deja de funcionar.

| Dónde trabajas | Script |
| --- | --- |
| GitHub Codespaces, Linux o macOS | `bash .devcontainer/setup.sh` |
| Windows | `bash win_setup.sh` (desde **Git Bash**) |

### 🐧 GitHub Codespaces / Linux / macOS

En un codespace, `setup.sh` se ejecuta **solo** al abrirlo por primera vez.

> **El proceso tarda entre 2 y 5 minutos.** Si presionas F5 antes de que termine, el proyecto no arrancará correctamente.

Si no esperaste lo suficiente, hubo un error o estás en tu propio Linux/macOS, córrelo a mano desde la raíz del repo:

```bash
bash .devcontainer/setup.sh
```

Si MariaDB no está instalado, el script lo instala (con `apt`, `dnf` o `brew`). Si tu usuario root de MariaDB/MySQL tiene contraseña: `DB_ROOT_PASSWORD=tu_clave bash .devcontainer/setup.sh`.

### 🪟 Windows

**1. Instala esto una sola vez** (si ya lo tienes, sáltatelo):

- [Git para Windows](https://git-scm.com/download/win) (trae **Git Bash**).
- [Node.js LTS](https://nodejs.org).
- [MySQL Server 8](https://dev.mysql.com/downloads/installer/). Anota la contraseña de root que eliges al instalarlo.

Después de instalar, **cierra y vuelve a abrir VS Code**.

**2. Abre una terminal de Git Bash en VS Code** (`` Ctrl+` ``). El repo ya configura Git Bash como terminal por defecto en Windows. Si igual se abre PowerShell, haz clic en la flecha **˅** al lado del **+** y elige **Git Bash**.

> 🚫 **No uses PowerShell ni CMD** para correr los scripts: no son Bash y fallan.

**3. Corre el setup desde la raíz del repo** y escribe la contraseña de root de MySQL cuando te la pida:

```bash
bash win_setup.sh
```

Si algo falla, el script dice qué pasó (contraseña incorrecta, MySQL apagado, no encontró MySQL, etc.).

### ▶️ Iniciar el proyecto

Presiona **F5** o ve al bicho triángulo _Run › Start Debugging_ (`Run All`). Esto levanta el backend y el frontend al mismo tiempo.

| Servicio    | URL                   |
| ----------- | --------------------- |
| Backend API | http://localhost:3000 |
| Frontend    | http://localhost:5173 |

---

## 👤 Usuarios de prueba

> El login se realiza con **RUT** (sin puntos, con guión). Las contraseñas están en texto plano en el dump — recuerda correr el script de hasheo después de importar.

| RUT       | Contraseña     | Nombre             | Rol                 |
| --------- | -------------- | ------------------ | ------------------- |
| 5682711-0 | \`1234\`       | Esperanza Gonzales | Super Admin         |
| 9343727-6 | \`ilovemilf\`  | Carlos Gonzales    | Administrador       |
| 3483606-k | \`Gato123\`    | María Morales      | Docente             |
| 5738925-7 | \`4532\`       | Pedro Fernandez    | Apoderado           |
| 3890710-7 | \`Hamster#23\` | Ana Torres         | Docente             |
| 7135657-4 | \`Cotorra-15\` | Roberto Silva      | Docente             |
| 2258000-0 | \`Perrito@7\`  | Carmen Díaz        | Docente             |
| 8636451-4 | \`Conejo#42\`  | Luis Ramos         | Apoderado           |
| 9230041-2 | \`Tortuga-99\` | Sandra Vera        | Apoderado           |
| 5158743-k | \`Pinguino@5\` | Jorge Campos       | Docente y Apoderado |

---

## 📁 Estructura del proyecto

```
web-dev-SIGAE/
├── .devcontainer/
│   └── setup.sh       # Setup para Codespaces / Linux / macOS
├── win_setup.sh       # Setup para Windows (correr desde Git Bash)
├── docs/              # Documentación del proyecto (ver abajo)
└── webSIGAE/
    ├── BackEnd/       # API Node.js + Express
    ├── FrontEnd/      # App Vite + React
    └── Database/      # SIGAE.sql (desarrollo); schema_base.sql y catalogos_base.sql (producción)
```

### 📚 Documentación

Toda la documentación, salvo este README, está en `docs/`. No agregues archivos `.md` dentro de `webSIGAE/`.

| Archivo | Para qué sirve |
| --- | --- |
| [`docs/api-citaciones.md`](docs/api-citaciones.md) | Contrato entre frontend y backend del módulo de citaciones (CU74–CU79): endpoints, formato de respuestas y permisos. |
| [`docs/navegacion-sidebar.md`](docs/navegacion-sidebar.md) | Cómo funciona el sidebar (`MainLayout.jsx`), reglas para agregar enlaces y pendientes conocidos. |
| [`docs/tabla-historial.md`](docs/tabla-historial.md) | Estado de la tabla de auditoría `historial` y cómo se escriben sus valores. |
| [`docs/mailer-smtp-produccion.md`](docs/mailer-smtp-produccion.md) | Cómo dejar funcionando el envío de códigos por correo en producción (Google Workspace, SPF/DKIM/DMARC, prueba desde la EC2 y diagnóstico de errores). |
| [`docs/decisiones-rf60-rf61-periodos.txt`](docs/decisiones-rf60-rf61-periodos.txt) | Acuerdos del Incremento 4 que van más allá del mockup: profesor jefe, situación final, promoción, períodos lectivos y limpieza de datos. |

---

## 🔧 Variables de entorno

El backend lee su configuración de `webSIGAE/BackEnd/.env`. Ese archivo **no se sube a git**: cada uno tiene el suyo. Lo que sí está en el repo es la plantilla, `webSIGAE/BackEnd/.env.example`.

- **No tienes que crearlo a mano:** los scripts de setup copian `.env.example` a `.env`. Si ya tenías un `.env` distinto, lo guardan en `.env.bak` antes de reemplazarlo.
- **No hace falta editarlo**, tampoco en Windows: el setup crea en tu base de datos el usuario `sigae` que usa la plantilla.
- **Si agregas una variable nueva** al backend, agrégala también en `.env.example` con un valor de ejemplo, para que le llegue al resto del equipo. Nunca pongas claves reales en la plantilla.

- **En producción** el `.env` se escribe a mano en el servidor con valores reales (ver [Deploy](#-deploy)). Con `NODE_ENV=production` el backend **no arranca** si falta una variable obligatoria: la plantilla marca cuáles son.

Si necesitas crearlo sin correr el setup, copia la plantilla:

```bash
cp webSIGAE/BackEnd/.env.example webSIGAE/BackEnd/.env
```

---

## 🗄️ Base de datos

> 📌 **En desarrollo se usa un solo archivo: `webSIGAE/Database/SIGAE.sql`.** Trae el esquema más reciente **y** los usuarios de prueba.
>
> 🛑 **`SIGAE.sql`, `setup.sh`, `win_setup.sh` y `hashPasswords.js` nunca se ejecutan contra la base de producción (RDS).** `SIGAE.sql` hace `DROP TABLE` de todas las tablas y carga usuarios de prueba con contraseñas en texto plano: correrlo allí **borra los datos reales**. Producción usa `webSIGAE/Database/schema_base.sql` (solo estructura, sin datos) y solo una vez, al crear la base. `setup.sh`, `win_setup.sh` y `hashPasswords.js` se niegan a correr en un equipo con el archivo `/etc/sigae-production`.

Importar `SIGAE.sql` borra y vuelve a crear todas las tablas de `sigae` (crea la base si no existe). Por eso sirve tanto para instalar desde cero como para **ponerse al día**: si tu base es antigua (por ejemplo, te falta una columna o el backend tira `Unknown column ...`), basta con volver a importarlo.

**¿Cuándo reimportar?** Cada vez que hagas `git pull` y `SIGAE.sql` haya cambiado. Si tienes dudas, reimpórtalo: no pierdes nada del proyecto.

> ⚠️ Lo único que se pierde son los datos que hayas agregado **a mano** en tu base local (usuarios, estudiantes, horarios de prueba, etc.).

### Cómo reimportar

**La forma fácil:** vuelve a correr el setup de tu sistema (`bash .devcontainer/setup.sh` o, en Windows, `bash win_setup.sh` desde Git Bash). Reimporta la base y hashea las contraseñas.

**A mano**, si solo quieres la base de datos. Después de importar, **siempre** corre el script de hasheo: el dump trae las contraseñas en texto plano y el login no funciona hasta hashearlas.

Codespaces / Linux / macOS:

```bash
sudo mariadb -u root < webSIGAE/Database/SIGAE.sql
node webSIGAE/BackEnd/hashPasswords.js
```

Windows, **desde Git Bash** (PowerShell no entiende el `<` y falla con _"El operador '<' está reservado para uso futuro"_):

```bash
mysql -u root -p"TU_CONTRASEÑA_DE_ROOT" < webSIGAE/Database/SIGAE.sql
node webSIGAE/BackEnd/hashPasswords.js
```

- Va **sin espacio** entre `-p` y la contraseña. Si la escribes aparte (solo `-p`), Git Bash a veces se queda pegado sin pedirla.
- Si sale `mysql: command not found`, usa la ruta completa, por ejemplo:
  `"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root -p"TU_CONTRASEÑA_DE_ROOT" < webSIGAE/Database/SIGAE.sql`
- `hashPasswords.js` usa el usuario `sigae` del `.env`, que crea `win_setup.sh`. Si nunca lo corriste, córrelo primero.

<details>
<summary>¿No tienes Git Bash? Otras opciones en Windows</summary>

- **CMD (Símbolo del sistema)**: el mismo comando `mysql ... < webSIGAE\Database\SIGAE.sql` funciona tal cual.
- **PowerShell**: usa `source` en vez de `<`:
  ```powershell
  mysql -u root -p -e "source webSIGAE/Database/SIGAE.sql"
  ```
  No uses `Get-Content SIGAE.sql | mysql ...`: rompe las tildes y las ñ.
- **MySQL Workbench**: _File › Open SQL Script…_ → `SIGAE.sql` → ejecutar (⚡).

En todos los casos, después corre `node webSIGAE/BackEnd/hashPasswords.js`.

</details>

### Respaldar tus datos locales (opcional)

Si quieres conservar los datos que agregaste a mano, respáldalos **antes** de reimportar (en Windows, desde Git Bash con `mysqldump` en vez de `sudo mariadb-dump`):

```bash
sudo mariadb-dump -u root sigae > ~/respaldo_sigae.sql
```

Para restaurarlo, impórtalo igual que `SIGAE.sql` pero con `~/respaldo_sigae.sql` (ya trae las contraseñas hasheadas, no hace falta el script de hasheo). Ojo: si el esquema cambió entre medio, el respaldo trae el esquema **viejo**.

### Para quien modifique el esquema

Cualquier cambio de tablas o columnas se hace **en `SIGAE.sql`** (manteniendo los usuarios de prueba). Después, **en el mismo commit**:

1. Regenera `schema_base.sql` desde la raíz del repo (es el mismo `sed` con el que se creó: quita `INSERT`, `LOCK/UNLOCK TABLES`, `DROP TABLE`, `ALTER TABLE ... KEYS`, la cabecera de encriptación y los `AUTO_INCREMENT` de prueba, y conserva la cabecera de 7 líneas del archivo):

   ```bash
   { sed -n '1,7p' webSIGAE/Database/schema_base.sql; sed -E -e 's/\r$//' -e '/^INSERT INTO /d' -e '/^LOCK TABLES /d' -e '/^UNLOCK TABLES;/d' -e '/^DROP TABLE IF EXISTS /d' -e '/^\/\*!40000 ALTER TABLE `[^`]+` (DISABLE|ENABLE) KEYS \*\/;$/d' -e '/^-- Dumping data for table /d' -e "s| /\*!80016 DEFAULT ENCRYPTION='N' \*/||" -e 's/ AUTO_INCREMENT=[0-9]+//' webSIGAE/Database/SIGAE.sql; } > webSIGAE/Database/schema_base.sql.nuevo && mv webSIGAE/Database/schema_base.sql.nuevo webSIGAE/Database/schema_base.sql
   ```

2. Verifica que no quedaron datos (debe imprimir `0`) y que el número de tablas coincide:

   ```bash
   grep -ciE 'insert into|drop table' webSIGAE/Database/schema_base.sql
   ```

   ```bash
   grep -c '^CREATE TABLE' webSIGAE/Database/SIGAE.sql webSIGAE/Database/schema_base.sql
   ```

3. **Avisa a quien administra producción.** Desde la marcha blanca la RDS tiene datos reales: `schema_base.sql` sirve para crear una base **nueva**, no para actualizar una existente (falla al encontrar tablas que ya existen, justamente para no pisar datos). Un cambio de esquema en producción se aplica a mano con un `ALTER TABLE` revisado, después de sacar un snapshot de la RDS. La estrategia formal de migraciones se define después del período de servicio técnico.

No agregues archivos de migración aparte mientras tanto.

---

## 📦 Deploy

Producción durante la marcha blanca:

| Pieza | Dónde |
| --- | --- |
| Backend (Node + Express) | EC2 Debian 13 (t3.small), con **pm2** (`webSIGAE/BackEnd/ecosystem.config.js`) |
| Frontend (`dist/` de Vite) | Lo sirve **Nginx** en la misma EC2; se compila en Codespaces |
| Proxy y HTTPS | **Nginx** + certbot: `/` → `dist/`, `/api` y `/uploads` → `127.0.0.1:3000` |
| Base de datos | **Amazon RDS (MariaDB)**, sin acceso público, solo desde la EC2 |
| Fotos de perfil | `/var/sigae/uploads` en la EC2 (fuera del repo) |

> 🛑 En el servidor **nunca** se corren `SIGAE.sql`, `setup.sh`, `win_setup.sh` ni `hashPasswords.js`. Marca el servidor para que se nieguen a correr: `sudo touch /etc/sigae-production`.

### 1. Código en el servidor

El servidor solo recibe el backend y el esquema (sparse-checkout de lista blanca): `webSIGAE/BackEnd/`, `webSIGAE/Database/schema_base.sql` y `webSIGAE/Database/catalogos_base.sql`, **excluyendo** `SIGAE.sql`, `BackEnd/tests/` y `BackEnd/hashPasswords.js`. `BackEnd/scripts/` **sí** va al servidor: de ahí salen `crearSuperAdmin.js` (paso 2) y `backup.sh` (paso 6).

**Node 22 (≥ 22.12)**, la misma versión mayor que el codespace (`node --version`): Puppeteer lo exige. `apt` de Debian 13 trae Node 20, así que instálalo desde NodeSource: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`.

Instala las dependencias sin las de desarrollo y sin el Chromium de Puppeteer (se usa el del sistema, `apt install chromium`):

```bash
cd webSIGAE/BackEnd && PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev
```

### 2. Base de datos (RDS)

- MariaDB de la **misma versión mayor** que la de desarrollo, sin acceso público y con un grupo de seguridad que solo acepte el puerto 3306 desde la EC2.
- Carga el esquema **una sola vez**, con el usuario administrador de la RDS: `mariadb -h <endpoint> -u <admin> -p < webSIGAE/Database/schema_base.sql`.
- Crea un usuario para la app con permisos acotados (la app no necesita DDL):
  `GRANT SELECT, INSERT, UPDATE, DELETE ON sigae.* TO 'sigae_app'@'%';` (restringe el host a la subred de la EC2 si puedes).
- Después del esquema, carga **una vez** los niveles educativos con su orden (sin ellos no funciona la promoción): `mariadb -h <endpoint> -u <admin> -p < webSIGAE/Database/catalogos_base.sql`. Es idempotente (`INSERT IGNORE`).
- Una base **nueva** solo necesita estos dos archivos: los `ALTER TABLE` que traen los documentos de `docs/` son para una RDS que ya tenía datos y **no** se aplican.
- El resto parte vacío: parámetros institucionales y bloques, asignaturas, planes, cursos y horarios se cargan desde la aplicación. Al guardar los parámetros institucionales queda fijado el período vigente (el año actual).
- 🛑 **Antes de crear al primer administrador, deja funcionando y probado el correo** (paso 3 y [`docs/mailer-smtp-produccion.md`](docs/mailer-smtp-produccion.md)): el primer ingreso de **toda** cuenta exige un código enviado por correo, así que con el SMTP roto nadie puede entrar, ni el super administrador.
- El primer administrador real (y los super administradores adicionales) se crean con `node scripts/crearSuperAdmin.js --rut 12345678-9 --nombre "Ana Pérez" --telefono 912345678 --correo an.perez@colegiojc.cl` (dominio `@colegiojc.cl` o `@colegiojacquescousteau.cl`), desde `webSIGAE/BackEnd` y con el `.env` de producción. La contraseña se pide por consola (o se toma de `SUPERADMIN_PASSWORD`) y se guarda con bcrypt. **No** se usa `hashPasswords.js`. En su primer ingreso confirma el correo con un código.

### 3. `.env` de producción

En `webSIGAE/BackEnd/.env`, con `chmod 600` y como dueño el usuario que corre pm2. Usa `.env.example` como lista de variables, pero **ningún valor de desarrollo**. Mínimo:

| Variable | Valor en producción |
| --- | --- |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Endpoint de la RDS, `sigae_app` y su contraseña, `sigae` |
| `DB_SSL` | `true` (TLS verificado con la CA de Amazon RDS) |
| `JWT_SECRET` | 32+ caracteres aleatorios: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `FRONTEND_URL` | `https://tu-dominio` (CORS) |
| `CORS_ORIGINS` | Opcional; por defecto, `FRONTEND_URL` |
| `UPLOADS_DIR` | `/var/sigae/uploads` (créala con permisos para el usuario de pm2) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Bot de códigos de verificación: la cuenta `noreply@colegiojc.cl` (`EMAIL_FROM="SIGAE <noreply@colegiojc.cl>"`). Con Google Workspace: `smtp.gmail.com`, puerto 465, `SMTP_SECURE=true` y una **contraseña de aplicación** de esa cuenta. AWS bloquea el puerto 25 en EC2. Ver `docs/correos-institucionales-y-codigos.txt` |

`NODE_ENV=production` y `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` los fija `ecosystem.config.js`. Si falta algo, el backend no arranca y `pm2 logs sigae-api` dice qué variable falta (nunca muestra valores). En producción los logs tapan RUT, correos y tokens.

### 4. Arrancar con pm2

```bash
cd webSIGAE/BackEnd && pm2 start ecosystem.config.js
```

```bash
pm2 save && pm2 startup
```

El backend escucha solo en `127.0.0.1:3000`; únicamente Nginx llega a él.

### 5. Nginx

- `root` apuntando al `dist/` del frontend, con `try_files $uri /index.html` (rutas de React).
- `location /api/` y `location /uploads/` → `proxy_pass http://127.0.0.1:3000;`, con `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` y `proxy_set_header X-Forwarded-Proto $scheme;`. El backend confía en **un** proxy (`trust proxy 1`): el rate limiter de login usa la IP real y el redireccionamiento a HTTPS usa `X-Forwarded-Proto`.
- `client_max_body_size 6m;` (las fotos de perfil pesan hasta 5 MB).
- HTTPS con certbot; abiertos solo el 80 y el 443 (el 22, cerrado y accesible por Tailscale).

### 6. Respaldos

- La RDS: snapshots automáticos (y uno manual antes de cualquier cambio de esquema).
- **`/var/sigae/uploads` no la cubren los snapshots de la RDS**: respáldala aparte.
- Al cambiar de período (Gestión Académica › Cierre de Período), el super administrador descarga un Excel con todo lo que se va a eliminar (cursos de dos períodos atrás, sus egresados y retirados con su historial, y apoderados sin estudiantes) y lo sube al Google Drive de la cuenta de respaldos **`respaldosigae@colegiojc.cl`**. Tiene datos personales de menores: no se guarda en equipos personales.

### Actualizar el backend

```bash
git pull && cd webSIGAE/BackEnd && PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev && pm2 restart sigae-api
```

Si el `git pull` trae cambios en `SIGAE.sql`/`schema_base.sql`, **no** reimportes nada: sigue el paso 3 de [Para quien modifique el esquema](#para-quien-modifique-el-esquema).
