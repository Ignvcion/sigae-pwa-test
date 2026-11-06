-- ============================================================================
-- SIGAE — catalogos_base.sql: catálogos mínimos para producción (sin datos de prueba)
-- Se carga UNA vez, después de schema_base.sql. INSERT IGNORE: si un nivel ya
-- existe, no se duplica ni se modifica.
-- Nivel_Educativo_Orden define el nivel siguiente en la promoción (RF61):
-- no cambies el orden de un nivel que ya tiene cursos.
-- El período vigente se fija desde la aplicación (Bloques horarios / parámetros
-- institucionales); si falta, el backend usa el año actual.
-- ============================================================================
USE `sigae`;

INSERT IGNORE INTO `nivel_educativo` (`Nivel_Educativo_Nombre`, `Nivel_Educativo_Orden`) VALUES
  ('Pre-Kinder', 1),
  ('Kinder', 2),
  ('1ero Básico', 3),
  ('2do Básico', 4),
  ('3ero Básico', 5),
  ('4to Básico', 6),
  ('5to Básico', 7),
  ('6to Básico', 8),
  ('7mo Básico', 9),
  ('8vo Básico', 10),
  ('1ero Medio', 11),
  ('2do Medio', 12),
  ('3ero Medio', 13),
  ('4to Medio', 14);
