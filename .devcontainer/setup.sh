#!/bin/bash
# Setup de SIGAE para GitHub Codespaces, Linux y macOS.
# En Windows usa win_setup.sh (desde Git Bash).
#
# Uso: bash .devcontainer/setup.sh
#
# Instala MariaDB si no está, crea la base y el usuario `sigae`, importa
# webSIGAE/Database/SIGAE.sql, instala las dependencias de backend y frontend,
# escribe webSIGAE/BackEnd/.env y hashea las contraseñas de prueba.
#
# Si tu usuario root de MariaDB/MySQL tiene contraseña, pásala así:
#   DB_ROOT_PASSWORD=tu_clave bash .devcontainer/setup.sh
# Seguro: este script es SOLO para desarrollo (importa SIGAE.sql, que trae
# DROP TABLE, contraseñas en texto plano y datos de prueba). El servidor de
# producción se marca con el archivo /etc/sigae-production.
if [ -e /etc/sigae-production ]; then
  echo "❌ Este equipo está marcado como PRODUCCIÓN (/etc/sigae-production)." >&2
  echo "   setup.sh es solo para desarrollo y nunca debe correr contra la RDS. No se ejecutó nada." >&2
  exit 1
fi

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fallar() { echo "❌ $*" >&2; exit 1; }
aviso()  { echo "⚠️  $*" >&2; }

# Ejecuta un comando como root (directo si ya lo somos, si no con sudo).
como_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else fallar "Se necesita sudo para: $*"
  fi
}

# Detecta el gestor de paquetes del sistema.
if command -v apt-get >/dev/null 2>&1; then PKG=apt
elif command -v dnf >/dev/null 2>&1; then PKG=dnf
elif command -v brew >/dev/null 2>&1; then PKG=brew
else PKG=""
fi

cliente_sql() {
  if command -v mariadb >/dev/null 2>&1; then echo mariadb
  elif command -v mysql >/dev/null 2>&1; then echo mysql
  fi
}

echo "=== Verificando Node.js ==="
command -v node >/dev/null 2>&1 || fallar "Node.js no está instalado (https://nodejs.org)."
command -v npm  >/dev/null 2>&1 || fallar "npm no está instalado."
echo "Node $(node -v)"

echo "=== Instalando MariaDB ==="
if [ -n "$(cliente_sql)" ]; then
  echo "Ya instalado ($(cliente_sql)), se omite."
else
  case "$PKG" in
    apt)  como_root apt-get update -q
          como_root apt-get install -y -q mariadb-server ;;
    dnf)  como_root dnf install -y -q mariadb-server ;;
    brew) brew install mariadb ;;
    *)    fallar "No reconozco el gestor de paquetes. Instala MariaDB a mano y vuelve a correr este script." ;;
  esac
fi
SQL="$(cliente_sql)"
[ -n "$SQL" ] || fallar "No se encontró el cliente mariadb/mysql después de instalar."

# Corre el cliente SQL como administrador: con DB_ROOT_PASSWORD si se dio,
# si no como root del sistema (autenticación unix_socket, la de MariaDB por defecto).
sql_root() {
  if [ -n "${DB_ROOT_PASSWORD:-}" ]; then
    MYSQL_PWD="$DB_ROOT_PASSWORD" "$SQL" -u root "$@"
  else
    como_root "$SQL" -u root "$@"
  fi
}

echo "=== Iniciando MariaDB ==="
if sql_root -e "SELECT 1" >/dev/null 2>&1; then
  echo "Ya está corriendo."
else
  if [ "$PKG" = brew ]; then
    brew services start mariadb
  elif [ -d /run/systemd/system ]; then
    como_root systemctl start mariadb || como_root systemctl start mysql
  else
    # Codespaces y contenedores sin systemd
    como_root service mariadb start || como_root service mysql start
  fi
  for _ in $(seq 1 15); do
    sql_root -e "SELECT 1" >/dev/null 2>&1 && break
    sleep 1
  done
  sql_root -e "SELECT 1" >/dev/null 2>&1 \
    || fallar "No se pudo conectar a MariaDB como root. Si root tiene contraseña, usa DB_ROOT_PASSWORD=... (ver arriba)."
fi

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
sql_root --default-character-set=utf8mb4 < "$SQL_FILE"
echo "✅ SQL importado"

# Puppeteer (exportación a PDF) descarga su propio Chrome, pero en Linux
# necesita las librerías de sistema que trae el paquete chromium.
if [ "$(uname -s)" = Linux ]; then
  echo "=== Instalando Chromium (dependencias de sistema para Puppeteer) ==="
  case "$PKG" in
    apt) como_root apt-get install -y -q chromium || aviso "No se pudo instalar chromium; la exportación a PDF podría fallar." ;;
    dnf) como_root dnf install -y -q chromium     || aviso "No se pudo instalar chromium; la exportación a PDF podría fallar." ;;
    *)   aviso "Instala Chromium a mano si la exportación a PDF falla." ;;
  esac
fi

echo "=== Instalando dependencias Backend ==="
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
echo "✅ Setup completado. Ya puedes presionar F5."
