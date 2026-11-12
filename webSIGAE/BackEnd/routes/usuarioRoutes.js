const express = require('express');
const disponibilidadLaboral = require('../controllers/disponibilidadLaboralController');
const router = express.Router();

const usuarioController = require('../controllers/usuarioController');
const pie = require('../controllers/pieController');
const uploadFotoPerfil = require('../middleware/uploadFotoPerfil');
const { esImagenValida } = require('../middleware/uploadFotoPerfil');
const { codigoLimiter } = require('../middleware/rateLimiter');

const {
  verifyToken,
  verifyAdmin,
  verifyGestionAcademica,
  verifySuperAdmin,
  verifyPuedeCrearRol,
} = require('../middleware/authMiddleware');

// CU2 y CU3: Visualizar y editar administradores — exclusivo del Super Administrador
router.get('/administradores', verifyToken, verifySuperAdmin, usuarioController.getAdministradores);
router.put('/administradores/:id', verifyToken, verifySuperAdmin, usuarioController.editarAdministrador);

const { validateCrearUsuario } = require('../middleware/validation');

// Búsqueda de usuario existente (CU 25) — debe estar ANTES de /:id
router.post('/buscar', verifyToken, verifyAdmin, usuarioController.buscarUsuario);

// CU19: editar datos personales del propio perfil — cualquier usuario autenticado, debe estar ANTES de /:id
router.put('/perfil', verifyToken, usuarioController.editarPerfilPropio);
// CU19: confirmar el correo nuevo con el código enviado a esa dirección
router.put('/perfil/correo', verifyToken, codigoLimiter, usuarioController.confirmarCorreoPropio);

// CU20: editar fotografía de perfil mediante carga de archivo
router.put('/perfil/foto', verifyToken, (req, res, next) => {
  uploadFotoPerfil(req, res, (err) => {
    // CU20 - Excepción "Formato o tamaño inválido": rechazado por el middleware antes de tocar la BD
    if (err) {
      return res.status(400).json({ mensaje: 'El archivo debe ser una imagen (JPG, PNG o WEBP) de máximo 5MB' });
    }
    // El contenido debe ser realmente una imagen (no basta el tipo que declara el cliente)
    if (req.file && !esImagenValida(req.file.path, req.file.mimetype)) {
      return res.status(400).json({ mensaje: 'El archivo debe ser una imagen (JPG, PNG o WEBP) de máximo 5MB' });
    }
    next();
  });
}, usuarioController.actualizarFotografiaPerfil);

// Cualquier usuario autenticado puede leer su propio perfil
router.get('/', verifyToken, verifyAdmin, usuarioController.getUsuarios);

// CU29: Búsqueda de usuarios con filtros avanzados por rol y estado de cuenta — debe estar ANTES de /:id
router.get('/filtrar', verifyToken, verifyAdmin, usuarioController.getUsuariosPorFiltro);

// CU30 y CU31: Listado y filtros de docentes — Super Admin/Admin
// Listado de docentes: también la etiqueta UTP (horario maestro y horarios por docente)
router.get('/docentes', verifyToken, verifyGestionAcademica, usuarioController.getDocentes);

// CU32 y CU33: Listado y filtros de apoderados — Super Admin/Admin
router.get('/apoderados', verifyToken, verifyAdmin, usuarioController.getApoderados);
router.get('/disponibilidad/opciones', verifyToken, verifyAdmin, disponibilidadLaboral.getOpcionesDisponibilidad);
// Horas P.I.E. del docente y su reparto 65/35 (lo ve también el propio docente)
router.get('/:id/pie', verifyToken, pie.getPIE);
router.put('/:id/pie', verifyToken, verifyAdmin, pie.guardarPIE);
router.get('/:id', verifyToken, usuarioController.getUsuarioById);

// Solo Administrador puede crear, modificar estado o eliminar usuarios
router.post('/', verifyToken, verifyAdmin, verifyPuedeCrearRol, validateCrearUsuario, usuarioController.createUsuario);
router.put('/:id',       verifyToken, verifyAdmin, usuarioController.updateUsuario);
router.put('/:id/estado', verifyToken, verifyAdmin, usuarioController.toggleEstado);
router.delete('/:id',    verifyToken, verifyAdmin, usuarioController.deleteUsuario);

// Asignar un nuevo rol a usuario existente (Admin puede asignar Docente/Apoderado; solo SuperAdmin puede asignar Admin)
// CU107: disponibilidad laboral semanal del docente. Solo el administrador la edita (POST / y
// PUT /:id, campo Docente_Disponibilidad); la consultan el administrador y el propio docente.
router.get('/:id/disponibilidad', verifyToken, disponibilidadLaboral.getDisponibilidad);

router.post('/:id/asignar-rol', verifyToken, verifyAdmin, usuarioController.asignarRol);

// Solo SuperAdmin puede cambiar/revocar roles libremente
router.put('/:id/roles', verifyToken, verifySuperAdmin, usuarioController.updateRoles);
// Etiqueta UTP: la asigna o retira el Super Administrador (Gestión de roles)
router.put('/:id/etiqueta-utp', verifyToken, verifySuperAdmin, usuarioController.cambiarEtiquetaUTP);

module.exports = router;
