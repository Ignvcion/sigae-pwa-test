// controllers/usuarioController.js
const db = require('../config/db');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const { UPLOAD_DIR } = require('../middleware/uploadFotoPerfil');
const {
  validarCorreoInstitucional,
  validarTelefonoChileno,
  normalizarTelefono,
  validarNombreCompleto,
  validarCorreo,
  validarDireccion,
  direccionDesdeColumnas,
  columnasDireccion,
  CAMPOS_DIRECCION,
} = require('../middleware/validation');
const {
  normalizarEspecialidades,
  especialidadesDelCuerpo,
  guardarEspecialidadesDocente,
} = require('../utils/especialidades');
const {
  leerDisponibilidad,
  guardarDisponibilidadDocente,
  ErrorDisponibilidad,
} = require('./disponibilidadLaboralController');

/** Ejecuta `fn(conn)` en una transacción y devuelve su resultado. */
async function enTransaccion(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

const MENSAJE_TELEFONO_INVALIDO = 'El número telefónico debe tener 9 dígitos, opcionalmente con prefijo +56';

// Obtener todos los usuarios
const getUsuarios = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM usuario');
    const usuarios = rows.map(({ Usuario_Contraseña, ...resto }) => resto);
    res.json(usuarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener usuarios' });
  }
};

// CU17 y CU18: Obtener un usuario por ID (perfil propio o, si el rol lo autoriza, el de otro usuario)
const getUsuarioById = async (req, res) => {
  const { id } = req.params;
  const solicitante = req.user;

  const esPropioUsuario = String(solicitante.id) === String(id);
  const esAdmin = (solicitante.roles || []).includes('Administrador');
  const esSuperAdmin = solicitante.administradorTipo === 'Super Admin';

  if (!esPropioUsuario && !esAdmin) {
    return res.status(403).json({ mensaje: 'No tienes permiso para ver este perfil' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM usuario WHERE Usuario_Id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    const objetivo = rows[0];

    // CU18 - Excepción "Falta de permisos": un Administrador normal no puede ver el
    // perfil de una cuenta Super Admin, aunque haya llegado hasta acá (p. ej. por un
    // enlace directo o un resultado de búsqueda desactualizado).
    const objetivoEsSuperAdmin = objetivo.Es_Administrador && objetivo.Administrador_Tipo === 'Super Admin';
    if (!esPropioUsuario && objetivoEsSuperAdmin && !esSuperAdmin) {
      return res.status(403).json({ mensaje: 'No está autorizado' });
    }

    const { Usuario_Contraseña, ...usuario } = objetivo;
    res.json(usuario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener el usuario' });
  }
};

const CAMPOS_PROTEGIDOS_PERFIL = ['Usuario_Nombre_Completo', 'Usuario_RUT', 'Usuario_Id'];
const REGEX_CORREO_GENERICO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CU19: Editar datos personales del propio perfil (correo, teléfono y/o dirección)
// PUT /api/usuarios/perfil  { correo, telefono, direccion: { calle, numero, depto, comuna } }
const editarPerfilPropio = async (req, res) => {
  const userId = req.user.id;
  const datos = req.body || {};

  // CU19 - Excepción "Intento modificación campo protegido": Nombre y RUT son de solo
  // lectura en el formulario; si igual llegan en el body (bypass), se rechaza todo el
  // intento sin tocar la base de datos, sin aplicar ni siquiera los cambios permitidos.
  const intentaCampoProtegido = CAMPOS_PROTEGIDOS_PERFIL.some((campo) =>
    Object.prototype.hasOwnProperty.call(datos, campo)
  );
  if (intentaCampoProtegido) {
    return res.status(400).json({ mensaje: 'No está permitido modificar el nombre o el RUT desde tu perfil' });
  }

  const { correo, telefono, direccion } = datos;

  // CU19 - Excepción "Formato de datos incorrecto": teléfono y dirección, validados antes de tocar la BD
  if (telefono !== undefined && !validarTelefonoChileno(telefono)) {
    return res.status(400).json({ mensaje: 'Datos no cumplen con el formato' });
  }
  if (direccion !== undefined) {
    const errorDireccion = typeof direccion === 'object' && direccion !== null
      ? validarDireccion(direccion)
      : 'La dirección debe incluir calle, número y comuna';
    if (errorDireccion) {
      return res.status(400).json({ mensaje: errorDireccion });
    }
  }

  try {
    const [rows] = await db.query('SELECT * FROM usuario WHERE Usuario_Id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    const actual = rows[0];

    // El correo vive en una columna distinta según el rol principal de la cuenta
    let columnaCorreo = null;
    if (actual.Es_Administrador) columnaCorreo = 'Administrador_Correo_Institucional';
    else if (actual.Es_Docente) columnaCorreo = 'Docente_Correo_Institucional';
    else if (actual.Es_Apoderado) columnaCorreo = 'Apoderado_Correo_Natural';

    if (correo !== undefined && columnaCorreo) {
      // Administrador/Docente usan correo institucional; Apoderado, uno propio
      const correoValido = (actual.Es_Administrador || actual.Es_Docente)
        ? validarCorreoInstitucional(correo)
        : REGEX_CORREO_GENERICO.test(correo);
      if (!correoValido) {
        return res.status(400).json({ mensaje: 'Datos no cumplen con el formato' });
      }

      // CU19 - Excepción "Correo ya registrado"
      const [duplicado] = await db.query(
        `SELECT Usuario_Id FROM usuario WHERE ${columnaCorreo} = ? AND Usuario_Id != ?`,
        [correo, userId]
      );
      if (duplicado.length > 0) {
        return res.status(400).json({ mensaje: 'El correo ingresado ya se encuentra registrado' });
      }
    }

    const campos = [];
    const valores = [];
    if (correo !== undefined && columnaCorreo) {
      campos.push(`${columnaCorreo} = ?`);
      valores.push(correo);
    }
    if (telefono !== undefined) {
      campos.push('Usuario_Telefono = ?');
      valores.push(normalizarTelefono(telefono));
    }
    // La dirección particular aplica a todo usuario, sin importar su rol
    if (direccion !== undefined) {
      for (const [columna, valor] of columnasDireccion(direccion)) {
        campos.push(`${columna} = ?`);
        valores.push(valor);
      }
    }

    if (campos.length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos válidos para actualizar' });
    }

    valores.push(userId);
    await db.query(`UPDATE usuario SET ${campos.join(', ')} WHERE Usuario_Id = ?`, valores);

    const [actualizado] = await db.query('SELECT * FROM usuario WHERE Usuario_Id = ?', [userId]);
    const { Usuario_Contraseña, ...usuario } = actualizado[0];
    return res.json({ mensaje: 'Cambios guardados correctamente', usuario });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'No fue posible actualizar tu perfil, reintente más tarde' });
  }
};

// CU20: Editar fotografía de perfil mediante carga de archivo
// PUT /api/usuarios/perfil/foto  (multipart/form-data, campo "foto")
// El formato/tamaño ya se valida en el middleware uploadFotoPerfil, antes de llegar acá.
const actualizarFotografiaPerfil = async (req, res) => {
  const userId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ mensaje: 'Debes seleccionar un archivo de imagen' });
  }

  const rutaFoto = `/uploads/perfiles/${req.file.filename}`;

  try {
    const [rows] = await db.query('SELECT Usuario_Foto_Perfil FROM usuario WHERE Usuario_Id = ?', [userId]);
    const fotoAnterior = rows[0]?.Usuario_Foto_Perfil;

    await db.query('UPDATE usuario SET Usuario_Foto_Perfil = ? WHERE Usuario_Id = ?', [rutaFoto, userId]);

    // Elimina la fotografía anterior del disco para no acumular archivos huérfanos
    // (solo si es una ruta /uploads/perfiles/<archivo>; nunca se borra fuera de esa carpeta).
    if (fotoAnterior && fotoAnterior !== rutaFoto && fotoAnterior.startsWith('/uploads/perfiles/')) {
      const rutaAbsolutaAnterior = path.join(UPLOAD_DIR, path.basename(fotoAnterior));
      fs.unlink(rutaAbsolutaAnterior, () => {});
    }

    return res.json({ mensaje: 'Fotografía actualizada correctamente', Usuario_Foto_Perfil: rutaFoto });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'No fue posible guardar la fotografía, reintente más tarde' });
  }
};

// Crear usuario — acepta los 3 roles con sus correos específicos
const createUsuario = async (req, res) => {
  const {
    Usuario_RUT,
    Usuario_Telefono,
    Usuario_Nombre_Completo,
    Usuario_Estado_Cuenta,
    Usuario_Contraseña,
    // Docente
    Es_Docente,
    Docente_Carga_Horaria_Semanal,
    Docente_Correo_Institucional,
    // Administrador
    Es_Administrador,
    Administrador_Tipo,
    Administrador_Correo_Institucional,
    // Apoderado
    Es_Apoderado,
    Apoderado_Correo_Natural,
  } = req.body;

  // Campos base obligatorios
  if (!Usuario_RUT || !Usuario_Telefono || !Usuario_Nombre_Completo || !Usuario_Contraseña) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios (RUT, teléfono, nombre, contraseña)' });
  }

  // Validar correo según rol
  if (Es_Docente && !Docente_Correo_Institucional)
    return res.status(400).json({ mensaje: 'El correo institucional del docente es obligatorio' });
  if (Es_Docente && !validarCorreoInstitucional(Docente_Correo_Institucional))
    return res.status(400).json({ mensaje: 'El correo institucional del docente debe pertenecer al dominio @jacquescousteau.edu' });
  if (Es_Administrador && !Administrador_Correo_Institucional)
    return res.status(400).json({ mensaje: 'El correo institucional del administrador es obligatorio' });
  if (Es_Administrador && !validarCorreoInstitucional(Administrador_Correo_Institucional))
    return res.status(400).json({ mensaje: 'El correo institucional del administrador debe pertenecer al dominio @jacquescousteau.edu' });
  if (Es_Apoderado && !Apoderado_Correo_Natural)
    return res.status(400).json({ mensaje: 'El correo del apoderado es obligatorio' });

  // RF04: especialidades como etiquetas (arreglo o texto separado por comas)
  let especialidades = null;
  if (Es_Docente) {
    const normalizadas = normalizarEspecialidades(especialidadesDelCuerpo(req.body));
    if (!normalizadas.ok) return res.status(400).json({ mensaje: normalizadas.mensaje });
    especialidades = normalizadas.nombres;
  }

  // CU107: disponibilidad laboral semanal (opcional; sin ella el docente no tiene restricción)
  let disponibilidad = null;
  if (Es_Docente && req.body.Docente_Disponibilidad !== undefined) {
    const leida = leerDisponibilidad(req.body.Docente_Disponibilidad);
    if (!leida.ok) return res.status(400).json({ mensaje: leida.mensaje });
    disponibilidad = leida;
  }

  try {

    // Verificar si existe usuario con ese RUT
    const [existeRUT] = await db.query(
      `SELECT
          Usuario_Id,
          Es_Administrador,
          Es_Docente,
          Es_Apoderado
       FROM usuario
       WHERE Usuario_RUT = ?`,
      [Usuario_RUT]
    );

    if (existeRUT.length > 0) {

      const usuario = existeRUT[0];

      if (Es_Docente) {
        if (usuario.Es_Docente) {
          return res.status(400).json({ mensaje: 'El usuario ya posee el rol Docente' });
        }
        return res.status(409).json({
          requiereAsignacionRol: true,
          usuarioId: usuario.Usuario_Id,
          rol: 'Docente',
          mensaje: 'El usuario ya existe. Debe asignar el rol desde Gestión de Roles.'
        });
      }

      if (Es_Apoderado) {
        if (usuario.Es_Apoderado) {
          return res.status(400).json({ mensaje: 'El usuario ya posee el rol Apoderado' });
        }
        return res.status(409).json({
          requiereAsignacionRol: true,
          usuarioId: usuario.Usuario_Id,
          rol: 'Apoderado',
          mensaje: 'El usuario ya existe. Debe asignar el rol desde Gestión de Roles.'
        });
      }

      if (Es_Administrador) {
        if (usuario.Es_Administrador) {
          return res.status(400).json({ mensaje: 'El usuario ya posee el rol Administrador' });
        }
        return res.status(409).json({
          requiereAsignacionRol: true,
          usuarioId: usuario.Usuario_Id,
          rol: 'Administrador',
          mensaje: 'El usuario ya existe. Debe asignar el rol desde Gestión de Roles.'
        });
      }
    }

    // Verificar correo duplicado según rol
    if (Es_Docente) {
      const [dup] = await db.query(
        'SELECT Usuario_Id FROM usuario WHERE Docente_Correo_Institucional = ?',
        [Docente_Correo_Institucional]
      );
      if (dup.length > 0)
        return res.status(400).json({ mensaje: 'Ya existe un docente con ese correo institucional' });
    }
    if (Es_Administrador) {
      const [dup] = await db.query(
        'SELECT Usuario_Id FROM usuario WHERE Administrador_Correo_Institucional = ?',
        [Administrador_Correo_Institucional]
      );
      if (dup.length > 0)
        return res.status(400).json({ mensaje: 'Ya existe un administrador con ese correo institucional' });
    }
    if (Es_Apoderado) {
      const [dup] = await db.query(
        'SELECT Usuario_Id FROM usuario WHERE Apoderado_Correo_Natural = ?',
        [Apoderado_Correo_Natural]
      );
      if (dup.length > 0)
        return res.status(400).json({ mensaje: 'Ya existe un apoderado con ese correo' });
    }

    const hash = await bcrypt.hash(Usuario_Contraseña, 10);

    let guardadoDisponibilidad = null;
    const nuevoId = await enTransaccion(async (conn) => {
      const [resultado] = await conn.query(
        `INSERT INTO usuario (
          Usuario_RUT, Usuario_Telefono, Usuario_Nombre_Completo,
          Usuario_Estado_Cuenta, Usuario_Contraseña, Usuario_Foto_Perfil,
          Es_Docente, Docente_Carga_Horaria_Semanal, Docente_Especialidad, Docente_Correo_Institucional,
          Es_Administrador, Administrador_Tipo, Administrador_Correo_Institucional,
          Es_Apoderado, Usuario_Direccion_Calle, Usuario_Direccion_Numero,
          Usuario_Direccion_Depto, Usuario_Direccion_Comuna, Apoderado_Correo_Natural
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Usuario_RUT,
          normalizarTelefono(Usuario_Telefono),
          Usuario_Nombre_Completo.trim(),
          Usuario_Estado_Cuenta !== undefined ? Usuario_Estado_Cuenta : 1,
          hash,
          null, // Glosario 6.1.2: la cuenta se crea sin fotografía; se carga luego desde el perfil
          Es_Docente      ? 1 : 0,
          Docente_Carga_Horaria_Semanal    || null,
          especialidades ? especialidades.join(', ') : null,
          Docente_Correo_Institucional    || null,
          Es_Administrador ? 1 : 0,
          Administrador_Tipo              || null,
          Administrador_Correo_Institucional || null,
          Es_Apoderado    ? 1 : 0,
          ...columnasDireccion(direccionDesdeColumnas(req.body)).map(([, valor]) => valor),
          Apoderado_Correo_Natural        || null,
        ]
      );
      if (especialidades) await guardarEspecialidadesDocente(conn, resultado.insertId, especialidades);
      if (disponibilidad && disponibilidad.tramos.length > 0) {
        guardadoDisponibilidad = await guardarDisponibilidadDocente(conn, {
          docenteId: resultado.insertId, disponibilidad, responsableId: req.user.id,
        });
      }
      return resultado.insertId;
    });

    const [nuevo] = await db.query('SELECT * FROM usuario WHERE Usuario_Id = ?', [nuevoId]);
    const { Usuario_Contraseña: pwd, ...usuarioSinPwd } = nuevo[0];
    res.status(201).json(guardadoDisponibilidad
      ? { ...usuarioSinPwd, Disponibilidad_Laboral: guardadoDisponibilidad }
      : usuarioSinPwd);
  } catch (error) {
    if (error instanceof ErrorDisponibilidad) return res.status(error.status).json({ mensaje: error.message });
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el usuario' });
  }
};

// Actualizar usuario
const updateUsuario = async (req, res) => {
  const { id } = req.params;
  const solicitante = req.user;

  try {
    const [existe] = await db.query(
      'SELECT Es_Administrador, Administrador_Tipo, Es_Apoderado, Es_Docente FROM usuario WHERE Usuario_Id = ?', [id]
    );
    if (existe.length === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const objetivo = existe[0];
    const esSuperAdmin = solicitante.administradorTipo === 'Super Admin';
    const esAdmin = (solicitante.roles || []).includes('Administrador');

    // SuperAdmin puede editar Admin, Docente y Apoderado (no a otros SuperAdmin)
    // Admin puede editar solo Docente y Apoderado
    const objetivoEsSuperAdmin = objetivo.Es_Administrador && objetivo.Administrador_Tipo === 'Super Admin';
    const objetivoEsAdmin = objetivo.Es_Administrador && objetivo.Administrador_Tipo !== 'Super Admin';

    if (objetivoEsSuperAdmin) {
      return res.status(403).json({ mensaje: 'No tienes permiso para editar a un Super Administrador' });
    }
    if (objetivoEsAdmin && !esSuperAdmin) {
      return res.status(403).json({ mensaje: 'Solo un Super Administrador puede editar a un Administrador' });
    }
    if (!esSuperAdmin && !esAdmin) {
      return res.status(403).json({ mensaje: 'No tienes permiso para editar usuarios' });
    }

    const CAMPOS_EDITABLES_USUARIO = new Set([
      'Usuario_Telefono',
      'Usuario_Nombre_Completo',
      'Usuario_Foto_Perfil',
      'Usuario_Estado_Cuenta',
      'Docente_Carga_Horaria_Semanal',
      'Docente_Correo_Institucional',
      'Administrador_Correo_Institucional',
      ...Object.values(CAMPOS_DIRECCION),
      'Apoderado_Correo_Natural',
    ]);

    const datosActualizar = { ...req.body };
    delete datosActualizar.Usuario_Id;
    const { Usuario_Contraseña, ...camposRaw } = datosActualizar;

    const otrosDatos = Object.fromEntries(
      Object.entries(camposRaw).filter(([k]) => CAMPOS_EDITABLES_USUARIO.has(k))
    );

    // RF04: las especialidades se guardan como etiquetas, aparte de las columnas de usuario
    let especialidades = null;
    const especialidadesEnviadas = especialidadesDelCuerpo(camposRaw);
    if (especialidadesEnviadas !== undefined) {
      if (!objetivo.Es_Docente) {
        return res.status(400).json({ mensaje: 'Solo un docente puede tener especialidades' });
      }
      const normalizadas = normalizarEspecialidades(especialidadesEnviadas);
      if (!normalizadas.ok) return res.status(400).json({ mensaje: normalizadas.mensaje });
      especialidades = normalizadas.nombres;
    }

    // CU107: disponibilidad laboral semanal; solo la edita el administrador (esta ruta es de administración)
    let disponibilidad = null;
    if (camposRaw.Docente_Disponibilidad !== undefined) {
      if (!objetivo.Es_Docente) {
        return res.status(400).json({ mensaje: 'Solo un docente tiene disponibilidad laboral' });
      }
      const leida = leerDisponibilidad(camposRaw.Docente_Disponibilidad);
      if (!leida.ok) return res.status(400).json({ mensaje: leida.mensaje });
      disponibilidad = leida;
    }

    // Validar dominio de correos institucionales si se están actualizando
    if (otrosDatos.Docente_Correo_Institucional && !validarCorreoInstitucional(otrosDatos.Docente_Correo_Institucional)) {
      return res.status(400).json({ mensaje: 'El correo institucional del docente debe pertenecer al dominio @jacquescousteau.edu' });
    }
    if (otrosDatos.Administrador_Correo_Institucional && !validarCorreoInstitucional(otrosDatos.Administrador_Correo_Institucional)) {
      return res.status(400).json({ mensaje: 'El correo institucional del administrador debe pertenecer al dominio @jacquescousteau.edu' });
    }
    if (otrosDatos.Apoderado_Correo_Natural && !validarCorreo(otrosDatos.Apoderado_Correo_Natural)) {
      return res.status(400).json({ mensaje: 'El correo del apoderado debe tener el formato usuario@dominio' });
    }
    if (otrosDatos.Usuario_Nombre_Completo !== undefined) {
      if (!validarNombreCompleto(otrosDatos.Usuario_Nombre_Completo)) {
        return res.status(400).json({ mensaje: 'El nombre completo debe contener solo letras y espacios (nombre y apellido, máx. 100 caracteres)' });
      }
      otrosDatos.Usuario_Nombre_Completo = otrosDatos.Usuario_Nombre_Completo.trim();
    }
    if (otrosDatos.Usuario_Telefono !== undefined) {
      if (!validarTelefonoChileno(otrosDatos.Usuario_Telefono)) {
        return res.status(400).json({ mensaje: MENSAJE_TELEFONO_INVALIDO });
      }
      otrosDatos.Usuario_Telefono = normalizarTelefono(otrosDatos.Usuario_Telefono);
    }
    const errorDireccion = validarDireccion(direccionDesdeColumnas(otrosDatos), { parcial: true });
    if (errorDireccion) {
      return res.status(400).json({ mensaje: errorDireccion });
    }
    if (otrosDatos.Usuario_Direccion_Depto !== undefined && String(otrosDatos.Usuario_Direccion_Depto ?? '').trim() === '') {
      otrosDatos.Usuario_Direccion_Depto = null;
    }

    let hash = null;
    if (Usuario_Contraseña) hash = await bcrypt.hash(Usuario_Contraseña, 10);

    const campos  = Object.keys(otrosDatos).map(c => `${c} = ?`);
    const valores = Object.values(otrosDatos);

    if (hash) { campos.push('Usuario_Contraseña = ?'); valores.push(hash); }
    if (campos.length === 0 && !especialidades && !disponibilidad) return res.status(400).json({ mensaje: 'No hay campos para actualizar' });

    valores.push(id);
    let guardadoDisponibilidad = null;
    if (especialidades || disponibilidad) {
      await enTransaccion(async (conn) => {
        if (campos.length > 0) await conn.query(`UPDATE usuario SET ${campos.join(', ')} WHERE Usuario_Id = ?`, valores);
        if (especialidades) await guardarEspecialidadesDocente(conn, id, especialidades);
        // Después de la carga horaria, para que las horas adeudadas usen la carga nueva
        if (disponibilidad) {
          guardadoDisponibilidad = await guardarDisponibilidadDocente(conn, {
            docenteId: Number(id), disponibilidad, responsableId: solicitante.id,
          });
        }
      });
    } else {
      await db.query(`UPDATE usuario SET ${campos.join(', ')} WHERE Usuario_Id = ?`, valores);
    }

    const [actualizado] = await db.query('SELECT * FROM usuario WHERE Usuario_Id = ?', [id]);
    const { Usuario_Contraseña: pwd, ...usuarioSinPwd } = actualizado[0];
    res.json(guardadoDisponibilidad
      ? { ...usuarioSinPwd, Disponibilidad_Laboral: guardadoDisponibilidad }
      : usuarioSinPwd);
  } catch (error) {
    if (error instanceof ErrorDisponibilidad) return res.status(error.status).json({ mensaje: error.message });
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar el usuario' });
  }
};

// Eliminar usuario
const deleteUsuario = async (req, res) => {
  const { id } = req.params;
  try {
    const [resultado] = await db.query('DELETE FROM usuario WHERE Usuario_Id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ mensaje: 'No se puede eliminar: el usuario tiene registros relacionados' });
    res.status(500).json({ mensaje: 'Error al eliminar el usuario' });
  }
};

const updateRoles = async (req, res) => {

    const { id } = req.params;

    const {
        Es_Administrador,
        Es_Docente,
        Es_Apoderado,
        Administrador_Tipo
    } = req.body;

    // Exclusividad: Admin/SuperAdmin no puede coexistir con Docente o Apoderado
    if (Es_Administrador && (Es_Docente || Es_Apoderado)) {
        return res.status(400).json({
            mensaje: 'Un usuario con rol Administrador no puede tener otros roles simultáneamente'
        });
    }

    try {

        const [usuario] = await db.query(
            `SELECT Usuario_Id
             FROM usuario
             WHERE Usuario_Id = ?`,
            [id]
        );

        if (usuario.length === 0) {

            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });

        }

        await db.query(
            `UPDATE usuario
             SET
             Es_Administrador = ?,
             Es_Docente = ?,
             Es_Apoderado = ?,
             Administrador_Tipo = ?
             WHERE Usuario_Id = ?`,
            [
                Es_Administrador,
                Es_Docente,
                Es_Apoderado,
                Administrador_Tipo || null,
                id
            ]
        );

        res.json({
            mensaje:
                'Roles actualizados correctamente'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            mensaje:
                'Error al actualizar roles'
        });

    }

};

const toggleEstado = async (req, res) => {
  const { id } = req.params;
  const actorId   = req.user.id;
  const actorTipo = req.user.administradorTipo;

  // Excepción 3 del CU: actor no puede desactivarse a sí mismo
  if (parseInt(id) === actorId) {
    return res.status(403).json({ mensaje: 'No puedes desactivar tu propia cuenta' });
  }

  try {
    const [rows] = await db.query(
      `SELECT Usuario_Estado_Cuenta, Es_Administrador, Administrador_Tipo
       FROM usuario WHERE Usuario_Id = ?`,
      [id]
    );
    if (rows.length === 0)
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const u = rows[0];

    // CU 23: solo Super Admin puede tocar cuentas de administrador
    if (u.Es_Administrador && actorTipo !== 'Super Admin') {
      return res.status(403).json({
        mensaje: 'Solo un Super Administrador puede desactivar o reactivar cuentas de administrador'
      });
    }

    const nuevoEstado = u.Usuario_Estado_Cuenta ? 0 : 1;

    await db.query(
      'UPDATE usuario SET Usuario_Estado_Cuenta = ? WHERE Usuario_Id = ?',
      [nuevoEstado, id]
    );

    // CU 22: al desactivar, invalida todas las sesiones activas del usuario
    if (nuevoEstado === 0) {
      await db.query(
        `UPDATE sesion
         SET Sesion_Estado = 0, Sesion_Fecha_Expiracion = NOW()
         WHERE Usuario_Id = ? AND Sesion_Estado = 1`,
        [id]
      );
    }

    res.json({ mensaje: 'Estado actualizado', estado: nuevoEstado });
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error al actualizar estado' });
  }
};

// Asignar un nuevo rol a un usuario existente, con sus datos específicos
const asignarRol = async (req, res) => {
  const { id } = req.params;
  const solicitante = req.user;
  const { rol, ...datosFila } = req.body;

  const rolesValidos = ['Administrador', 'Docente', 'Apoderado'];
  if (!rol || !rolesValidos.includes(rol)) {
    return res.status(400).json({ mensaje: 'Rol inválido. Debe ser Administrador, Docente o Apoderado' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM usuario WHERE Usuario_Id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const usuario = rows[0];

    // Verificar que el usuario no tenga ya ese rol
    if (rol === 'Administrador' && usuario.Es_Administrador)
      return res.status(400).json({ mensaje: 'El usuario ya tiene el rol Administrador' });
    if (rol === 'Docente' && usuario.Es_Docente)
      return res.status(400).json({ mensaje: 'El usuario ya tiene el rol Docente' });
    if (rol === 'Apoderado' && usuario.Es_Apoderado)
      return res.status(400).json({ mensaje: 'El usuario ya tiene el rol Apoderado' });

    // Solo Super Admin puede asignar el rol Administrador
    if (rol === 'Administrador' && solicitante.administradorTipo !== 'Super Admin') {
      return res.status(403).json({ mensaje: 'Solo un Super Administrador puede asignar el rol Administrador' });
    }

    // Exclusividad de roles: Admin no puede convivir con Docente/Apoderado
    if ((rol === 'Docente' || rol === 'Apoderado') && usuario.Es_Administrador) {
      return res.status(400).json({
        mensaje: 'Un usuario Administrador no puede recibir otros roles. Desactiva primero el rol de Administrador desde Gestión de Roles.'
      });
    }
    // Al asignar Admin a un usuario con roles Docente/Apoderado, solo Super Admin puede hacerlo
    // y se eliminarán esos roles automáticamente (conversión)
    const convirtiendo = rol === 'Administrador' && (usuario.Es_Docente || usuario.Es_Apoderado);

    // Resolver campos: valor enviado o, si se omite, el que ya existe en la BD
    const correoDocente  = datosFila.Docente_Correo_Institucional  || usuario.Docente_Correo_Institucional;
    const especialidadesRol = normalizarEspecialidades(
      especialidadesDelCuerpo(datosFila) ?? usuario.Docente_Especialidad
    );
    const carga          = datosFila.Docente_Carga_Horaria_Semanal  || usuario.Docente_Carga_Horaria_Semanal;
    const correoAdmin    = datosFila.Administrador_Correo_Institucional || usuario.Administrador_Correo_Institucional;
    const tipoAdmin      = datosFila.Administrador_Tipo            || usuario.Administrador_Tipo || 'Administrador Normal';
    const correoApo      = datosFila.Apoderado_Correo_Natural      || usuario.Apoderado_Correo_Natural;
    // Si se envía cualquier parte de la dirección, se toma la dirección enviada completa
    const direccionEnviada = Object.values(CAMPOS_DIRECCION).some((col) => datosFila[col] !== undefined);
    const direccionApo   = direccionDesdeColumnas(direccionEnviada ? datosFila : usuario);

    // Validar datos específicos según rol (usando valores resueltos)
    if (rol === 'Docente') {
      if (!correoDocente)
        return res.status(400).json({ mensaje: 'El correo institucional del docente es obligatorio' });
      if (!validarCorreoInstitucional(correoDocente))
        return res.status(400).json({ mensaje: 'El correo institucional debe pertenecer al dominio @jacquescousteau.edu' });
      if (!especialidadesRol.ok)
        return res.status(400).json({ mensaje: especialidadesRol.mensaje });
      if (!carga)
        return res.status(400).json({ mensaje: 'La carga horaria semanal es obligatoria' });
      const [dup] = await db.query(
        'SELECT Usuario_Id FROM usuario WHERE Docente_Correo_Institucional = ? AND Usuario_Id != ?',
        [correoDocente, id]
      );
      if (dup.length > 0)
        return res.status(400).json({ mensaje: 'Ya existe un docente con ese correo institucional' });
    }

    if (rol === 'Administrador') {
      if (!correoAdmin)
        return res.status(400).json({ mensaje: 'El correo institucional del administrador es obligatorio' });
      if (!validarCorreoInstitucional(correoAdmin))
        return res.status(400).json({ mensaje: 'El correo institucional debe pertenecer al dominio @jacquescousteau.edu' });
      const [dup] = await db.query(
        'SELECT Usuario_Id FROM usuario WHERE Administrador_Correo_Institucional = ? AND Usuario_Id != ?',
        [correoAdmin, id]
      );
      if (dup.length > 0)
        return res.status(400).json({ mensaje: 'Ya existe un administrador con ese correo institucional' });
    }

    if (rol === 'Apoderado') {
      if (!correoApo)
        return res.status(400).json({ mensaje: 'El correo del apoderado es obligatorio' });
      if (!validarCorreo(correoApo))
        return res.status(400).json({ mensaje: 'El correo del apoderado debe tener el formato usuario@dominio' });
      const errorDireccion = validarDireccion(direccionApo);
      if (errorDireccion)
        return res.status(400).json({ mensaje: errorDireccion });
      const [dup] = await db.query(
        'SELECT Usuario_Id FROM usuario WHERE Apoderado_Correo_Natural = ? AND Usuario_Id != ?',
        [correoApo, id]
      );
      if (dup.length > 0)
        return res.status(400).json({ mensaje: 'Ya existe un apoderado con ese correo' });
    }

    // Construir SET dinámico con el flag del rol + datos específicos (valores resueltos)
    const setCampos = [];
    const setValores = [];

    if (rol === 'Docente') {
      setCampos.push('Es_Docente = 1',
        'Docente_Correo_Institucional = ?',
        'Docente_Carga_Horaria_Semanal = ?'
      );
      setValores.push(correoDocente, carga);
    }

    if (rol === 'Administrador') {
      setCampos.push('Es_Administrador = 1',
        'Administrador_Tipo = ?',
        'Administrador_Correo_Institucional = ?'
      );
      if (convirtiendo) {
        setCampos.push('Es_Docente = 0', 'Es_Apoderado = 0');
      }
      setValores.push(tipoAdmin, correoAdmin);
    }

    if (rol === 'Apoderado') {
      setCampos.push('Es_Apoderado = 1', 'Apoderado_Correo_Natural = ?');
      setValores.push(correoApo);
      for (const [columna, valor] of columnasDireccion(direccionApo)) {
        setCampos.push(`${columna} = ?`);
        setValores.push(valor);
      }
    }

    setValores.push(id);
    await enTransaccion(async (conn) => {
      await conn.query(`UPDATE usuario SET ${setCampos.join(', ')} WHERE Usuario_Id = ?`, setValores);
      if (rol === 'Docente') await guardarEspecialidadesDocente(conn, id, especialidadesRol.nombres);
    });

    const [actualizado] = await db.query('SELECT * FROM usuario WHERE Usuario_Id = ?', [id]);
    const { Usuario_Contraseña: pwd, ...usuarioSinPwd } = actualizado[0];
    const mensajeRespuesta = convirtiendo
      ? `Rol ${rol} asignado. Los roles anteriores fueron eliminados por exclusividad.`
      : `Rol ${rol} asignado correctamente`;
    res.json({ mensaje: mensajeRespuesta, usuario: usuarioSinPwd });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al asignar el rol' });
  }
};

// CU28: Buscar usuarios por nombre completo, RUT o correo electrónico
const buscarUsuario = async (req, res) => {
  const { rut, nombre, correo } = req.body;
  const solicitante = req.user;

  // CU28 - Excepción "Campos inválidos o incompletos"
  if (!rut && !nombre && !correo) {
    return res.status(400).json({ mensaje: 'Ingrese datos válidos' });
  }

  try {
    const conditions = [];
    const params     = [];

    if (rut) {
      conditions.push('Usuario_RUT LIKE ?');
      params.push(`%${rut}%`);
    }
    if (nombre) {
      conditions.push('Usuario_Nombre_Completo LIKE ?');
      params.push(`%${nombre}%`);
    }
    if (correo) {
      conditions.push(
        '(Administrador_Correo_Institucional LIKE ? OR Docente_Correo_Institucional LIKE ? OR Apoderado_Correo_Natural LIKE ?)'
      );
      params.push(`%${correo}%`, `%${correo}%`, `%${correo}%`);
    }

    const [rows] = await db.query(
      `SELECT Usuario_Id, Usuario_RUT, Usuario_Nombre_Completo, Usuario_Estado_Cuenta,
              Es_Administrador, Administrador_Tipo, Administrador_Correo_Institucional,
              Es_Docente, Docente_Correo_Institucional, Docente_Especialidad,
              Es_Apoderado, Apoderado_Correo_Natural
       FROM usuario
       WHERE ${conditions.join(' OR ')}
       ORDER BY Usuario_Nombre_Completo
       LIMIT 20`,
      params
    );

    // Admin normal no puede ver ni gestionar Super Admins
    const esSuperAdmin = solicitante.administradorTipo === 'Super Admin';
    const resultado = esSuperAdmin
      ? rows
      : rows.filter(u => !(u.Es_Administrador && u.Administrador_Tipo === 'Super Admin'));

    // CU28 - Excepción "Búsqueda fuera de alcance": el/los usuarios encontrados existen,
    // pero son Super Admin y un Administrador normal no puede gestionarlos. No corresponde
    // reportar esto como "sin coincidencias" (eso implicaría que el usuario no existe).
    if (!esSuperAdmin && rows.length > 0 && resultado.length === 0) {
      return res.status(403).json({ mensaje: 'Usuario fuera de su alcance' });
    }

    // CU28 - Excepción "Sin coincidencias"
    if (resultado.length === 0) {
      return res.status(200).json({ mensaje: 'No se encontraron usuarios', usuarios: [] });
    }

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al buscar usuario' });
  }
};

// CU30 y CU31: Listar docentes y filtrar por especialidad o estado de cuenta
// Endpoint: GET /api/usuarios/docentes?especialidad=...&estado=...
const getDocentes = async (req, res) => {
  const { especialidad, especialidadId, estado } = req.query;
  const hayFiltros = (especialidad && especialidad.trim() !== '') || (estado !== undefined && estado !== '')
    || (especialidadId !== undefined && especialidadId !== '');

  try {
    let sql = `
      SELECT 
        Usuario_Id,
        Usuario_RUT,
        Usuario_Nombre_Completo,
        Usuario_Telefono,
        Docente_Correo_Institucional,
        Docente_Especialidad,
        Docente_Carga_Horaria_Semanal,
        Usuario_Estado_Cuenta,
        Es_Docente,
        Es_Apoderado,
        Es_Administrador
      FROM usuario
      WHERE Es_Docente = 1
    `;
    const params = [];

    // Filtros opcionales (CU31)
    if (especialidad && especialidad.trim() !== '') {
      sql += ' AND Docente_Especialidad LIKE ?';
      params.push(`%${especialidad.trim()}%`);
    }

    // Etiqueta exacta del catálogo de especialidades
    if (especialidadId !== undefined && especialidadId !== '') {
      sql += ` AND EXISTS (SELECT 1 FROM docente_especialidad de
                            WHERE de.Docente_Usuario_Id = usuario.Usuario_Id AND de.Especialidad_Id = ?)`;
      params.push(Number(especialidadId));
    }

    if (estado !== undefined && estado !== '') {
      sql += ' AND Usuario_Estado_Cuenta = ?';
      params.push(estado === '1' || estado === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY Usuario_Nombre_Completo ASC';

    const [docentes] = await db.query(sql, params);

    if (docentes.length === 0) {
      // CU30 (sin filtros): no existen docentes registrados en el sistema.
      // CU31 (Excepción "Sin coincidencias", con filtros): ninguno coincide con los filtros aplicados.
      return res.status(200).json({
        mensaje: hayFiltros
          ? 'No existen docentes asociados a los filtros aplicados'
          : 'No existen docentes registrados',
        docentes: [],
      });
    }

    return res.json(docentes);
  } catch (error) {
    console.error(error);
    // CU30: "No fue posible obtener el listado, reintente posteriormente"
    // CU31 (con filtros): "No fue posible completar la operación"
    return res.status(500).json({
      mensaje: hayFiltros
        ? 'No fue posible completar la operación'
        : 'No fue posible obtener el listado, reintente posteriormente',
    });
  }
};

// Operadores de comparación permitidos para el filtro de CU33 (whitelist contra inyección SQL)
const OPERADORES_CANTIDAD_ESTUDIANTES = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '<': '<',
  '>=': '>=',
  '<=': '<=',
};

// CU32 y CU33: Listar apoderados y filtrar por cantidad de estudiantes asociados
// Endpoint: GET /api/usuarios/apoderados?operador=...&cantidadEstudiantes=...
const getApoderados = async (req, res) => {
  const { cantidadEstudiantes } = req.query;
  const operador = req.query.operador || '=';
  const hayFiltros = cantidadEstudiantes !== undefined && cantidadEstudiantes !== '';

  // CU33 - Excepción "Valor no entero o negativo": se valida antes de tocar la base de datos
  if (hayFiltros) {
    const esEnteroValido = /^\d+$/.test(String(cantidadEstudiantes).trim());
    const esOperadorValido = Object.prototype.hasOwnProperty.call(OPERADORES_CANTIDAD_ESTUDIANTES, operador);
    if (!esEnteroValido || !esOperadorValido) {
      return res.status(400).json({ mensaje: 'Ingrese un número entero válido' });
    }
  }

  try {
    // RF20/CU32/CU33: la lista debe incluir, por cada apoderado, los
    // estudiantes vinculados con su estado académico (no solo un total).
    // GROUP_CONCAT arma esa lista dentro de la misma consulta agregada que
    // ya calcula Total_Estudiantes_Asociados para el filtro por cantidad.
    let sql = `
      SELECT
        u.Usuario_Id,
        u.Usuario_RUT,
        u.Usuario_Nombre_Completo,
        u.Usuario_Telefono,
        u.Apoderado_Correo_Natural,
        u.Usuario_Direccion_Calle,
        u.Usuario_Direccion_Numero,
        u.Usuario_Direccion_Depto,
        u.Usuario_Direccion_Comuna,
        u.Usuario_Estado_Cuenta,
        u.Es_Docente,
        u.Es_Apoderado,
        u.Es_Administrador,
        u.Apoderado_Sin_Asociaciones_Desde,
        COUNT(e.Estudiante_Id) AS Total_Estudiantes_Asociados,
        GROUP_CONCAT(
          CASE WHEN e.Estudiante_Id IS NOT NULL
            THEN CONCAT(e.Estudiante_Nombre_Completo, '::', e.Estudiante_Estado_Academico, '::', asoc.Rol)
          END
          SEPARATOR '||'
        ) AS Estudiantes_Asociados_Raw
      FROM usuario u
      -- RF57: un apoderado está asociado a un estudiante como titular o como suplente
      LEFT JOIN (
        SELECT Estudiante_Id, Apoderado_Usuario_Id AS Apoderado_Id, 'Titular' AS Rol
          FROM estudiante WHERE Apoderado_Usuario_Id IS NOT NULL
        UNION ALL
        SELECT Estudiante_Id, Suplente_Usuario_Id, 'Suplente' FROM apoderado_suplente
      ) asoc ON asoc.Apoderado_Id = u.Usuario_Id
      LEFT JOIN estudiante e
        ON e.Estudiante_Id = asoc.Estudiante_Id AND e.Estudiante_Fecha_Eliminacion IS NULL
      WHERE u.Es_Apoderado = 1
      GROUP BY u.Usuario_Id
    `;
    const params = [];

    // Filtro por cantidad de estudiantes con operador de comparación (CU33)
    if (hayFiltros) {
      sql += ` HAVING Total_Estudiantes_Asociados ${OPERADORES_CANTIDAD_ESTUDIANTES[operador]} ?`;
      params.push(parseInt(cantidadEstudiantes, 10));
    }

    sql += ' ORDER BY u.Usuario_Nombre_Completo ASC';

    const [filas] = await db.query(sql, params);

    const apoderados = filas.map(({ Estudiantes_Asociados_Raw, ...apoderado }) => ({
      ...apoderado,
      Estudiantes: Estudiantes_Asociados_Raw
        ? Estudiantes_Asociados_Raw.split('||').map((par) => {
            const [nombre, estado, rol] = par.split('::');
            return {
              Estudiante_Nombre_Completo: nombre,
              Estudiante_Estado_Academico: estado,
              Rol_Apoderado: rol || 'Titular',
            };
          })
        : [],
    }));

    if (apoderados.length === 0) {
      // CU32 (sin filtros): no existen apoderados registrados en el sistema.
      // CU33 (con filtros): ninguno cumple los criterios seleccionados.
      return res.status(200).json({
        mensaje: hayFiltros
          ? 'No existen usuarios con rol apoderado que cumplan los criterios seleccionados'
          : 'No existen apoderados registrados',
        apoderados: [],
      });
    }

    return res.json(apoderados);
  } catch (error) {
    console.error(error);
    // CU32: "Los datos no pudieron ser cargados, reintente más tarde"
    return res.status(500).json({
      mensaje: hayFiltros
        ? 'Error al obtener el listado de apoderados'
        : 'Los datos no pudieron ser cargados, reintente más tarde',
    });
  }
};

// CU29: Buscar usuarios con filtros avanzados por rol y estado de cuenta
// Endpoint: GET /api/usuarios/filtrar?rol=Administrador|Docente|Apoderado&estado=1|0
const getUsuariosPorFiltro = async (req, res) => {
  const { rol, estado } = req.query;
  const solicitante = req.user;
  const esSuperAdmin = solicitante.administradorTipo === 'Super Admin';

  // CU29 - Excepción "Filtros fuera de privilegios": un Administrador normal no puede
  // filtrar por rol Administrador, ya que el resultado incluiría cuentas Super Admin.
  if (rol === 'Administrador' && !esSuperAdmin) {
    return res.status(403).json({ mensaje: 'Filtros no autorizados' });
  }

  try {
    let sql = 'SELECT * FROM usuario WHERE 1 = 1';
    const params = [];

    if (rol === 'Administrador') {
      sql += ' AND Es_Administrador = 1';
    } else if (rol === 'Docente') {
      sql += ' AND Es_Docente = 1';
    } else if (rol === 'Apoderado') {
      sql += ' AND Es_Apoderado = 1';
    }

    if (estado !== undefined && estado !== '') {
      sql += ' AND Usuario_Estado_Cuenta = ?';
      params.push(estado === '1' || estado === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY Usuario_Nombre_Completo ASC';

    const [rows] = await db.query(sql, params);
    const usuarios = rows.map(({ Usuario_Contraseña, ...resto }) => resto);

    if (usuarios.length === 0) {
      return res.status(200).json({
        mensaje: 'No se encontraron usuarios con esos filtros',
        usuarios: [],
      });
    }

    return res.json(usuarios);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Ocurrió un problema técnico' });
  }
};

// CU2: Visualizar administradores registrados
// Endpoint: GET /api/usuarios/administradores
const getAdministradores = async (req, res) => {
  try {
    const [administradores] = await db.query(
      `SELECT
        Usuario_Id,
        Usuario_Nombre_Completo,
        Usuario_Telefono,
        Administrador_Correo_Institucional,
        Usuario_Estado_Cuenta,
        Administrador_Tipo
      FROM usuario
      WHERE Es_Administrador = 1
      ORDER BY Usuario_Nombre_Completo ASC`
    );

    // Excepción 1: no existen administradores creados
    if (administradores.length === 0) {
      return res.status(200).json({
        mensaje: 'No existen administradores registrados en la plataforma',
        administradores: [],
      });
    }

    return res.json(administradores);
  } catch (error) {
    console.error(error);
    // Excepción 2: interrupción técnica crítica con la base de datos
    return res.status(500).json({ mensaje: 'La información no pudo ser encontrada' });
  }
};

// CU3: Editar administradores registrados
// Endpoint: PUT /api/usuarios/administradores/:id
const editarAdministrador = async (req, res) => {
  const { id } = req.params;
  const { Administrador_Correo_Institucional, Usuario_Telefono, Usuario_Estado_Cuenta } = req.body;

  try {
    const [existe] = await db.query(
      'SELECT Es_Administrador, Administrador_Tipo FROM usuario WHERE Usuario_Id = ?', [id]
    );

    if (existe.length === 0 || !existe[0].Es_Administrador) {
      return res.status(404).json({ mensaje: 'Administrador no encontrado' });
    }

    if (existe[0].Administrador_Tipo === 'Super Admin') {
      return res.status(403).json({ mensaje: 'No tienes permiso para editar a un Super Administrador' });
    }

    // Excepción 1: validar formato antes de tocar la base de datos
    if (Administrador_Correo_Institucional !== undefined && !validarCorreoInstitucional(Administrador_Correo_Institucional)) {
      return res.status(400).json({ mensaje: 'Ingresa un correo electrónico insitucional @jacquescousteau' });
    }
    if (Usuario_Telefono !== undefined && !validarTelefonoChileno(Usuario_Telefono)) {
      return res.status(400).json({ mensaje: MENSAJE_TELEFONO_INVALIDO });
    }

    const campos  = [];
    const valores = [];

    if (Administrador_Correo_Institucional !== undefined) {
      campos.push('Administrador_Correo_Institucional = ?');
      valores.push(Administrador_Correo_Institucional);
    }
    if (Usuario_Telefono !== undefined) {
      campos.push('Usuario_Telefono = ?');
      valores.push(normalizarTelefono(Usuario_Telefono));
    }
    if (Usuario_Estado_Cuenta !== undefined) {
      campos.push('Usuario_Estado_Cuenta = ?');
      valores.push(Usuario_Estado_Cuenta);
    }

    if (campos.length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
    }

    valores.push(id);
    await db.query(`UPDATE usuario SET ${campos.join(', ')} WHERE Usuario_Id = ?`, valores);

    const [actualizado] = await db.query(
      `SELECT Usuario_Id, Usuario_Nombre_Completo, Usuario_Telefono,
              Administrador_Correo_Institucional, Usuario_Estado_Cuenta, Administrador_Tipo
       FROM usuario WHERE Usuario_Id = ?`,
      [id]
    );

    return res.json({ mensaje: 'Cambios guardados correctamente', administrador: actualizado[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error al actualizar el administrador' });
  }
};

module.exports = {
  getUsuarios,
  getUsuarioById,
  editarPerfilPropio, // CU19
  actualizarFotografiaPerfil, // CU20
  createUsuario,
  updateUsuario,
  deleteUsuario,
  updateRoles,
  toggleEstado,
  getAdministradores, // CU2
  editarAdministrador, // CU3
  asignarRol,
  buscarUsuario,
  getDocentes,   // CU30 y CU31
  getApoderados, // CU32 y CU33
  getUsuariosPorFiltro, // CU29
};
