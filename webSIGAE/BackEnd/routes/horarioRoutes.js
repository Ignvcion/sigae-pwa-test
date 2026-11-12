const express = require('express');
const { verifyToken, verifyGestionAcademica } = require('../middleware/authMiddleware');
const {
  getHorarios,
  getCursos,
  getBloques,
  getAsignaturas,
  getAsignaturasCurso,
  getDocentes,
  getDocentesDisponibles,
  createHorario,
  updateHorario,
  cambiarEstado,
  eliminarHorario,
  restaurarHorario,
  getResumenCursos,
  getAsignacionesDocente,
  getHorarioDocente,
  getHorarioEstudiante,
  getHorarioMaestro,
  filtrarHorarios,
  getBloquesLibres,
  getDetalleBloqueHorario,
  getOpcionesEdicion,
  validarReasignacion,
  reasignarDocente,
  validarCambiosMultiples,
  modificarMultiplesBloques,
  suspenderBloques,
  suspenderJornadaCompleta,
} = require('../controllers/horarioController');

// CU 60-62 — Exportación de horarios (maestro / por docente / por curso)
const {
  exportarMaestro,
  exportarPorDocente,
  exportarPorCurso,
} = require('../controllers/exportController');

const router = express.Router();

// Todos los endpoints requieren autenticación
// Horarios: la escritura, las consultas globales y las suspensiones son de la
// administración y de la etiqueta UTP (utils/permisos.js).
router.use(verifyToken);

// Datos de apoyo para formularios
router.get('/resumen-cursos',        getResumenCursos);
router.get('/cursos',                getCursos);
router.get('/bloques',               getBloques);
router.get('/asignaturas',           getAsignaturas);
router.get('/asignaturas-curso',     getAsignaturasCurso);
router.get('/docentes',              getDocentes);
router.get('/docentes-disponibles',  getDocentesDisponibles);

// CU68 / RF44: Filtrar grilla horaria reactivamente — Super Admin/Admin
// (expone el horario de toda la institución)
router.get('/filtrar', verifyGestionAcademica, filtrarHorarios);

// CU67 / RF43: Consultar bloques horarios libres — Super Admin/Admin
router.get('/bloques-libres', verifyGestionAcademica, getBloquesLibres);

// CU69, CU71 / RF45: Detalle informativo de un bloque horario
// (Admin, o el docente de esa clase: la autorización se resuelve en el controlador)
router.get('/bloque-detalle/:id', getDetalleBloqueHorario);

// CU42: Cursos y asignaturas asignadas a un docente (propias o vistas desde su perfil)
router.get('/docente/:docenteId/asignaciones', getAsignacionesDocente);

// CU43: Horario semanal de un docente a partir de sus cursos asociados (propio o desde su perfil)
router.get('/docente/:docenteId/horario', getHorarioDocente);

// Horario semanal del curso de un estudiante — su apoderado o un Administrador
router.get('/estudiante/:estudianteId/horario', getHorarioEstudiante);

// CU57: vista consolidada del horario de toda la institución — solo Super Admin/Admin
router.get('/maestro', verifyGestionAcademica, getHorarioMaestro);

// Exportación de horarios (CU60, CU61, CU62) — Super Admin/Admin.
router.get('/exportar/maestro',            verifyGestionAcademica, exportarMaestro);
router.get('/exportar/docente/:usuarioId', exportarPorDocente);
router.get('/exportar/curso/:cursoId',     verifyGestionAcademica, exportarPorCurso);

// CRUD horario — solo admin puede crear/editar (CU54)
// Edición masiva de bloques programados — Super Admin/Admin.
// Deben ir antes de '/:id' para no ser capturadas por el parámetro.
// CU63: Reasignando docente en múltiples bloques
router.post('/reasignar-docente/validar', verifyGestionAcademica, validarReasignacion);
router.put('/reasignar-docente',          verifyGestionAcademica, reasignarDocente);
// CU64: Modificando múltiples bloques horarios
router.get('/opciones-edicion',           verifyGestionAcademica, getOpcionesEdicion);
router.post('/multiples/validar',         verifyGestionAcademica, validarCambiosMultiples);
router.put('/multiples',                  verifyGestionAcademica, modificarMultiplesBloques);

// CU65 / CU66 — Suspensión de bloques y de jornada por evento institucional
router.post('/suspender-bloques', verifyGestionAcademica, suspenderBloques);
router.post('/suspender-jornada', verifyGestionAcademica, suspenderJornadaCompleta);

// CRUD horario — solo admin puede crear/editar (CU54); la lectura permite
// el filtrado por rol ya implementado dentro de getHorarios.
router.get('/',            getHorarios);
router.post('/',           verifyGestionAcademica, createHorario);
router.put('/:id',         verifyGestionAcademica, updateHorario);
router.patch('/:id/estado', verifyGestionAcademica, cambiarEstado);
// Eliminar una clase la deja en el listado de eliminadas; desde ahí se restaura
router.delete('/:id',          verifyGestionAcademica, eliminarHorario);
router.patch('/:id/restaurar', verifyGestionAcademica, restaurarHorario);

module.exports = router;