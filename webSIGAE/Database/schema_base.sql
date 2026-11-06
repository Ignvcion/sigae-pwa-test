-- ============================================================================
-- SIGAE — schema_base.sql: SOLO ESTRUCTURA (sin datos)
-- Generado desde SIGAE.sql con sed (ver README, "Para quien modifique el esquema").
-- Sin datos: se quitaron las inserciones, los borrados y bloqueos de tablas y los contadores de prueba.
-- Es el único archivo de base de datos que se carga en producción (RDS).
-- Si una tabla ya existe, CREATE TABLE falla: no sobrescribe datos.
-- ============================================================================
CREATE DATABASE  IF NOT EXISTS `sigae` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `apoderado_suplente`
-- Incremento 4, RF57: suplentes del estudiante, hasta 4 (el titular es estudiante.Apoderado_Usuario_Id)
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `asignatura`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asignatura` (
  `Asignatura_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Asignatura_Nombre` varchar(100) NOT NULL,
  `Asignatura_Prioridad_Academica` varchar(50) NOT NULL,
  PRIMARY KEY (`Asignatura_Id`),
  UNIQUE KEY `Asignatura_Nombre_UNIQUE` (`Asignatura_Nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `bloque_horario`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `citacion`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `conversacion`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversacion` (
  `Conversacion_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Conversacion_Fecha_Inicio` date NOT NULL,
  `Conversacion_Estado` tinyint(1) NOT NULL,
  `Docente_Usuario_Id` int unsigned NOT NULL,
  `Apoderado_Usuario_Id` int unsigned NOT NULL,
  `Conversacion_Habilitada_Hasta` datetime DEFAULT NULL,
  PRIMARY KEY (`Conversacion_Id`),
  KEY `fk Conversacion_Usuario_idx` (`Docente_Usuario_Id`),
  KEY `fk Conversacion_Apoderado_idx` (`Apoderado_Usuario_Id`),
  CONSTRAINT `fk_Conversacion_Apoderado` FOREIGN KEY (`Apoderado_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Conversacion_Docente` FOREIGN KEY (`Docente_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `curso`
-- Incremento 4, RF61: cada curso pertenece a un período lectivo (Curso_Periodo_Lectivo);
-- el nombre es único dentro de cada período (puede haber un "2do Básico A" en 2026 y otro en 2027)
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `estudiante`
--

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
  PRIMARY KEY (`Estudiante_Id`),
  UNIQUE KEY `Estudiante_RUT_UNIQUE` (`Estudiante_RUT`),
  KEY `fk_Estudiante_Curso_idx` (`Curso_Id`),
  KEY `fk_Estudiante_Apoderado_idx` (`Apoderado_Usuario_Id`),
  CONSTRAINT `fk_Estudiante_Apoderado` FOREIGN KEY (`Apoderado_Usuario_Id`) REFERENCES `usuario` (`Usuario_Id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_Estudiante_Curso` FOREIGN KEY (`Curso_Id`) REFERENCES `curso` (`Curso_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `evaluacion`
-- Incremento 4, RF58 y RF59: calendario de evaluaciones
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `evento_institucional`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evento_institucional` (
  `Evento_Institucional_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Evento_Institucional_Impacto_Clases` varchar(100) NOT NULL,
  `Evento_Institucional_Fecha` date NOT NULL,
  `Evento_Institucional_Nombre` varchar(100) NOT NULL,
  `Evento_Institucional_Descripcion` text NOT NULL,
  PRIMARY KEY (`Evento_Institucional_Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `historial`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `horario_asignatura`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `horario_atencion`
-- Incremento 4, RF55: horario de atención de apoderados del docente
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `incluyeasig`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `mensaje`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `nivel_educativo`
-- Incremento 4, RF61: Nivel_Educativo_Orden define el nivel siguiente (Pre-Kinder = 1 ... 4to Medio = 14)
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nivel_educativo` (
  `Nivel_Educativo_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Nivel_Educativo_Nombre` varchar(100) NOT NULL,
  `Nivel_Educativo_Orden` int unsigned NOT NULL,
  PRIMARY KEY (`Nivel_Educativo_Id`),
  UNIQUE KEY `Nivel_Educativo_Nombre_UNIQUE` (`Nivel_Educativo_Nombre`),
  UNIQUE KEY `Nivel_Educativo_Orden_UNIQUE` (`Nivel_Educativo_Orden`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `notificacion`
-- Incremento 4, RF62 (reserva): notificaciones en la plataforma
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `parametro_institucional`
-- Incremento 4, RF61: Periodo_Vigente es el año escolar en curso; Periodo_Siguiente se llena
-- con "Iniciar cierre" y vuelve a NULL con "Iniciar nuevo período"
--

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
  PRIMARY KEY (`Parametro_Institucional_Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `plan_educativo`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_educativo` (
  `Plan_Educativo_Id` int unsigned NOT NULL AUTO_INCREMENT,
  `Plan_Educativo_Periodo_Lectivo` varchar(50) NOT NULL,
  `Nivel_Educativo_Id` int unsigned NOT NULL,
  PRIMARY KEY (`Plan_Educativo_Id`),
  KEY `fk_Plan_Educativo_Nivel_Educativo_idx` (`Nivel_Educativo_Id`),
  CONSTRAINT `fk_Plan_Educativo_Nivel_Educativo` FOREIGN KEY (`Nivel_Educativo_Id`) REFERENCES `nivel_educativo` (`Nivel_Educativo_Id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `sesion`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `situacion_final`
-- Incremento 4, RF61 (por confirmar): situación final de los estudiantes
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `solicitud_recuperacion`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `tieneasig`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `usuario`
-- Incremento 4, RF61: Apoderado_Sin_Asociaciones_Desde marca el período en que un apoderado quedó
-- sin estudiantes (inactivo); se elimina en el siguiente cambio de período si sigue así
--

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
  `Docente_Carga_Horaria_Maxima` int DEFAULT NULL,
  `Docente_Especialidad` varchar(100) DEFAULT NULL,
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
  PRIMARY KEY (`Usuario_Id`),
  UNIQUE KEY `Usuario_RUT_UNIQUE` (`Usuario_RUT`),
  UNIQUE KEY `Apoderado_Correo_Natural_UNIQUE` (`Apoderado_Correo_Natural`),
  UNIQUE KEY `Administrador_Correo_Institucional_UNIQUE` (`Administrador_Correo_Institucional`),
  UNIQUE KEY `Docente_Correo_Institucional_UNIQUE` (`Docente_Correo_Institucional`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-09 20:16:35
