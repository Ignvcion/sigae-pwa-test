// SOLO DESARROLLO: hashea las contraseñas en texto plano que trae SIGAE.sql y deja a los
// usuarios de prueba con el correo ya verificado, para que entren sin código de verificación
// (en desarrollo no hay SMTP). En producción nada de esto aplica: el primer ingreso de cada
// cuenta confirma su correo con un código (docs/mailer-smtp-produccion.md).
// No se usa en producción (el primer administrador real se crea con un script
// puntual); en un servidor marcado con /etc/sigae-production se niega a correr.
const fs = require('fs');
if (fs.existsSync('/etc/sigae-production')) {
  console.error('❌ Este equipo está marcado como PRODUCCIÓN (/etc/sigae-production). hashPasswords.js es solo para desarrollo.');
  process.exit(1);
}

const path = require('path');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [users] = await conn.execute('SELECT Usuario_Id, Usuario_Contraseña FROM usuario');
  console.log(`Encontrados ${users.length} usuarios.`);

  for (const u of users) {
    if (u['Usuario_Contraseña'].startsWith('$2b$')) {
      console.log(`Usuario ${u.Usuario_Id} ya hasheado, se omite.`);
      continue;
    }
    const hash = await bcrypt.hash(u['Usuario_Contraseña'], 10);
    await conn.execute('UPDATE usuario SET Usuario_Contraseña = ? WHERE Usuario_Id = ?', [hash, u.Usuario_Id]);
    console.log(`✅ Usuario ${u.Usuario_Id} hasheado.`);
  }

  // Usuarios de prueba: sin verificación de correo por código (SIGAE.sql ya los trae verificados;
  // esto cubre a los que se agreguen al dump con 0).
  const [verificados] = await conn.execute('UPDATE usuario SET Usuario_Correo_Verificado = 1 WHERE Usuario_Correo_Verificado = 0');
  console.log(`Correo verificado en ${verificados.affectedRows} usuario(s) de prueba.`);

  await conn.end();
  console.log('Listo!');
})();