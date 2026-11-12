const express = require('express');
const { verifyToken, verifyAdmin, verifyGestionAcademica } = require('../middleware/authMiddleware');
const {
  getParametros, updateParametros,
  getBloques, createBloque, updateBloque, deleteBloque, deleteMultiplesBloques,
  getEventos, createEvento, updateEvento, deleteEvento,
  getBloquesAfectadosPorEvento, getEventoDetalle,
} = require('../controllers/bloquesController');
const {
  getConflictos, migrarClase, eliminarClase, getImpactoParametros,
} = require('../controllers/conflictosHorarioController');

const router = express.Router();

router.use(verifyToken);

// Parámetros institucionales (CU53) — solo admin
router.get('/parametros',       getParametros);
router.put('/parametros',       verifyAdmin, updateParametros);
// Antes de guardar una nueva jornada: clases que quedarían fuera de ella
router.post('/parametros/impacto', verifyAdmin, getImpactoParametros);

// Clases pendientes de reubicar tras redefinir la jornada o los bloques.
// Deben ir antes de '/:id' para no ser capturadas por el parámetro.
router.get('/conflictos',                    verifyAdmin, getConflictos);
router.put('/conflictos/:horarioId/migrar',  verifyAdmin, migrarClase);
router.delete('/conflictos/:horarioId',      verifyAdmin, eliminarClase);

// Bloques horarios (CU49, CU50, CU51) — solo admin para escritura
// CU51 debe ir antes de '/:id' para no ser capturada por el parámetro
router.get('/',                 getBloques);
router.post('/',                verifyAdmin, createBloque);
router.delete('/multiples',     verifyAdmin, deleteMultiplesBloques);
router.put('/:id',              verifyAdmin, updateBloque);
router.delete('/:id',           verifyAdmin, deleteBloque);

// Eventos institucionales (CU70, CU71, CU72) — escritura: administración y etiqueta UTP.
// Los parámetros, los bloques y las clases por reubicar siguen siendo solo de la administración.
router.get('/eventos',                    getEventos);
router.get('/eventos/:id/afectados',      getBloquesAfectadosPorEvento);
router.get('/eventos/:id',                getEventoDetalle);
router.post('/eventos',                   verifyGestionAcademica, createEvento);
router.put('/eventos/:id',                verifyGestionAcademica, updateEvento);
router.delete('/eventos/:id',             verifyGestionAcademica, deleteEvento);

module.exports = router;