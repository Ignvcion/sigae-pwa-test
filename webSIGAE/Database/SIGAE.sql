CREATE DATABASE  IF NOT EXISTS `sigae` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `sigae`;
-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: sigae
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `afecta`
--

DROP TABLE IF EXISTS `afecta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `afecta` (
  `Afecta_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Estado_Bloque` varchar(50) NOT NULL,
  `Bloque_Horario_Id` int unsigned NOT NULL,
  `Evento_Institucional_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Afecta_Id`),
  KEY `fk_Afecta_Bloque_Horario_idx` (`Bloque_Horario_Id`),
  KEY `fk_Afecta_Evento_Institucional_idx` (`Evento_Institucional_Id`),
  CONSTRAINT `fk_Afecta_Bloque_Horario` FOREIGN KEY (`Bloque_Horario_Id`) REFERENCES `bloque_horario` (`Bloque_Horario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Afecta_Evento_Institucional` FOREIGN KEY (`Evento_Institucional_Id`) REFERENCES `evento_institucional` (`Evento_Institucional_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=111111115 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `afecta`
--

LOCK TABLES `afecta` WRITE;
/*!40000 ALTER TABLE `afecta` DISABLE KEYS */;
INSERT INTO `afecta` VALUES (111111111,'Suspendido',11111111,1111111),(111111112,'Suspendido',11111112,1111112),(111111113,'Suspendido',11111113,1111112),(111111114,'Suspendido',11111114,1111113);
/*!40000 ALTER TABLE `afecta` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `apoderado_suplente`
-- Incremento 4, RF57: suplentes del estudiante, hasta 4 (el titular es estudiante.Apoderado_Usuario_Id)
--

DROP TABLE IF EXISTS `apoderado_suplente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `apoderado_suplente` (
  `Apoderado_Suplente_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Estudiante_Id` int unsigned NOT NULL,
  `Suplente_Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Apoderado_Suplente_Id`),
  UNIQUE KEY `Apoderado_Suplente_Estudiante_Usuario_UNIQUE` (`Estudiante_Id`,`Suplente_Usuario_Id`),
  KEY `fk_Apoderado_Suplente_Usuario_idx` (`Suplente_Usuario_Id`),
  CONSTRAINT `fk_Apoderado_Suplente_Estudiante` FOREIGN KEY (`Estudiante_Id`) REFERENCES `estudiante` (`Estudiante_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_Apoderado_Suplente_Usuario` FOREIGN KEY (`Suplente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `apoderado_suplente`
--

LOCK TABLES `apoderado_suplente` WRITE;
/*!40000 ALTER TABLE `apoderado_suplente` DISABLE KEYS */;
INSERT INTO `apoderado_suplente` VALUES (1,222222222,8);
/*!40000 ALTER TABLE `apoderado_suplente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asignatura`
-- Asignatura_Color: color (#RRGGBB) que la identifica en los horarios; al crearla se asigna
-- al azar de la paleta básica de 12 colores (BackEnd/utils/colores.js) y se cambia en Asignaturas
-- Incremento 4, CU47 (RF28): Asignatura_Es_Electiva marca las asignaturas electivas de 3° y 4°
-- medio: solo van en el plan de electivos, no en planes regulares ni en cursos (RF27, RF33).
--

DROP TABLE IF EXISTS `asignatura`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asignatura` (
  `Asignatura_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Asignatura_Nombre` varchar(100) NOT NULL,
  `Asignatura_Prioridad_Academica` varchar(50) NOT NULL,
  `Asignatura_Es_Electiva` tinyint(1) NOT NULL DEFAULT 0,
  `Asignatura_Color` char(7) NOT NULL DEFAULT '#2563EB',
  PRIMARY KEY (`Asignatura_Id`),
  UNIQUE KEY `Asignatura_Nombre_UNIQUE` (`Asignatura_Nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=2231 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asignatura`
--

LOCK TABLES `asignatura` WRITE;
/*!40000 ALTER TABLE `asignatura` DISABLE KEYS */;
INSERT INTO `asignatura` VALUES (2222,'Matemática','Alta',0,'#DC2626'),(2223,'Lenguaje y Comunicación','Alta',0,'#EA580C'),(2224,'Historia, Geografía y Ciencias Sociales','Media',0,'#CA8A04'),(2225,'Ciencias Naturales','Media',0,'#65A30D'),(2226,'Inglés','Media',0,'#16A34A'),(2227,'Biología de los Ecosistemas','Media',1,'#0D9488'),(2228,'Física','Media',1,'#0284C7'),(2229,'Comprensión Histórica del Presente','Media',1,'#2563EB'),(2230,'Filosofía Política','Media',1,'#4F46E5');
/*!40000 ALTER TABLE `asignatura` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bloque_horario`
--

DROP TABLE IF EXISTS `bloque_horario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bloque_horario` (
  `Bloque_Horario_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Bloque_Horario_Hora_Inicio` time NOT NULL,
  `Bloque_Horario_Tipo` varchar(50) NOT NULL,
  `Bloque_Horario_Hora_Fin` time NOT NULL,
  `Bloque_Horario_Jornada` varchar(50) NOT NULL,
  `Parametro_Institucional_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Bloque_Horario_Id`),
  KEY `fk_Bloque_Horario_Parametro_Institucional_idx` (`Parametro_Institucional_Id`),
  CONSTRAINT `fk_Bloque_Horario_Parametro_Institucional` FOREIGN KEY (`Parametro_Institucional_Id`) REFERENCES `parametro_institucional` (`Parametro_Institucional_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11111115 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bloque_horario`
--

LOCK TABLES `bloque_horario` WRITE;
/*!40000 ALTER TABLE `bloque_horario` DISABLE KEYS */;
INSERT INTO `bloque_horario` VALUES (11111111,'09:15:00','Clase','10:00:00','Mañana',111111),(11111112,'10:00:00','Clase','10:45:00','Mañana',111111),(11111113,'11:00:00','Clase','11:45:00','Mañana',111111),(11111114,'14:00:00','Clase','14:45:00','Tarde',111111);
/*!40000 ALTER TABLE `bloque_horario` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `citacion`
--

DROP TABLE IF EXISTS `citacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `citacion` (
  `Citacion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Citacion_Tramo_Horario` varchar(100) NOT NULL,
  `Citacion_Fecha` date NOT NULL,
  `Citacion_Motivo` text NOT NULL,
  `Citacion_Fecha_Confirmacion` date DEFAULT NULL,
  `Citacion_Observaciones_Posteriores` text,
  `Citacion_Estado` varchar(50) NOT NULL,
  `Citacion_Motivo_Cancelacion` text,
  `Citacion_Modalidad` varchar(50) NOT NULL,
  `Estudiante_Id` int unsigned NOT NULL,
  `Apoderado_Usuario_Id` int unsigned NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  `Citacion_Solicitante_Rol` varchar(50) NOT NULL DEFAULT 'Docente',
  PRIMARY KEY (`Citacion_Id`),
  KEY `fk_Citacion_Estudiante_idx` (`Estudiante_Id`),
  KEY `fk_Citacion_Usuario_idx` (`Apoderado_Usuario_Id`),
  KEY `fk_Citacion_Docente_Usuario_idx` (`Docente_Usuario_Id`),
  CONSTRAINT `fk_Citacion_Apoderado_Usuario` FOREIGN KEY (`Apoderado_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Citacion_Docente_Usuario` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Citacion_Estudiante` FOREIGN KEY (`Estudiante_Id`) REFERENCES `estudiante` (`Estudiante_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `citacion`
--

LOCK TABLES `citacion` WRITE;
/*!40000 ALTER TABLE `citacion` DISABLE KEYS */;
INSERT INTO `citacion` VALUES (33,'17:00 - 17:30','2026-06-20','Bullying',NULL,NULL,'Pendiente de confirmación',NULL,'Presencial',222222222,4,3,'Docente'),(34,'15:00 - 15:30','2026-06-25','Rendimiento académico',NULL,NULL,'Pendiente de confirmación',NULL,'Presencial',222222223,4,3,'Docente'),(35,'16:00 - 16:30','2026-06-27','Inasistencias reiteradas','2026-06-20',NULL,'Confirmada',NULL,'Online',222222224,8,5,'Docente'),(36,'14:00 - 14:30','2026-05-15','Problemas de conducta',NULL,NULL,'Cancelada','El apoderado no pudo asistir por motivos laborales','Presencial',222222225,9,6,'Docente');
/*!40000 ALTER TABLE `citacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clase_electivo`
-- Incremento 4, CU106 (RF34, RF35): electivos de 3° y 4° medio. Se programan en bloques compartidos
-- por todos los cursos de ambos niveles del período; un bloque admite varios electivos simultáneos
-- (de la misma o de distinta ruta): no son conflicto para el curso (RNF17).
--

DROP TABLE IF EXISTS `clase_electivo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clase_electivo` (
  `Clase_Electivo_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Clase_Electivo_Periodo_Lectivo` varchar(10) NOT NULL,
  `Clase_Electivo_Dia_Semana` varchar(20) NOT NULL,
  `Bloque_Horario_Id` int unsigned NOT NULL,
  `Asignatura_Id` int unsigned NOT NULL,
  `Clase_Electivo_Ruta` varchar(20) NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Clase_Electivo_Id`),
  UNIQUE KEY `Clase_Electivo_UNIQUE` (`Clase_Electivo_Periodo_Lectivo`,`Clase_Electivo_Dia_Semana`,`Bloque_Horario_Id`,`Asignatura_Id`,`Clase_Electivo_Ruta`),
  KEY `fk_Clase_Electivo_Bloque_idx` (`Bloque_Horario_Id`),
  KEY `fk_Clase_Electivo_Asignatura_idx` (`Asignatura_Id`),
  KEY `fk_Clase_Electivo_Docente_idx` (`Docente_Usuario_Id`),
  CONSTRAINT `fk_Clase_Electivo_Asignatura` FOREIGN KEY (`Asignatura_Id`) REFERENCES `asignatura` (`Asignatura_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Clase_Electivo_Bloque` FOREIGN KEY (`Bloque_Horario_Id`) REFERENCES `bloque_horario` (`Bloque_Horario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Clase_Electivo_Docente` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_Clase_Electivo_Ruta` CHECK (`Clase_Electivo_Ruta` IN ('Científica','Humanística'))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clase_electivo`
--

LOCK TABLES `clase_electivo` WRITE;
/*!40000 ALTER TABLE `clase_electivo` DISABLE KEYS */;
INSERT INTO `clase_electivo` VALUES (1,'2026','Miércoles',11111113,2227,'Científica',7),(2,'2026','Miércoles',11111113,2229,'Humanística',6);
/*!40000 ALTER TABLE `clase_electivo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `codigo_verificacion`
-- Códigos de verificación de 6 dígitos que envía noreply@colegiojc.cl (utils/codigosVerificacion.js):
-- Recuperacion (CU14), Cambio de correo (CU19) y Activacion (primer ingreso). Se guarda el hash del
-- código con su sal, nunca el código; Codigo_Verificacion_Desafio es el hash del desafío de activación.
--

DROP TABLE IF EXISTS `codigo_verificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `codigo_verificacion` (
  `Codigo_Verificacion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Usuario_Id` int unsigned NOT NULL,
  `Codigo_Verificacion_Proposito` varchar(20) NOT NULL,
  `Codigo_Verificacion_Correo` varchar(100) NOT NULL,
  `Codigo_Verificacion_Hash` char(64) NOT NULL,
  `Codigo_Verificacion_Sal` char(32) NOT NULL,
  `Codigo_Verificacion_Desafio` char(64) DEFAULT NULL,
  `Codigo_Verificacion_Intentos` tinyint unsigned NOT NULL DEFAULT 0,
  `Codigo_Verificacion_Estado` varchar(20) NOT NULL,
  `Codigo_Verificacion_Fecha_Creacion` datetime NOT NULL,
  `Codigo_Verificacion_Fecha_Expiracion` datetime NOT NULL,
  PRIMARY KEY (`Codigo_Verificacion_Id`),
  UNIQUE KEY `Codigo_Verificacion_Desafio_UNIQUE` (`Codigo_Verificacion_Desafio`),
  KEY `fk_Codigo_Verificacion_Usuario_idx` (`Usuario_Id`,`Codigo_Verificacion_Proposito`),
  CONSTRAINT `fk_Codigo_Verificacion_Usuario` FOREIGN KEY (`Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_Codigo_Verificacion_Proposito` CHECK (`Codigo_Verificacion_Proposito` IN ('Recuperacion','Cambio de correo','Activacion')),
  CONSTRAINT `chk_Codigo_Verificacion_Estado` CHECK (`Codigo_Verificacion_Estado` IN ('Pendiente','Utilizado','Expirado','Bloqueado'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conversacion`
-- Incremento 4, RF54 (CU85, CU86): usuario.Docente_Recepcion_Mensajes es la recepción general
-- del docente; Conversacion_Habilitada_Hasta abre las respuestas del apoderado en esta conversación
-- hasta esa fecha y hora, y Conversacion_Habilitada_Citacion_Id la citación desde la que se
-- habilitó (si se cancela, el período se cierra).
--

DROP TABLE IF EXISTS `conversacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversacion` (
  `Conversacion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Conversacion_Fecha_Inicio` date NOT NULL,
  `Conversacion_Estado` tinyint(1) NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  `Apoderado_Usuario_Id` int unsigned NOT NULL,
  `Conversacion_Habilitada_Hasta` datetime DEFAULT NULL,
  `Conversacion_Habilitada_Citacion_Id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`Conversacion_Id`),
  KEY `fk Conversacion_Usuario_idx` (`Docente_Usuario_Id`),
  KEY `fk Conversacion_Apoderado_idx` (`Apoderado_Usuario_Id`),
  KEY `fk_Conversacion_Habilitada_Citacion_idx` (`Conversacion_Habilitada_Citacion_Id`),
  CONSTRAINT `fk_Conversacion_Habilitada_Citacion` FOREIGN KEY (`Conversacion_Habilitada_Citacion_Id`) REFERENCES `citacion` (`Citacion_Id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_Conversacion_Apoderado` FOREIGN KEY (`Apoderado_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Conversacion_Docente` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1115 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversacion`
--

LOCK TABLES `conversacion` WRITE;
/*!40000 ALTER TABLE `conversacion` DISABLE KEYS */;
INSERT INTO `conversacion` VALUES (1111,'2026-04-11',0,3,4,NULL,NULL),(1112,'2026-04-15',1,5,4,NULL,NULL),(1113,'2026-05-01',1,3,8,NULL,NULL);
/*!40000 ALTER TABLE `conversacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `curso`
-- Incremento 4, RF61: cada curso pertenece a un período lectivo (Curso_Periodo_Lectivo);
-- el nombre es único dentro de cada período (puede haber un "2do Básico A" en 2026 y otro en 2027)
--

DROP TABLE IF EXISTS `curso`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `curso` (
  `Curso_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Curso_Seccion` varchar(10) NOT NULL,
  `Curso_Nombre` varchar(100) NOT NULL,
  `Nivel_Educativo_Id` int unsigned NOT NULL,
  `Curso_Profesor_Jefe_Usuario_Id` int unsigned DEFAULT NULL,
  `Curso_Periodo_Lectivo` varchar(10) NOT NULL,
  PRIMARY KEY (`Curso_Id`),
  UNIQUE KEY `Curso_Nombre_Periodo_UNIQUE` (`Curso_Nombre`,`Curso_Periodo_Lectivo`),
  KEY `Curso_Periodo_Lectivo_idx` (`Curso_Periodo_Lectivo`),
  KEY `fk_Curso_Nivel_Educativo_idx` (`Nivel_Educativo_Id`),
  KEY `fk_Curso_Profesor_Jefe_Usuario_idx` (`Curso_Profesor_Jefe_Usuario_Id`),
  CONSTRAINT `fk_Curso_Nivel_Educativo` FOREIGN KEY (`Nivel_Educativo_Id`) REFERENCES `nivel_educativo` (`Nivel_Educativo_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Curso_Profesor_Jefe_Usuario` FOREIGN KEY (`Curso_Profesor_Jefe_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=229 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `curso`
--

LOCK TABLES `curso` WRITE;
/*!40000 ALTER TABLE `curso` DISABLE KEYS */;
INSERT INTO `curso` VALUES (222,'A','1ero Básico A',24,3,'2026'),(223,'B','1ero Básico B',24,5,'2026'),(224,'A','2do Básico A',25,NULL,'2026'),(225,'A','1ero Medio A',32,NULL,'2026'),(226,'A','2do Medio A',33,NULL,'2026'),(227,'A','3ero Medio A',34,NULL,'2026'),(228,'A','4to Medio A',35,NULL,'2026');
/*!40000 ALTER TABLE `curso` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `disponibilidad_docente`
-- Incremento 4, CU107 (RF04, RF35): disponibilidad laboral del docente. Patrón semanal
-- por período: cada fila es un tramo horario (desde-hasta) de un día en que el docente
-- trabaja en el colegio, con recreos y horas sin clases incluidos. Un bloque de clase
-- está disponible si cae completo dentro de un tramo. Sin filas en un período: sin restricción.
--

DROP TABLE IF EXISTS `disponibilidad_docente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `disponibilidad_docente` (
  `Disponibilidad_Docente_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Disponibilidad_Docente_Periodo_Lectivo` varchar(10) NOT NULL,
  `Disponibilidad_Docente_Dia_Semana` varchar(20) NOT NULL,
  `Disponibilidad_Docente_Hora_Inicio` time NOT NULL,
  `Disponibilidad_Docente_Hora_Fin` time NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Disponibilidad_Docente_Id`),
  UNIQUE KEY `Disponibilidad_Docente_UNIQUE` (`Docente_Usuario_Id`,`Disponibilidad_Docente_Periodo_Lectivo`,`Disponibilidad_Docente_Dia_Semana`,`Disponibilidad_Docente_Hora_Inicio`),
  KEY `Disponibilidad_Docente_Periodo_idx` (`Disponibilidad_Docente_Periodo_Lectivo`),
  CONSTRAINT `fk_Disponibilidad_Docente_Usuario` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `disponibilidad_docente`
--

LOCK TABLES `disponibilidad_docente` WRITE;
/*!40000 ALTER TABLE `disponibilidad_docente` DISABLE KEYS */;
INSERT INTO `disponibilidad_docente` VALUES (1,'2026','Lunes','09:00:00','12:00:00',5),(2,'2026','Martes','09:00:00','12:00:00',5),(3,'2026','Miércoles','09:00:00','12:00:00',5),(4,'2026','Jueves','09:00:00','12:00:00',5);
/*!40000 ALTER TABLE `disponibilidad_docente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `docente_especialidad`
-- Incremento 4, RF04: especialidades de cada docente (etiquetas del catálogo `especialidad`).
-- usuario.Docente_Especialidad guarda el resumen en texto ("A, B") para los listados.
--

DROP TABLE IF EXISTS `docente_especialidad`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `docente_especialidad` (
  `Docente_Usuario_Id` int unsigned NOT NULL,
  `Especialidad_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Docente_Usuario_Id`,`Especialidad_Id`),
  KEY `fk_Docente_Especialidad_Especialidad_idx` (`Especialidad_Id`),
  CONSTRAINT `fk_Docente_Especialidad_Especialidad` FOREIGN KEY (`Especialidad_Id`) REFERENCES `especialidad` (`Especialidad_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_Docente_Especialidad_Usuario` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `docente_especialidad`
--

LOCK TABLES `docente_especialidad` WRITE;
/*!40000 ALTER TABLE `docente_especialidad` DISABLE KEYS */;
INSERT INTO `docente_especialidad` VALUES (3,1),(5,2),(6,3),(7,4),(10,5);
/*!40000 ALTER TABLE `docente_especialidad` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `especialidad`
-- Incremento 4, RF04: catálogo de especialidades docentes. Se llena solo al asignar
-- especialidades a un docente (como etiquetas); el nombre es único sin distinguir
-- mayúsculas ni tildes (collation utf8mb4_unicode_ci).
--

DROP TABLE IF EXISTS `especialidad`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `especialidad` (
  `Especialidad_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Especialidad_Nombre` varchar(40) NOT NULL,
  PRIMARY KEY (`Especialidad_Id`),
  UNIQUE KEY `Especialidad_Nombre_UNIQUE` (`Especialidad_Nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `especialidad`
--

LOCK TABLES `especialidad` WRITE;
/*!40000 ALTER TABLE `especialidad` DISABLE KEYS */;
INSERT INTO `especialidad` VALUES (1,'Matemáticas'),(2,'Lenguaje'),(3,'Historia'),(4,'Ciencias'),(5,'Inglés');
/*!40000 ALTER TABLE `especialidad` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `estudiante`
-- Incremento 4, CU105 (RF23): Estudiante_Ruta_Formacion, decidida en 2° medio (Científica,
-- Humanística o Técnica). La Técnica es solo una marca, sin efecto en horarios ni electivos.
--

DROP TABLE IF EXISTS `estudiante`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `estudiante` (
  `Estudiante_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Estudiante_Nombre_Completo` varchar(100) NOT NULL,
  `Estudiante_RUT` varchar(20) NOT NULL,
  `Estudiante_Estado_Academico` varchar(50) NOT NULL,
  `Curso_Id` int unsigned NOT NULL,
  `Apoderado_Usuario_Id` int unsigned DEFAULT NULL,
  `Estudiante_Fecha_Eliminacion` datetime DEFAULT NULL,
  `Estudiante_Calle` varchar(100) DEFAULT NULL,
  `Estudiante_Numero` varchar(10) DEFAULT NULL,
  `Estudiante_Depto` varchar(20) DEFAULT NULL,
  `Estudiante_Comuna` varchar(60) DEFAULT NULL,
  `Estudiante_Ruta_Formacion` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`Estudiante_Id`),
  UNIQUE KEY `Estudiante_RUT_UNIQUE` (`Estudiante_RUT`),
  KEY `fk_Estudiante_Curso_idx` (`Curso_Id`),
  KEY `fk_Estudiante_Apoderado_idx` (`Apoderado_Usuario_Id`),
  CONSTRAINT `fk_Estudiante_Apoderado` FOREIGN KEY (`Apoderado_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Estudiante_Curso` FOREIGN KEY (`Curso_Id`) REFERENCES `curso` (`Curso_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_Estudiante_Ruta_Formacion` CHECK (`Estudiante_Ruta_Formacion` IN ('Científica','Humanística','Técnica'))
) ENGINE=InnoDB AUTO_INCREMENT=222222230 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `estudiante`
--

LOCK TABLES `estudiante` WRITE;
/*!40000 ALTER TABLE `estudiante` DISABLE KEYS */;
INSERT INTO `estudiante` VALUES (222222222,'Diego Martin Perez Castro','268283655','Regular',222,4,NULL,NULL,NULL,NULL,NULL,NULL),(222222223,'Valentina Paz Ramos González','212345678-9','Regular',222,4,NULL,NULL,NULL,NULL,NULL,NULL),(222222224,'Matías Alejandro Vera López','223456789-0','Regular',223,8,NULL,NULL,NULL,NULL,NULL,NULL),(222222225,'Isabella Fernanda Campos Silva','234567890-1','Regular',223,9,NULL,NULL,NULL,NULL,NULL,NULL),(222222226,'Sebastián Andrés Torres Díaz','245678901-2','Regular',224,8,NULL,NULL,NULL,NULL,NULL,NULL),(222222227,'Catalina Ignacia Morales Vega','256789012-3','Irregular',225,10,NULL,NULL,NULL,NULL,NULL,NULL),(222222228,'Tomás Ignacio Rojas Pérez','20123456-7','Regular',227,9,NULL,NULL,NULL,NULL,NULL,'Científica'),(222222229,'Florencia Andrea Soto Muñoz','19876543-2','Regular',228,9,NULL,NULL,NULL,NULL,NULL,'Humanística');
/*!40000 ALTER TABLE `estudiante` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `evaluacion`
-- Incremento 4, RF58 y RF59: calendario de evaluaciones
--

DROP TABLE IF EXISTS `evaluacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evaluacion` (
  `Evaluacion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Evaluacion_Fecha` date NOT NULL,
  `Evaluacion_Tipo` varchar(50) NOT NULL,
  `Evaluacion_Contenidos` text NOT NULL,
  `Curso_Id` int unsigned NOT NULL,
  `Asignatura_Id` int unsigned NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Evaluacion_Id`),
  KEY `Evaluacion_Curso_Fecha_idx` (`Curso_Id`,`Evaluacion_Fecha`),
  KEY `fk_Evaluacion_Asignatura_idx` (`Asignatura_Id`),
  KEY `fk_Evaluacion_Docente_Usuario_idx` (`Docente_Usuario_Id`),
  CONSTRAINT `fk_Evaluacion_Asignatura` FOREIGN KEY (`Asignatura_Id`) REFERENCES `asignatura` (`Asignatura_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Evaluacion_Curso` FOREIGN KEY (`Curso_Id`) REFERENCES `curso` (`Curso_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Evaluacion_Docente_Usuario` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evaluacion`
--

LOCK TABLES `evaluacion` WRITE;
/*!40000 ALTER TABLE `evaluacion` DISABLE KEYS */;
INSERT INTO `evaluacion` VALUES (1,'2026-11-20','Prueba','Unidad 3: fracciones y números decimales',222,2222,3),(2,'2026-11-24','Control','Comprensión lectora: texto narrativo',222,2223,5);
/*!40000 ALTER TABLE `evaluacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `evento_institucional`
--

DROP TABLE IF EXISTS `evento_institucional`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evento_institucional` (
  `Evento_Institucional_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Evento_Institucional_Impacto_Clases` varchar(100) NOT NULL,
  `Evento_Institucional_Fecha` date NOT NULL,
  `Evento_Institucional_Nombre` varchar(100) NOT NULL,
  `Evento_Institucional_Descripcion` text NOT NULL,
  PRIMARY KEY (`Evento_Institucional_Id`)
) ENGINE=InnoDB AUTO_INCREMENT=1111114 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evento_institucional`
--

LOCK TABLES `evento_institucional` WRITE;
/*!40000 ALTER TABLE `evento_institucional` DISABLE KEYS */;
INSERT INTO `evento_institucional` VALUES (1111111,'Salida anticipada','2026-12-10','Licenciatura 4tos Medios','Ceremonia de graduación de estudiantes de 4to año medio'),(1111112,'Suspensión total','2026-07-15','Consejo de Profesores','Reunión semestral de evaluación docente'),(1111113,'Salida anticipada','2026-08-20','Acto Patrio','Celebración fiestas patrias');
/*!40000 ALTER TABLE `evento_institucional` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `historial`
--

DROP TABLE IF EXISTS `historial`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `historial` (
  `Historial_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Historial_Valor_Anterior` text NOT NULL,
  `Historial_Hora_Registro` time NOT NULL,
  `Historial_Descripcion_Cambio` text NOT NULL,
  `Historial_Atributo_Modificado` varchar(100) NOT NULL,
  `Historial_Valor_Nuevo` text NOT NULL,
  `Historial_Fecha_Registro` date NOT NULL,
  `Usuario_Id` int unsigned DEFAULT NULL,
  `Estudiante_Id` int unsigned DEFAULT NULL,
  `Citacion_Id` int unsigned DEFAULT NULL,
  `Horario_Asignatura_Id` int unsigned DEFAULT NULL,
  `Usuario_Responsable_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Historial_Id`),
  KEY `fk_Historial_Usuario_idx` (`Usuario_Id`),
  KEY `fk_Historial_Estudiante_idx` (`Estudiante_Id`),
  KEY `fk_Historial_Citacion_idx` (`Citacion_Id`),
  KEY `fk_Historial_Horario_Asignatura_idx` (`Horario_Asignatura_Id`),
  KEY `fk_Historial_Usuario_Responsable_idx` (`Usuario_Responsable_Id`),
  CONSTRAINT `fk_Historial_Citacion` FOREIGN KEY (`Citacion_Id`) REFERENCES `citacion` (`Citacion_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Historial_Estudiante` FOREIGN KEY (`Estudiante_Id`) REFERENCES `estudiante` (`Estudiante_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Historial_Horario_Asignatura` FOREIGN KEY (`Horario_Asignatura_Id`) REFERENCES `horario_asignatura` (`Horario_Asignatura_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Historial_Usuario` FOREIGN KEY (`Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Historial_Usuario_Responsable` FOREIGN KEY (`Usuario_Responsable_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=337 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `historial`
--

LOCK TABLES `historial` WRITE;
/*!40000 ALTER TABLE `historial` DISABLE KEYS */;
INSERT INTO `historial` VALUES (333,'979746782','16:00:00','Cambio de número de teléfono','Usuario_Telefono','923465924','2026-06-16',2,NULL,NULL,NULL,1),(334,'Regular','10:00:00','Cambio de estado académico','Estudiante_Estado_Academico','Irregular','2026-05-20',NULL,222222227,NULL,NULL,1),(335,'Pendiente de confirmación','11:00:00','Confirmación de citación','Citacion_Estado','Confirmada','2026-06-20',NULL,NULL,35,NULL,2),(336,'Activo','12:00:00','Suspensión de bloque horario','Horario_Asignatura_Estado','Suspendido','2026-07-14',NULL,NULL,NULL,222227,1);
/*!40000 ALTER TABLE `historial` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `horario_asignatura`
--

DROP TABLE IF EXISTS `horario_asignatura`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `horario_asignatura` (
  `Horario_Asignatura_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Horario_Asignatura_Dia_Semana` varchar(20) NOT NULL,
  `Horario_Asignatura_Estado` varchar(50) NOT NULL,
  `Curso_Id` int unsigned NOT NULL,
  `Usuario_Id` int unsigned DEFAULT NULL,
  `Bloque_Horario_Id` int unsigned NOT NULL,
  `Asignatura_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Horario_Asignatura_Id`),
  KEY `fk_Horario_Asignatura_Curso_idx` (`Curso_Id`),
  KEY `fk_Horario_Asignatura_Usuario_idx` (`Usuario_Id`),
  KEY `fk_Horario_Asignatura_Bloque_Horario_idx` (`Bloque_Horario_Id`),
  KEY `fk_Horario_Asignatura_Asignatura_idx` (`Asignatura_Id`),
  CONSTRAINT `fk_Horario_Asignatura_Asignatura` FOREIGN KEY (`Asignatura_Id`) REFERENCES `asignatura` (`Asignatura_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Horario_Asignatura_Bloque_Horario` FOREIGN KEY (`Bloque_Horario_Id`) REFERENCES `bloque_horario` (`Bloque_Horario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Horario_Asignatura_Curso` FOREIGN KEY (`Curso_Id`) REFERENCES `curso` (`Curso_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Horario_Asignatura_Usuario` FOREIGN KEY (`Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=222228 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `horario_asignatura`
--

LOCK TABLES `horario_asignatura` WRITE;
/*!40000 ALTER TABLE `horario_asignatura` DISABLE KEYS */;
INSERT INTO `horario_asignatura` VALUES (222222,'Lunes','Activo',222,3,11111111,2222),(222223,'Martes','Activo',222,5,11111112,2223),(222224,'Miércoles','Activo',223,3,11111111,2222),(222225,'Jueves','Activo',223,5,11111113,2223),(222226,'Viernes','Activo',224,6,11111114,2222),(222227,'Lunes','Suspendido',225,10,11111112,2224);
/*!40000 ALTER TABLE `horario_asignatura` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `horario_atencion`
-- Incremento 4, RF55: horario de atención de apoderados del docente
--

DROP TABLE IF EXISTS `horario_atencion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `horario_atencion` (
  `Horario_Atencion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Horario_Atencion_Dia_Semana` varchar(20) NOT NULL,
  `Horario_Atencion_Hora_Inicio` time NOT NULL,
  `Horario_Atencion_Hora_Fin` time NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Horario_Atencion_Id`),
  UNIQUE KEY `Horario_Atencion_Docente_Dia_Inicio_UNIQUE` (`Docente_Usuario_Id`,`Horario_Atencion_Dia_Semana`,`Horario_Atencion_Hora_Inicio`),
  CONSTRAINT `fk_Horario_Atencion_Docente_Usuario` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_Horario_Atencion_Horas` CHECK (`Horario_Atencion_Hora_Inicio` < `Horario_Atencion_Hora_Fin`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `horario_atencion`
--

LOCK TABLES `horario_atencion` WRITE;
/*!40000 ALTER TABLE `horario_atencion` DISABLE KEYS */;
INSERT INTO `horario_atencion` VALUES (1,'Martes','14:00:00','16:00:00',3),(2,'Jueves','15:00:00','17:00:00',3);
/*!40000 ALTER TABLE `horario_atencion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `incluyeasig`
--

DROP TABLE IF EXISTS `incluyeasig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incluyeasig` (
  `IncluyeAsig_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Horas_Semanales_Requeridas` int NOT NULL,
  `Tipo` varchar(50) NOT NULL,
  `Asignatura_Id` int unsigned NOT NULL,
  `Plan_Educativo_Id` int unsigned NOT NULL,
  PRIMARY KEY (`IncluyeAsig_Id`),
  KEY `fk_IncluyeAsig_Asignatura_idx` (`Asignatura_Id`),
  KEY `fk_IncluyeAsig_Plan_Educativo_idx` (`Plan_Educativo_Id`),
  CONSTRAINT `fk_IncluyeAsig_Asignatura` FOREIGN KEY (`Asignatura_Id`) REFERENCES `asignatura` (`Asignatura_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_IncluyeAsig_Plan_Educativo` FOREIGN KEY (`Plan_Educativo_Id`) REFERENCES `plan_educativo` (`Plan_Educativo_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22222229 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `incluyeasig`
--

LOCK TABLES `incluyeasig` WRITE;
/*!40000 ALTER TABLE `incluyeasig` DISABLE KEYS */;
INSERT INTO `incluyeasig` VALUES (22222222,6,'Obligatorio',2222,2222222),(22222223,6,'Obligatorio',2223,2222222),(22222224,4,'Obligatorio',2224,2222222),(22222225,6,'Obligatorio',2222,2222223),(22222226,4,'Obligatorio',2223,2222223),(22222227,6,'Obligatorio',2222,2222224),(22222228,4,'Obligatorio',2225,2222224);
/*!40000 ALTER TABLE `incluyeasig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mensaje`
--

DROP TABLE IF EXISTS `mensaje`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mensaje` (
  `Mensaje_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Mensaje_Contenido` text NOT NULL,
  `Mensaje_Fecha_Envio` date NOT NULL,
  `Mensaje_Hora_Envio` time NOT NULL,
  `Mensaje_Estado` varchar(50) NOT NULL,
  `Mensaje_Remitente_Rol` varchar(50) NOT NULL,
  `Conversacion_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Mensaje_Id`),
  KEY `fk_Mensaje_Conversacion_idx` (`Conversacion_Id`),
  CONSTRAINT `fk_Mensaje_Conversacion` FOREIGN KEY (`Conversacion_Id`) REFERENCES `conversacion` (`Conversacion_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11116 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mensaje`
--

LOCK TABLES `mensaje` WRITE;
/*!40000 ALTER TABLE `mensaje` DISABLE KEYS */;
INSERT INTO `mensaje` VALUES (11111,'Muchas gracias profesor por la información','2026-04-11','09:30:05','Leído','Apoderado',1111),(11112,'Buenos días, quería consultar sobre las notas de Valentina','2026-04-15','09:00:00','Leído','Apoderado',1112),(11113,'Claro, Valentina tiene un rendimiento muy bueno este semestre','2026-04-15','09:15:00','Leído','Docente',1112),(11114,'Necesito hablar sobre el comportamiento de Matías','2026-05-01','10:00:00','Leído','Docente',1113),(11115,'De acuerdo, ¿cuándo podríamos reunirnos?','2026-05-01','10:30:00','No leído','Apoderado',1113);
/*!40000 ALTER TABLE `mensaje` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `nivel_educativo`
-- Incremento 4, RF61: Nivel_Educativo_Orden define el nivel siguiente (Pre-Kinder = 1 ... 4to Medio = 14)
--

DROP TABLE IF EXISTS `nivel_educativo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nivel_educativo` (
  `Nivel_Educativo_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Nivel_Educativo_Nombre` varchar(100) NOT NULL,
  `Nivel_Educativo_Orden` int unsigned NOT NULL,
  PRIMARY KEY (`Nivel_Educativo_Id`),
  UNIQUE KEY `Nivel_Educativo_Nombre_UNIQUE` (`Nivel_Educativo_Nombre`),
  UNIQUE KEY `Nivel_Educativo_Orden_UNIQUE` (`Nivel_Educativo_Orden`)
) ENGINE=InnoDB AUTO_INCREMENT=110 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nivel_educativo`
--

LOCK TABLES `nivel_educativo` WRITE;
/*!40000 ALTER TABLE `nivel_educativo` DISABLE KEYS */;
INSERT INTO `nivel_educativo` VALUES (24,'1ero Básico',3),(32,'1ero Medio',11),(25,'2do Básico',4),(33,'2do Medio',12),(26,'3ero Básico',5),(34,'3ero Medio',13),(27,'4to Básico',6),(35,'4to Medio',14),(28,'5to Básico',7),(29,'6to Básico',8),(30,'7mo Básico',9),(31,'8vo Básico',10),(23,'Kinder',2),(22,'Pre-Kinder',1);
/*!40000 ALTER TABLE `nivel_educativo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notificacion`
-- Incremento 4, RF62 (reserva): notificaciones en la plataforma
--

DROP TABLE IF EXISTS `notificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificacion` (
  `Notificacion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Notificacion_Tipo` varchar(50) NOT NULL,
  `Notificacion_Fecha_Hora` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Notificacion_Leida` tinyint(1) NOT NULL DEFAULT 0,
  `Usuario_Id` int unsigned NOT NULL,
  `Mensaje_Id` int unsigned DEFAULT NULL,
  `Citacion_Id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`Notificacion_Id`),
  KEY `Notificacion_Usuario_Leida_idx` (`Usuario_Id`,`Notificacion_Leida`),
  KEY `fk_Notificacion_Mensaje_idx` (`Mensaje_Id`),
  KEY `fk_Notificacion_Citacion_idx` (`Citacion_Id`),
  CONSTRAINT `fk_Notificacion_Citacion` FOREIGN KEY (`Citacion_Id`) REFERENCES `citacion` (`Citacion_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_Notificacion_Mensaje` FOREIGN KEY (`Mensaje_Id`) REFERENCES `mensaje` (`Mensaje_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_Notificacion_Usuario` FOREIGN KEY (`Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notificacion`
--

LOCK TABLES `notificacion` WRITE;
/*!40000 ALTER TABLE `notificacion` DISABLE KEYS */;
INSERT INTO `notificacion` VALUES (1,'Mensaje nuevo','2026-11-05 09:15:00',0,3,11111,NULL),(2,'Cambio de estado de citación','2026-11-05 09:20:00',0,8,NULL,35);
/*!40000 ALTER TABLE `notificacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parametro_institucional`
-- Incremento 4, RF61: Periodo_Vigente es el año escolar en curso; Periodo_Siguiente se llena
-- con "Iniciar cierre" y vuelve a NULL con "Iniciar nuevo período"
-- Incremento 4 (cambios de esquema, punto 1): Estado_Cierre es una columna generada a partir
-- de Periodo_Siguiente: 'Cierre iniciado' mientras existe un período siguiente.
--

DROP TABLE IF EXISTS `parametro_institucional`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parametro_institucional` (
  `Parametro_Institucional_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Parametro_Institucional_Duracion_Bloque` int NOT NULL,
  `Parametro_Institucional_Inicio_Jornada` time NOT NULL,
  `Parametro_Institucional_Fin_Jornada` time NOT NULL,
  `Parametro_Institucional_Bloques_Maximos_Diarios` int NOT NULL,
  `Parametro_Institucional_Duracion_Recreo` int NOT NULL,
  `Parametro_Institucional_Periodo_Vigente` varchar(10) DEFAULT NULL,
  `Parametro_Institucional_Periodo_Siguiente` varchar(10) DEFAULT NULL,
  `Parametro_Institucional_Estado_Cierre` varchar(20) GENERATED ALWAYS AS (if(`Parametro_Institucional_Periodo_Siguiente` is null,'Sin cierre','Cierre iniciado')) VIRTUAL,
  PRIMARY KEY (`Parametro_Institucional_Id`)
) ENGINE=InnoDB AUTO_INCREMENT=111114 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parametro_institucional`
--

LOCK TABLES `parametro_institucional` WRITE;
/*!40000 ALTER TABLE `parametro_institucional` DISABLE KEYS */;
INSERT INTO `parametro_institucional` VALUES (111111,45,'08:30:00','16:30:00',8,15,'2026',NULL,DEFAULT);
/*!40000 ALTER TABLE `parametro_institucional` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plan_educativo`
--

DROP TABLE IF EXISTS `plan_educativo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_educativo` (
  `Plan_Educativo_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Plan_Educativo_Periodo_Lectivo` varchar(50) NOT NULL,
  `Nivel_Educativo_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Plan_Educativo_Id`),
  KEY `fk_Plan_Educativo_Nivel_Educativo_idx` (`Nivel_Educativo_Id`),
  CONSTRAINT `fk_Plan_Educativo_Nivel_Educativo` FOREIGN KEY (`Nivel_Educativo_Id`) REFERENCES `nivel_educativo` (`Nivel_Educativo_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2222226 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plan_educativo`
--

LOCK TABLES `plan_educativo` WRITE;
/*!40000 ALTER TABLE `plan_educativo` DISABLE KEYS */;
INSERT INTO `plan_educativo` VALUES (2222222,'2026',24),(2222223,'2026',25),(2222224,'2026',32),(2222225,'2026',33);
/*!40000 ALTER TABLE `plan_educativo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plan_electivos`
-- Incremento 4, CU108 (RF27): plan de electivos, único por período y común a 3° y 4° medio.
--

DROP TABLE IF EXISTS `plan_electivos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_electivos` (
  `Plan_Electivos_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Plan_Electivos_Periodo_Lectivo` varchar(10) NOT NULL,
  PRIMARY KEY (`Plan_Electivos_Id`),
  UNIQUE KEY `Plan_Electivos_Periodo_UNIQUE` (`Plan_Electivos_Periodo_Lectivo`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plan_electivos`
--

LOCK TABLES `plan_electivos` WRITE;
/*!40000 ALTER TABLE `plan_electivos` DISABLE KEYS */;
INSERT INTO `plan_electivos` VALUES (1,'2026');
/*!40000 ALTER TABLE `plan_electivos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plan_electivos_asignatura`
-- Incremento 4, CU108: asignaturas electivas del plan por ruta (Científica o Humanística) y sus horas
-- semanales. Ambas rutas ocupan los mismos bloques, por eso deberían sumar las mismas horas.
--

DROP TABLE IF EXISTS `plan_electivos_asignatura`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_electivos_asignatura` (
  `Plan_Electivos_Asignatura_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Plan_Electivos_Id` int unsigned NOT NULL,
  `Asignatura_Id` int unsigned NOT NULL,
  `Plan_Electivos_Asignatura_Ruta` varchar(20) NOT NULL,
  `Plan_Electivos_Asignatura_Horas` int NOT NULL,
  PRIMARY KEY (`Plan_Electivos_Asignatura_Id`),
  UNIQUE KEY `Plan_Electivos_Asignatura_UNIQUE` (`Plan_Electivos_Id`,`Asignatura_Id`,`Plan_Electivos_Asignatura_Ruta`),
  KEY `fk_Plan_Electivos_Asignatura_Asignatura_idx` (`Asignatura_Id`),
  CONSTRAINT `fk_Plan_Electivos_Asignatura_Asignatura` FOREIGN KEY (`Asignatura_Id`) REFERENCES `asignatura` (`Asignatura_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Plan_Electivos_Asignatura_Plan` FOREIGN KEY (`Plan_Electivos_Id`) REFERENCES `plan_electivos` (`Plan_Electivos_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_Plan_Electivos_Asignatura_Ruta` CHECK (`Plan_Electivos_Asignatura_Ruta` IN ('Científica','Humanística')),
  CONSTRAINT `chk_Plan_Electivos_Asignatura_Horas` CHECK (`Plan_Electivos_Asignatura_Horas` >= 1)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plan_electivos_asignatura`
--

LOCK TABLES `plan_electivos_asignatura` WRITE;
/*!40000 ALTER TABLE `plan_electivos_asignatura` DISABLE KEYS */;
INSERT INTO `plan_electivos_asignatura` VALUES (1,1,2227,'Científica',3),(2,1,2228,'Científica',3),(3,1,2229,'Humanística',3),(4,1,2230,'Humanística',3);
/*!40000 ALTER TABLE `plan_electivos_asignatura` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plan_electivos_docente`
-- Incremento 4, CU108: docentes habilitados para cada asignatura y ruta del plan de electivos.
--

DROP TABLE IF EXISTS `plan_electivos_docente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_electivos_docente` (
  `Plan_Electivos_Asignatura_Id` int unsigned NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Plan_Electivos_Asignatura_Id`,`Docente_Usuario_Id`),
  KEY `fk_Plan_Electivos_Docente_Usuario_idx` (`Docente_Usuario_Id`),
  CONSTRAINT `fk_Plan_Electivos_Docente_Asignatura` FOREIGN KEY (`Plan_Electivos_Asignatura_Id`) REFERENCES `plan_electivos_asignatura` (`Plan_Electivos_Asignatura_Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_Plan_Electivos_Docente_Usuario` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plan_electivos_docente`
--

LOCK TABLES `plan_electivos_docente` WRITE;
/*!40000 ALTER TABLE `plan_electivos_docente` DISABLE KEYS */;
INSERT INTO `plan_electivos_docente` VALUES (1,7),(2,7),(3,6),(4,6);
/*!40000 ALTER TABLE `plan_electivos_docente` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sesion`
--

DROP TABLE IF EXISTS `sesion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sesion` (
  `Sesion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Sesion_Token_Acceso` varchar(255) NOT NULL,
  `Sesion_Fecha_Inicio` datetime NOT NULL,
  `Sesion_Fecha_Expiracion` datetime DEFAULT NULL,
  `Sesion_Direccion_IP` varchar(45) NOT NULL,
  `Sesion_Estado` tinyint(1) NOT NULL,
  `Sesion_Dispositivo` varchar(100) NOT NULL,
  `Sesion_Token_Expiracion` datetime NOT NULL,
  `Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Sesion_Id`),
  UNIQUE KEY `Sesion_Token_Acceso_UNIQUE` (`Sesion_Token_Acceso`),
  KEY `fk_Sesion_Usuario_idx` (`Usuario_Id`),
  CONSTRAINT `fk_Sesion_Usuario` FOREIGN KEY (`Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sesion`
--

LOCK TABLES `sesion` WRITE;
/*!40000 ALTER TABLE `sesion` DISABLE KEYS */;
INSERT INTO `sesion` VALUES (11,'Token001','2026-05-24 08:00:00','2026-05-24 10:00:00','192.168.1.10',0,'Computador','2026-05-24 10:00:00',1),(12,'Token002','2026-05-25 08:00:00','2026-05-25 10:00:00','192.168.1.11',1,'Celular','2026-05-25 10:00:00',3),(13,'Token003','2026-05-25 09:00:00','2026-05-25 11:00:00','192.168.1.12',0,'Computador','2026-05-25 11:00:00',4),(14,'Token004','2026-05-26 08:30:00',NULL,'192.168.1.13',1,'Tablet','2026-05-26 10:30:00',5);
/*!40000 ALTER TABLE `sesion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `situacion_final`
-- Incremento 4, RF61 (por confirmar): situación final de los estudiantes
--

DROP TABLE IF EXISTS `situacion_final`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `situacion_final` (
  `Situacion_Final_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Situacion_Final_Periodo_Lectivo` varchar(50) NOT NULL,
  `Situacion_Final_Valor` varchar(20) NOT NULL,
  `Situacion_Final_Estado` varchar(20) NOT NULL DEFAULT 'Borrador',
  `Situacion_Final_Fecha_Registro` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Estudiante_Id` int unsigned NOT NULL,
  `Curso_Id` int unsigned NOT NULL,
  `Usuario_Responsable_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Situacion_Final_Id`),
  UNIQUE KEY `Situacion_Final_Estudiante_Periodo_UNIQUE` (`Estudiante_Id`,`Situacion_Final_Periodo_Lectivo`),
  KEY `Situacion_Final_Curso_Periodo_idx` (`Curso_Id`,`Situacion_Final_Periodo_Lectivo`),
  KEY `fk_Situacion_Final_Usuario_Responsable_idx` (`Usuario_Responsable_Id`),
  CONSTRAINT `fk_Situacion_Final_Curso` FOREIGN KEY (`Curso_Id`) REFERENCES `curso` (`Curso_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Situacion_Final_Estudiante` FOREIGN KEY (`Estudiante_Id`) REFERENCES `estudiante` (`Estudiante_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Situacion_Final_Usuario_Responsable` FOREIGN KEY (`Usuario_Responsable_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `situacion_final`
--

LOCK TABLES `situacion_final` WRITE;
/*!40000 ALTER TABLE `situacion_final` DISABLE KEYS */;
INSERT INTO `situacion_final` VALUES (1,'2026','Promovido','Borrador','2026-11-05 10:00:00',222222222,222,3),(2,'2026','Repitente','Borrador','2026-11-05 10:00:00',222222223,222,3);
/*!40000 ALTER TABLE `situacion_final` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `solicitud_recuperacion`
--

DROP TABLE IF EXISTS `solicitud_recuperacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `solicitud_recuperacion` (
  `Solicitud_Recuperacion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Solicitud_Recuperacion_Fecha_Expiracion` datetime NOT NULL,
  `Solicitud_Recuperacion_Token` varchar(255) NOT NULL,
  `Solicitud_Recuperacion_Fecha_Creacion` datetime NOT NULL,
  `Solicitud_Recuperacion_Estado` varchar(50) NOT NULL,
  `Usuario_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Solicitud_Recuperacion_Id`),
  UNIQUE KEY `Solicitud_Recuperacion_Token_UNIQUE` (`Solicitud_Recuperacion_Token`),
  KEY `fk_Solicitud_Recuperacion_Usuario_idx` (`Usuario_Id`),
  CONSTRAINT `fk_Solicitud_Recuperacion_Usuario` FOREIGN KEY (`Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=114 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `solicitud_recuperacion`
--

LOCK TABLES `solicitud_recuperacion` WRITE;
/*!40000 ALTER TABLE `solicitud_recuperacion` DISABLE KEYS */;
INSERT INTO `solicitud_recuperacion` VALUES (111,'2026-05-24 20:00:00','RecuP001','2026-05-24 19:30:00','En Proceso',2),(112,'2026-05-25 20:00:00','RecuP002','2026-05-25 19:30:00','Utilizado',3),(113,'2026-05-26 10:00:00','RecuP003','2026-05-26 09:30:00','Expirado',5);
/*!40000 ALTER TABLE `solicitud_recuperacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tieneasig`
--

DROP TABLE IF EXISTS `tieneasig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tieneasig` (
  `tieneasig_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Estado_Asignacion` varchar(50) NOT NULL,
  `Curso_Id` int unsigned NOT NULL,
  `Asignatura_Id` int unsigned NOT NULL,
  PRIMARY KEY (`tieneasig_Id`),
  KEY `fk_TieneAsig_Curso_idx` (`Curso_Id`),
  KEY `fk_TieneAsig_Asignatura_idx` (`Asignatura_Id`),
  CONSTRAINT `fk_TieneAsig_Asignatura` FOREIGN KEY (`Asignatura_Id`) REFERENCES `asignatura` (`Asignatura_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_TieneAsig_Curso` FOREIGN KEY (`Curso_Id`) REFERENCES `curso` (`Curso_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22228 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tieneasig`
--

LOCK TABLES `tieneasig` WRITE;
/*!40000 ALTER TABLE `tieneasig` DISABLE KEYS */;
INSERT INTO `tieneasig` VALUES (22222,'Activa',222,2222),(22223,'Activa',222,2223),(22224,'Activa',223,2222),(22225,'Activa',223,2223),(22226,'Activa',224,2222),(22227,'Activa',225,2224);
/*!40000 ALTER TABLE `tieneasig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuario`
-- Incremento 4, RF61: Apoderado_Sin_Asociaciones_Desde marca el período en que un apoderado quedó
-- sin estudiantes (inactivo); se elimina en el siguiente cambio de período si sigue así
-- Usuario_Correo_Verificado: 0 hasta confirmar el correo principal con un código (primer ingreso);
-- vuelve a 0 si la administración cambia un correo de la cuenta
-- Docente_Color: color (#RRGGBB) que identifica al docente; se asigna al azar de la paleta básica
--

DROP TABLE IF EXISTS `usuario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuario` (
  `Usuario_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Usuario_RUT` varchar(20) NOT NULL,
  `Usuario_Telefono` varchar(20) NOT NULL,
  `Usuario_Nombre_Completo` varchar(100) NOT NULL,
  `Usuario_Estado_Cuenta` tinyint(1) NOT NULL,
  `Usuario_Contraseña` varchar(200) NOT NULL,
  `Usuario_Foto_Perfil` varchar(255) DEFAULT NULL,
  `Es_Docente` tinyint(1) NOT NULL,
  `Docente_Carga_Horaria_Semanal` int DEFAULT NULL,
  `Docente_Especialidad` varchar(255) DEFAULT NULL,
  `Docente_Correo_Institucional` varchar(100) DEFAULT NULL,
  `Es_Administrador` tinyint(1) NOT NULL,
  `Administrador_Tipo` varchar(20) DEFAULT NULL,
  `Administrador_Correo_Institucional` varchar(100) DEFAULT NULL,
  `Es_Apoderado` tinyint(1) NOT NULL,
  `Usuario_Direccion_Calle` varchar(100) DEFAULT NULL,
  `Usuario_Direccion_Numero` varchar(10) DEFAULT NULL,
  `Usuario_Direccion_Depto` varchar(20) DEFAULT NULL,
  `Usuario_Direccion_Comuna` varchar(60) DEFAULT NULL,
  `Apoderado_Correo_Natural` varchar(100) DEFAULT NULL,
  `Docente_Recepcion_Mensajes` tinyint(1) NOT NULL DEFAULT 1,
  `Apoderado_Sin_Asociaciones_Desde` varchar(10) DEFAULT NULL,
  `Usuario_Correo_Verificado` tinyint(1) NOT NULL DEFAULT 0,
  `Docente_Color` char(7) DEFAULT NULL,
  PRIMARY KEY (`Usuario_Id`),
  UNIQUE KEY `Usuario_RUT_UNIQUE` (`Usuario_RUT`),
  UNIQUE KEY `Apoderado_Correo_Natural_UNIQUE` (`Apoderado_Correo_Natural`),
  UNIQUE KEY `Administrador_Correo_Institucional_UNIQUE` (`Administrador_Correo_Institucional`),
  UNIQUE KEY `Docente_Correo_Institucional_UNIQUE` (`Docente_Correo_Institucional`)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuario`
--

LOCK TABLES `usuario` WRITE;
/*!40000 ALTER TABLE `usuario` DISABLE KEYS */;
INSERT INTO `usuario` VALUES (1,'5682711-0','961900000','Esperanza Penelope Gonzales Farias',1,'1234',NULL,0,NULL,NULL,NULL,1,'Super Admin','es.gonzales@colegiojc.cl',0,NULL,NULL,NULL,NULL,NULL,1,NULL,1,NULL),(2,'9343727-6','979746782','Carlos Vicente Gonzales Muñoz',1,'ilovemilf',NULL,0,NULL,NULL,NULL,1,'Administrador Normal','ca.gonzales@colegiojc.cl',0,NULL,NULL,NULL,NULL,NULL,1,NULL,1,NULL),(3,'3483606-k','946789765','María Claudia Morales Rojas',1,'Gato123',NULL,1,38,'Matemáticas','ma.morales@colegiojc.cl',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,1,NULL,1,'#DC2626'),(4,'5738925-7','944706559','Pedro Humberto Fernandez Soto',1,'4532',NULL,0,NULL,NULL,NULL,0,NULL,NULL,1,'Avenida Concha y Toro','134',NULL,'Puente Alto','pedrofernandez453@gmail.com',1,NULL,1,NULL),(5,'3890710-7','912345678','Ana Lucía Torres Vega',1,'Hamster#23',NULL,1,32,'Lenguaje','an.torres@colegiojc.cl',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,1,NULL,1,'#0D9488'),(6,'7135657-4','923456789','Roberto Andrés Silva Pinto',1,'Cotorra-15',NULL,1,40,'Historia','ro.silva@colegiojc.cl',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,1,NULL,1,'#C026D3'),(7,'2258000-0','934567890','Carmen Gloria Díaz Muñoz',1,'Perrito@7',NULL,1,36,'Ciencias','ca.diaz@colegiojc.cl',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,1,NULL,1,'#65A30D'),(8,'8636451-4','945678901','Luis Eduardo Ramos Fuentes',1,'Conejo#42',NULL,0,NULL,NULL,NULL,0,NULL,NULL,1,'Calle Los Pinos','456',NULL,'Santiago','luisramos@gmail.com',1,NULL,1,NULL),(9,'9230041-2','956789012','Sandra Patricia Vera Molina',1,'Tortuga-99',NULL,0,NULL,NULL,NULL,0,NULL,NULL,1,'Pasaje Las Rosas','789',NULL,'Maipú','sandravera@gmail.com',1,NULL,1,NULL),(10,'5158743-k','967890123','Jorge Ignacio Campos Reyes',1,'Pinguino@5',NULL,1,38,'Inglés','jo.campos@colegiojc.cl',0,NULL,NULL,1,'Avenida Principal','321',NULL,'Las Condes','jorge.campos@gmail.com',1,NULL,1,'#4F46E5');
/*!40000 ALTER TABLE `usuario` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-09 20:16:35
