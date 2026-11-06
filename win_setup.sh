#!/bin/bash
# Setup de SIGAE para Windows. Córrelo desde Git Bash (NO desde PowerShell ni CMD),
# en la raíz del repo:
#
#   bash win_setup.sh
#
# Requisitos (instálalos antes, una sola vez):
#   - Git para Windows (trae Git Bash)  https://git-scm.com/download/win
#   - Node.js LTS                         https://nodejs.org
#   - MySQL Server 8 o MariaDB, corriendo como servicio de Windows
#
# Qué hace: crea la base y el usuario `sigae`, importa webSIGAE/Database/SIGAE.sql,
# instala las dependencias de backend y frontend, escribe webSIGAE/BackEnd/.env y
# hashea las contraseñas de prueba. Se puede correr las veces que quieras.
#
# Te pedirá la contraseña de root de MySQL. Para no escribirla:
#   DB_ROOT_PASSWORD=tu_clave bash win_setup.sh
# Seguro: este script es SOLO para desarrollo (importa SIGAE.sql, que trae
# DROP TABLE, contraseñas en texto plano y datos de prueba). El servidor de
# producción se marca con el archivo /etc/sigae-production.
if [ -e /etc/sigae-production ]; then
  echo "❌ Este equipo está marcado como PRODUCCIÓN (/etc/sigae-production)." >&2
  echo "   win_setup.sh es solo para desarrollo y nunca debe correr contra la RDS. No se ejecutó nada." >&2
  exit 1
fi

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

fallar() { echo "" >&2; echo "❌ $*" >&2; exit 1; }
aviso()  { echo "⚠️  $*" >&2; }

echo "=== Verificando entorno ==="
case "$(uname -s)" in
  MINGW*|MSYS*) ;;
  *) fallar "Este script es para Git Bash en Windows. En Linux, macOS o Codespaces usa: bash .devcontainer/setup.sh" ;;
esac

command -v node >/dev/null 2>&1 || fallar "Node.js no está instalado o no está en el PATH. Instálalo desde https://nodejs.org, cierra y vuelve a abrir VS Code."
command -v npm  >/dev/null 2>&1 || fallar "npm no está en el PATH. Reinstala Node.js."
echo "Node $(node -v)"

# Busca el cliente de MySQL/MariaDB: primero en el PATH, después en las
# carpetas de instalación habituales (los instaladores no siempre lo agregan al PATH).
buscar_cliente() {
  local c
  for c in mysql mariadb; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return; fi
  done
  for c in "/c/Program Files/MySQL/MySQL Server "*/bin/mysql.exe \
           "/c/Program Files/MariaDB "*/bin/mariadb.exe \
           "/c/Program Files/MariaDB "*/bin/mysql.exe \
           "/c/xampp/mysql/bin/mysql.exe"; do
    if [ -x "$c" ]; then echo "$c"; return; fi
  done
}
SQL="$(buscar_cliente)"
[ -n "$SQL" ] || fallar "No encontré MySQL ni MariaDB. Instala MySQL Server 8 (https://dev.mysql.com/downloads/installer/) y vuelve a correr este script."
echo "Cliente SQL: $SQL"

if [ -z "${DB_ROOT_PASSWORD:-}" ]; then
  read -rsp "Contraseña de root de MySQL (la que pusiste al instalarlo): " DB_ROOT_PASSWORD
  echo ""
fi

# Pasamos la contraseña con un archivo de opciones temporal: así el cliente no
# la pide de forma interactiva (en Git Bash eso se queda pegado) y no queda a la
# vista en la línea de comandos.
CNF="$(mktemp)"
trap 'rm -f "$CNF"' EXIT
printf '[client]\nuser=root\npassword="%s"\ndefault-character-set=utf8mb4\n' "${DB_ROOT_PASSWORD//\\/\\\\}" > "$CNF"
CNF_WIN="$(cygpath -w "$CNF")"

sql_root() { "$SQL" --defaults-extra-file="$CNF_WIN" "$@"; }

echo "=== Conectando a MySQL ==="
if ! ERROR="$(sql_root -e "SELECT 1" 2>&1 >/dev/null)"; then
  echo "$ERROR" >&2
  case "$ERROR" in
    *"Access denied"*) fallar "Contraseña de root incorrecta." ;;
    *"Can't connect"*|*"2003"*) fallar "MySQL no está corriendo. Ábrelo desde Servicios de Windows (services.msc → MySQL80 → Iniciar) y vuelve a intentar." ;;
    *) fallar "No se pudo conectar a MySQL." ;;
  esac
fi
echo "✅ Conectado"

echo "=== Configurando usuario BD ==="
sql_root -e "
  CREATE DATABASE IF NOT EXISTS sigae;
  CREATE USER IF NOT EXISTS 'sigae'@'127.0.0.1' IDENTIFIED BY 'sigae123';
  CREATE USER IF NOT EXISTS 'sigae'@'localhost' IDENTIFIED BY 'sigae123';
  ALTER USER 'sigae'@'127.0.0.1' IDENTIFIED BY 'sigae123';
  ALTER USER 'sigae'@'localhost' IDENTIFIED BY 'sigae123';
  GRANT ALL PRIVILEGES ON sigae.* TO 'sigae'@'127.0.0.1';
  GRANT ALL PRIVILEGES ON sigae.* TO 'sigae'@'localhost';
  FLUSH PRIVILEGES;
"

echo "=== Importando base de datos ==="
SQL_FILE="$ROOT/webSIGAE/Database/SIGAE.sql"
[ -f "$SQL_FILE" ] || fallar "No se encontró $SQL_FILE"
sql_root < "$SQL_FILE"
echo "✅ SQL importado"

echo "=== Instalando dependencias Backend (puede tardar: Puppeteer descarga Chrome) ==="
(cd "$ROOT/webSIGAE/BackEnd" && npm install)

echo "=== Instalando dependencias Frontend ==="
(cd "$ROOT/webSIGAE/FrontEnd" && npm install)

echo "=== Creando .env (desde .env.example) ==="
ENV_FILE="$ROOT/webSIGAE/BackEnd/.env"
ENV_EJEMPLO="$ROOT/webSIGAE/BackEnd/.env.example"
[ -f "$ENV_EJEMPLO" ] || fallar "No se encontró $ENV_EJEMPLO"
ENV_NUEVO="$(tr -d '\r' < "$ENV_EJEMPLO")"
if [ -f "$ENV_FILE" ] && [ "$(tr -d '\r' < "$ENV_FILE")" != "$ENV_NUEVO" ]; then
  cp "$ENV_FILE" "$ENV_FILE.bak"
  echo "Tu .env anterior quedó respaldado en webSIGAE/BackEnd/.env.bak"
fi
printf '%s\n' "$ENV_NUEVO" > "$ENV_FILE"

echo "=== Hasheando contraseñas ==="
node "$ROOT/webSIGAE/BackEnd/hashPasswords.js"

echo ""
echo "✅ Setup completado. Ya puedes presionar F5 en VS Code."
