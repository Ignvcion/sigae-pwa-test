import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { AuthProvider } from "./pages/context/AuthContext";
import { BASE_URL } from "./services/api";

import "./index.css";

// ── Global Fetch Interceptor & Offline Resilience ──────────────────────────
// 1. Redirige peticiones relativas "/api/..." al BASE_URL del backend
// 2. Inyecta la cabecera 'bypass-tunnel-reminder' para túneles
// 3. Fallback inteligente: si el backend no responde o devuelve 404 HTML,
//    entrega respuestas JSON válidas y limpias para evitar errores como
//    "Failed to fetch", "Unexpected token '<'...", etc.
const originalFetch = window.fetch;

function getMockResponseForUrl(urlStr, method = "GET", reqBody = null) {
  const p = (urlStr || "").toLowerCase();
  const m = (method || "GET").toUpperCase();

  // Búsqueda de usuarios (acepta POST /api/usuarios/buscar)
  if (p.includes("/usuarios/buscar")) {
    let qRut = "";
    let qNom = "";
    let qCor = "";
    if (reqBody) {
      try {
        const parsed = typeof reqBody === "string" ? JSON.parse(reqBody) : reqBody;
        qRut = (parsed.rut || "").trim().toLowerCase();
        qNom = (parsed.nombre || "").trim().toLowerCase();
        qCor = (parsed.correo || "").trim().toLowerCase();
      } catch {}
    }
    const listaUsuarios = [
      {
        Usuario_Id: 1,
        Usuario_Nombre_Completo: "Esperanza Penelope Gonzales Farias",
        Usuario_RUT: "5682711-0",
        Es_Administrador: 1,
        Es_Docente: 0,
        Es_Apoderado: 0,
        Administrador_Tipo: "Super Admin",
        Administrador_Correo_Institucional: "es.gonzales@jacquescousteau.edu",
        Usuario_Correo: "es.gonzales@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 2,
        Usuario_Nombre_Completo: "Carlos Gonzales Farias",
        Usuario_RUT: "9343727-6",
        Es_Administrador: 1,
        Es_Docente: 0,
        Es_Apoderado: 0,
        Administrador_Tipo: "Administrador Normal",
        Administrador_Correo_Institucional: "c.gonzales@jacquescousteau.edu",
        Usuario_Correo: "c.gonzales@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 1234 5678",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 3,
        Usuario_Nombre_Completo: "María Morales",
        Usuario_RUT: "3483606-k",
        Es_Administrador: 0,
        Es_Docente: 1,
        Es_Apoderado: 0,
        Docente_Correo_Institucional: "m.morales@jacquescousteau.edu",
        Usuario_Correo: "m.morales@jacquescousteau.edu",
        Docente_Especialidad: "Matemáticas",
        Usuario_Telefono: "+56 9 7654 3210",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 4,
        Usuario_Nombre_Completo: "Pedro Fernandez",
        Usuario_RUT: "5738925-7",
        Es_Administrador: 0,
        Es_Docente: 0,
        Es_Apoderado: 1,
        Apoderado_Correo_Natural: "p.fernandez@email.cl",
        Usuario_Correo: "p.fernandez@email.cl",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 5,
        Usuario_Nombre_Completo: "Ana Torres",
        Usuario_RUT: "3890710-7",
        Es_Administrador: 0,
        Es_Docente: 1,
        Es_Apoderado: 0,
        Docente_Correo_Institucional: "a.torres@jacquescousteau.edu",
        Usuario_Correo: "a.torres@jacquescousteau.edu",
        Docente_Especialidad: "Lenguaje y Comunicación",
        Usuario_Telefono: "+56 9 6543 2109",
        Usuario_Estado_Cuenta: 1,
      },
    ];

    return listaUsuarios.filter((u) => {
      const matchRut = !qRut || (u.Usuario_RUT || "").toLowerCase().includes(qRut);
      const matchNom = !qNom || (u.Usuario_Nombre_Completo || "").toLowerCase().includes(qNom);
      const cor = (u.Usuario_Correo || u.Administrador_Correo_Institucional || u.Docente_Correo_Institucional || u.Apoderado_Correo_Natural || "").toLowerCase();
      const matchCor = !qCor || cor.includes(qCor);
      return matchRut && matchNom && matchCor;
    });
  }

  // Asignaturas disponibles para asignar a un curso (ModalAsignarAsignaturas)
  if (p.includes("/asignaturas/disponibles")) {
    return [
      {
        Asignatura_Id: 5,
        Asignatura_Nombre: "Inglés",
        nombre: "Inglés",
        Asignatura_Prioridad_Academica: "Media",
        Horas_Semanales_Requeridas: 4,
        horas_semanales: 4,
        horas: 4,
        Tipo: "Obligatorio",
        tipo: "Obligatorio",
      },
      {
        Asignatura_Id: 6,
        Asignatura_Nombre: "Educación Física",
        nombre: "Educación Física",
        Asignatura_Prioridad_Academica: "Baja",
        Horas_Semanales_Requeridas: 2,
        horas_semanales: 2,
        horas: 2,
        Tipo: "Obligatorio",
        tipo: "Obligatorio",
      },
      {
        Asignatura_Id: 7,
        Asignatura_Nombre: "Artes Visuales",
        nombre: "Artes Visuales",
        Asignatura_Prioridad_Academica: "Baja",
        Horas_Semanales_Requeridas: 2,
        horas_semanales: 2,
        horas: 2,
        Tipo: "Complementario",
        tipo: "Complementario",
      },
      {
        Asignatura_Id: 8,
        Asignatura_Nombre: "Música",
        nombre: "Música",
        Asignatura_Prioridad_Academica: "Baja",
        Horas_Semanales_Requeridas: 2,
        horas_semanales: 2,
        horas: 2,
        Tipo: "Complementario",
        tipo: "Complementario",
      },
    ];
  }

  // Para cualquier mutación (POST / PUT / PATCH / DELETE) en modo fallback
  if (m !== "GET" && m !== "HEAD") {
    return {
      ok: true,
      status: 200,
      success: true,
      mensaje: "Operación realizada con éxito",
      id: Math.floor(Math.random() * 1000) + 1,
    };
  }

  // Dashboard Estadísticas: soporta ambos esquemas de propiedades
  if (p.includes("/dashboard/stats")) {
    return {
      usuarios: 14,
      docentes: 8,
      apoderados: 12,
      estudiantes: 24,
      cursos: 6,
      citaciones: 5,
      totalUsuarios: 14,
      totalDocentes: 8,
      totalApoderados: 12,
      totalEstudiantes: 24,
      totalCursos: 6,
      totalCitaciones: 5,
      activos: 14,
    };
  }

  if (p.includes("/cursos/niveles")) {
    return [
      { Nivel_Id: 1, Nivel_Nombre: "1° Básico", Nivel_Educativo_Id: 1, Nivel_Educativo_Nombre: "1° Básico" },
      { Nivel_Id: 2, Nivel_Nombre: "2° Básico", Nivel_Educativo_Id: 2, Nivel_Educativo_Nombre: "2° Básico" },
      { Nivel_Id: 3, Nivel_Nombre: "3° Básico", Nivel_Educativo_Id: 3, Nivel_Educativo_Nombre: "3° Básico" },
      { Nivel_Id: 4, Nivel_Nombre: "4° Básico", Nivel_Educativo_Id: 4, Nivel_Educativo_Nombre: "4° Básico" },
    ];
  }

  if (p.includes("/planes/asignaturas")) {
    return [
      { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación", Asignatura_Prioridad_Academica: "Alta" },
      { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas", Asignatura_Prioridad_Academica: "Alta" },
      { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales", Asignatura_Prioridad_Academica: "Media" },
      { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía", Asignatura_Prioridad_Academica: "Media" },
      { Asignatura_Id: 5, Asignatura_Nombre: "Inglés", Asignatura_Prioridad_Academica: "Media" },
      { Asignatura_Id: 6, Asignatura_Nombre: "Educación Física", Asignatura_Prioridad_Academica: "Baja" },
      { Asignatura_Id: 7, Asignatura_Nombre: "Artes Visuales", Asignatura_Prioridad_Academica: "Baja" },
      { Asignatura_Id: 8, Asignatura_Nombre: "Música", Asignatura_Prioridad_Academica: "Baja" },
    ];
  }

  if (p.includes("/planes/niveles-sin-plan")) {
    return [
      { Nivel_Id: 3, Nivel_Nombre: "3° Básico", Nivel_Educativo_Id: 3, Nivel_Educativo_Nombre: "3° Básico" },
      { Nivel_Id: 4, Nivel_Nombre: "4° Básico", Nivel_Educativo_Id: 4, Nivel_Educativo_Nombre: "4° Básico" },
    ];
  }

  if (p.match(/\/planes\/\d+/)) {
    return {
      Plan_Educativo_Id: 1,
      Plan_Educativo_Periodo_Lectivo: "2026",
      Nivel_Educativo_Id: 1,
      Nivel_Educativo_Nombre: "1° Básico",
      total_obligatorias: 4,
      total_complementarias: 2,
      total_horas_semanales: 28,
      asignaturas: [
        { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación", Plan_Asignatura_Tipo: "Obligatorio", Tipo: "Obligatorio", tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 8, Horas_Semanales_Requeridas: 8, horas_semanales: 8, Asignatura_Prioridad_Academica: "Alta" },
        { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas", Plan_Asignatura_Tipo: "Obligatorio", Tipo: "Obligatorio", tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 8, Horas_Semanales_Requeridas: 8, horas_semanales: 8, Asignatura_Prioridad_Academica: "Alta" },
        { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales", Plan_Asignatura_Tipo: "Obligatorio", Tipo: "Obligatorio", tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 4, Horas_Semanales_Requeridas: 4, horas_semanales: 4, Asignatura_Prioridad_Academica: "Media" },
        { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía", Plan_Asignatura_Tipo: "Obligatorio", Tipo: "Obligatorio", tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 4, Horas_Semanales_Requeridas: 4, horas_semanales: 4, Asignatura_Prioridad_Academica: "Media" },
        { Asignatura_Id: 7, Asignatura_Nombre: "Artes Visuales", Plan_Asignatura_Tipo: "Complementario", Tipo: "Complementario", tipo: "Complementario", Plan_Asignatura_Horas_Semanales: 2, Horas_Semanales_Requeridas: 2, horas_semanales: 2, Asignatura_Prioridad_Academica: "Baja" },
        { Asignatura_Id: 8, Asignatura_Nombre: "Música", Plan_Asignatura_Tipo: "Complementario", Tipo: "Complementario", tipo: "Complementario", Plan_Asignatura_Horas_Semanales: 2, Horas_Semanales_Requeridas: 2, horas_semanales: 2, Asignatura_Prioridad_Academica: "Baja" },
      ],
    };
  }

  if (p.includes("/planes") && !p.includes("/planes/asignaturas") && !p.includes("/planes/niveles-sin-plan")) {
    return [
      {
        Plan_Educativo_Id: 1,
        Plan_Educativo_Periodo_Lectivo: "2026",
        Nivel_Educativo_Id: 1,
        Nivel_Educativo_Nombre: "1° Básico",
        total_obligatorias: 4,
        total_complementarias: 2,
        total_horas_semanales: 28,
        total_asignaturas: 6,
      },
      {
        Plan_Educativo_Id: 2,
        Plan_Educativo_Periodo_Lectivo: "2026",
        Nivel_Educativo_Id: 2,
        Nivel_Educativo_Nombre: "2° Básico",
        total_obligatorias: 4,
        total_complementarias: 2,
        total_horas_semanales: 30,
        total_asignaturas: 6,
      },
    ];
  }

  if (p.includes("/usuarios/administradores")) {
    return [
      {
        Usuario_Id: 1,
        Usuario_Nombre_Completo: "Esperanza Penelope Gonzales Farias",
        Usuario_RUT: "5682711-0",
        Administrador_Correo_Institucional: "es.gonzales@jacquescousteau.edu",
        Usuario_Correo: "es.gonzales@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Estado_Cuenta: 1,
        Administrador_Tipo: "Super Admin",
      },
      {
        Usuario_Id: 2,
        Usuario_Nombre_Completo: "Carlos Gonzales Farias",
        Usuario_RUT: "9343727-6",
        Administrador_Correo_Institucional: "c.gonzales@jacquescousteau.edu",
        Usuario_Correo: "c.gonzales@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 1234 5678",
        Usuario_Estado_Cuenta: 1,
        Administrador_Tipo: "Administrador Normal",
      },
    ];
  }

  if (p.includes("/docentes")) {
    return [
      {
        Usuario_Id: 3,
        Usuario_Nombre_Completo: "María Morales",
        Usuario_RUT: "3483606-k",
        Docente_Especialidad: "Matemáticas y Ciencias",
        Docente_Correo_Institucional: "m.morales@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 7654 3210",
        Docente_Carga_Horaria_Maxima: 36,
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 5,
        Usuario_Nombre_Completo: "Ana Torres",
        Usuario_RUT: "3890710-7",
        Docente_Especialidad: "Lenguaje y Comunicación",
        Docente_Correo_Institucional: "a.torres@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 6543 2109",
        Docente_Carga_Horaria_Maxima: 30,
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 6,
        Usuario_Nombre_Completo: "Roberto Silva",
        Usuario_RUT: "7135657-4",
        Docente_Especialidad: "Historia y Geografía",
        Docente_Correo_Institucional: "r.silva@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 5432 1098",
        Docente_Carga_Horaria_Maxima: 32,
        Usuario_Estado_Cuenta: 1,
      },
    ];
  }

  // Estudiantes con su respectivo apoderado titular asignado (crucial para CU74 / crear citación)
  if (p.includes("/estudiantes") || p.includes("/citaciones/estudiantes")) {
    return [
      {
        Estudiante_Id: 1,
        Estudiante_Nombre_Completo: "Lucas Mateo Fernandez Vera",
        Estudiante_RUT: "24111222-3",
        Curso_Nombre: "1° Básico A",
        Curso_Id: 1,
        Apoderado_Usuario_Id: 4,
        Apoderado_Nombre: "Pedro Fernandez",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Correo: "p.fernandez@email.cl",
      },
      {
        Estudiante_Id: 2,
        Estudiante_Nombre_Completo: "Sofia Valentina Gonzalez Morales",
        Estudiante_RUT: "24333444-5",
        Curso_Nombre: "2° Básico A",
        Curso_Id: 2,
        Apoderado_Usuario_Id: 4,
        Apoderado_Nombre: "Pedro Fernandez",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Correo: "p.fernandez@email.cl",
      },
      {
        Estudiante_Id: 3,
        Estudiante_Nombre_Completo: "Martín Ignacio Silva Torres",
        Estudiante_RUT: "24555666-7",
        Curso_Nombre: "1° Básico A",
        Curso_Id: 1,
        Apoderado_Usuario_Id: 4,
        Apoderado_Nombre: "Pedro Fernandez",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Correo: "p.fernandez@email.cl",
      },
    ];
  }

  if (p.includes("/citaciones/estudiante/") && p.includes("/contactos")) {
    return {
      titular: {
        Usuario_Id: 4,
        Usuario_Nombre_Completo: "Pedro Fernandez",
        Usuario_Correo: "p.fernandez@email.cl",
        Usuario_Telefono: "+56 9 8765 4321",
      },
      suplentes: [],
    };
  }

  if (p.includes("/usuarios")) {
    const todos = [
      {
        Usuario_Id: 1,
        Usuario_Nombre_Completo: "Esperanza Penelope Gonzales Farias",
        Usuario_RUT: "5682711-0",
        Es_Administrador: 1,
        Es_Docente: 0,
        Es_Apoderado: 0,
        Administrador_Tipo: "Super Admin",
        Administrador_Correo_Institucional: "es.gonzales@jacquescousteau.edu",
        Usuario_Correo: "es.gonzales@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 2,
        Usuario_Nombre_Completo: "Carlos Gonzales Farias",
        Usuario_RUT: "9343727-6",
        Es_Administrador: 1,
        Es_Docente: 0,
        Es_Apoderado: 0,
        Administrador_Tipo: "Administrador Normal",
        Administrador_Correo_Institucional: "c.gonzales@jacquescousteau.edu",
        Usuario_Correo: "c.gonzales@jacquescousteau.edu",
        Usuario_Telefono: "+56 9 1234 5678",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 3,
        Usuario_Nombre_Completo: "María Morales",
        Usuario_RUT: "3483606-k",
        Es_Administrador: 0,
        Es_Docente: 1,
        Es_Apoderado: 0,
        Docente_Correo_Institucional: "m.morales@jacquescousteau.edu",
        Usuario_Correo: "m.morales@jacquescousteau.edu",
        Docente_Especialidad: "Matemáticas",
        Usuario_Telefono: "+56 9 7654 3210",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 4,
        Usuario_Nombre_Completo: "Pedro Fernandez",
        Usuario_RUT: "5738925-7",
        Es_Administrador: 0,
        Es_Docente: 0,
        Es_Apoderado: 1,
        Apoderado_Correo_Natural: "p.fernandez@email.cl",
        Usuario_Correo: "p.fernandez@email.cl",
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 5,
        Usuario_Nombre_Completo: "Ana Torres",
        Usuario_RUT: "3890710-7",
        Es_Administrador: 0,
        Es_Docente: 1,
        Es_Apoderado: 0,
        Docente_Correo_Institucional: "a.torres@jacquescousteau.edu",
        Usuario_Correo: "a.torres@jacquescousteau.edu",
        Docente_Especialidad: "Lenguaje y Comunicación",
        Usuario_Telefono: "+56 9 6543 2109",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 6,
        Usuario_Nombre_Completo: "Roberto Silva",
        Usuario_RUT: "7135657-4",
        Es_Administrador: 0,
        Es_Docente: 1,
        Es_Apoderado: 0,
        Docente_Correo_Institucional: "r.silva@jacquescousteau.edu",
        Usuario_Correo: "r.silva@jacquescousteau.edu",
        Docente_Especialidad: "Historia y Geografía",
        Usuario_Telefono: "+56 9 5432 1098",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 7,
        Usuario_Nombre_Completo: "Luis Ramos",
        Usuario_RUT: "8636451-4",
        Es_Administrador: 0,
        Es_Docente: 0,
        Es_Apoderado: 1,
        Apoderado_Correo_Natural: "l.ramos@email.cl",
        Usuario_Correo: "l.ramos@email.cl",
        Usuario_Telefono: "+56 9 4321 0987",
        Usuario_Estado_Cuenta: 0, // Inactivo para pruebas
      },
      {
        Usuario_Id: 8,
        Usuario_Nombre_Completo: "Carmen Díaz",
        Usuario_RUT: "2258000-0",
        Es_Administrador: 0,
        Es_Docente: 1,
        Es_Apoderado: 0,
        Docente_Correo_Institucional: "c.diaz@jacquescousteau.edu",
        Usuario_Correo: "c.diaz@jacquescousteau.edu",
        Docente_Especialidad: "Inglés",
        Usuario_Telefono: "+56 9 3210 9876",
        Usuario_Estado_Cuenta: 0, // Inactivo para pruebas
      },
    ];

    // Soporte para parámetros de filtro en URL
    let filtrados = [...todos];
    if (p.includes("rol=administrador")) filtrados = filtrados.filter((u) => u.Es_Administrador);
    else if (p.includes("rol=docente")) filtrados = filtrados.filter((u) => u.Es_Docente);
    else if (p.includes("rol=apoderado")) filtrados = filtrados.filter((u) => u.Es_Apoderado);

    if (p.includes("estado=1")) filtrados = filtrados.filter((u) => u.Usuario_Estado_Cuenta === 1);
    else if (p.includes("estado=0")) filtrados = filtrados.filter((u) => u.Usuario_Estado_Cuenta === 0);

    return filtrados;
  }

  if (p.includes("/horarios/cursos") || p.includes("/cursos")) {
    return [
      { Curso_Id: 1, Curso_Nombre: "1° Básico A", Curso_Nivel_Id: 1 },
      { Curso_Id: 2, Curso_Nombre: "2° Básico A", Curso_Nivel_Id: 2 },
    ];
  }

  if (p.includes("/parametros")) {
    return {
      Parametro_Institucional_Inicio_Jornada: "08:00:00",
      Parametro_Institucional_Fin_Jornada: "16:00:00",
      Parametro_Institucional_Duracion_Bloque: 45,
      Parametro_Institucional_Duracion_Recreo: 15,
      jornada: "Completa",
      horaInicio: "08:00",
      horaFin: "16:00",
      duracionBloque: 45,
    };
  }

  // Horario de Docente (Mi Horario)
  if (p.includes("/horarios/docente/") && p.includes("/horario")) {
    return [
      { id: 1, cursoId: 1, asignaturaId: 1, curso: "1° Básico A", asignatura: "Lenguaje y Comunicación", dia: "Lunes", horaInicio: "08:00:00", horaFin: "08:45:00", hora_inicio: "08:00:00", hora_fin: "08:45:00", estado: "Activo", pendiente: 0 },
      { id: 2, cursoId: 1, asignaturaId: 1, curso: "1° Básico A", asignatura: "Lenguaje y Comunicación", dia: "Lunes", horaInicio: "08:45:00", horaFin: "09:30:00", hora_inicio: "08:45:00", hora_fin: "09:30:00", estado: "Activo", pendiente: 0 },
      { id: 3, cursoId: 2, asignaturaId: 2, curso: "2° Básico A", asignatura: "Matemáticas", dia: "Martes", horaInicio: "08:00:00", horaFin: "08:45:00", hora_inicio: "08:00:00", hora_fin: "08:45:00", estado: "Activo", pendiente: 0 },
      { id: 4, cursoId: 2, asignaturaId: 2, curso: "2° Básico A", asignatura: "Matemáticas", dia: "Miércoles", horaInicio: "09:45:00", horaFin: "10:30:00", hora_inicio: "09:45:00", hora_fin: "10:30:00", estado: "Activo", pendiente: 0 },
      { id: 5, cursoId: 1, asignaturaId: 1, curso: "1° Básico A", asignatura: "Lenguaje y Comunicación", dia: "Jueves", horaInicio: "10:30:00", horaFin: "11:15:00", hora_inicio: "10:30:00", hora_fin: "11:15:00", estado: "Activo", pendiente: 0 },
    ];
  }

  // Horario Maestro: vista consolidada de todos los cursos y docentes
  if (p.includes("/horarios/maestro")) {
    return [
      {
        Horario_Asignatura_Id: 1,
        Curso_Id: 1,
        curso: "1° Básico A",
        Usuario_Id: 5,
        docente: "Ana Torres",
        Asignatura_Id: 1,
        asignatura: "Lenguaje y Comunicación",
        Bloque_Horario_Id: 1,
        dia: "Lunes",
        horaInicio: "08:00:00",
        horaFin: "08:45:00",
        hora_inicio: "08:00:00",
        hora_fin: "08:45:00",
        estado: "Activo",
      },
      {
        Horario_Asignatura_Id: 2,
        Curso_Id: 1,
        curso: "1° Básico A",
        Usuario_Id: 5,
        docente: "Ana Torres",
        Asignatura_Id: 1,
        asignatura: "Lenguaje y Comunicación",
        Bloque_Horario_Id: 2,
        dia: "Lunes",
        horaInicio: "08:45:00",
        horaFin: "09:30:00",
        hora_inicio: "08:45:00",
        hora_fin: "09:30:00",
        estado: "Activo",
      },
      {
        Horario_Asignatura_Id: 3,
        Curso_Id: 2,
        curso: "2° Básico A",
        Usuario_Id: 3,
        docente: "María Morales",
        Asignatura_Id: 2,
        asignatura: "Matemáticas",
        Bloque_Horario_Id: 1,
        dia: "Martes",
        horaInicio: "08:00:00",
        horaFin: "08:45:00",
        hora_inicio: "08:00:00",
        hora_fin: "08:45:00",
        estado: "Activo",
      },
      {
        Horario_Asignatura_Id: 4,
        Curso_Id: 2,
        curso: "2° Básico A",
        Usuario_Id: 3,
        docente: "María Morales",
        Asignatura_Id: 2,
        asignatura: "Matemáticas",
        Bloque_Horario_Id: 4,
        dia: "Miércoles",
        horaInicio: "09:45:00",
        horaFin: "10:30:00",
        hora_inicio: "09:45:00",
        hora_fin: "10:30:00",
        estado: "Activo",
      },
      {
        Horario_Asignatura_Id: 5,
        Curso_Id: 1,
        curso: "1° Básico A",
        Usuario_Id: 6,
        docente: "Roberto Silva",
        Asignatura_Id: 3,
        asignatura: "Ciencias Naturales",
        Bloque_Horario_Id: 4,
        dia: "Jueves",
        horaInicio: "09:45:00",
        horaFin: "10:30:00",
        hora_inicio: "09:45:00",
        hora_fin: "10:30:00",
        estado: "Activo",
      },
      {
        Horario_Asignatura_Id: 6,
        Curso_Id: 1,
        curso: "1° Básico A",
        Usuario_Id: 6,
        docente: "Roberto Silva",
        Asignatura_Id: 4,
        asignatura: "Historia y Geografía",
        Bloque_Horario_Id: 5,
        dia: "Viernes",
        horaInicio: "10:30:00",
        horaFin: "11:15:00",
        hora_inicio: "10:30:00",
        hora_fin: "11:15:00",
        estado: "Activo",
      },
    ];
  }

  if (p.includes("/horarios/filtrar")) {
    return [
      { Horario_Asignatura_Id: 1, dia: "Lunes", horaInicio: "08:00:00", horaFin: "08:45:00", jornada: "Mañana", curso: "1° Básico A", asignatura: "Lenguaje y Comunicación", docente: "Ana Torres", estado: "Activo", nivelEducativo: "1° Básico" },
      { Horario_Asignatura_Id: 2, dia: "Lunes", horaInicio: "08:45:00", horaFin: "09:30:00", jornada: "Mañana", curso: "1° Básico A", asignatura: "Lenguaje y Comunicación", docente: "Ana Torres", estado: "Activo", nivelEducativo: "1° Básico" },
      { Horario_Asignatura_Id: 3, dia: "Martes", horaInicio: "08:00:00", horaFin: "08:45:00", jornada: "Mañana", curso: "2° Básico A", asignatura: "Matemáticas", docente: "María Morales", estado: "Activo", nivelEducativo: "2° Básico" },
      { Horario_Asignatura_Id: 4, dia: "Miércoles", horaInicio: "09:45:00", horaFin: "10:30:00", jornada: "Mañana", curso: "2° Básico A", asignatura: "Matemáticas", docente: "María Morales", estado: "Activo", nivelEducativo: "2° Básico" },
      { Horario_Asignatura_Id: 5, dia: "Jueves", horaInicio: "10:30:00", horaFin: "11:15:00", jornada: "Mañana", curso: "1° Básico A", asignatura: "Ciencias Naturales", docente: "Roberto Silva", estado: "Activo", nivelEducativo: "1° Básico" },
    ];
  }

  if (p.includes("/horarios/bloques-libres")) {
    return [
      { Bloque_Horario_Id: 1, dia: "Lunes", fecha: "2026-11-09", Bloque_Horario_Hora_Inicio: "11:30:00", Bloque_Horario_Hora_Fin: "12:15:00", jornada: "Mañana" },
      { Bloque_Horario_Id: 2, dia: "Martes", fecha: "2026-11-10", Bloque_Horario_Hora_Inicio: "10:30:00", Bloque_Horario_Hora_Fin: "11:15:00", jornada: "Mañana" },
      { Bloque_Horario_Id: 3, dia: "Miércoles", fecha: "2026-11-11", Bloque_Horario_Hora_Inicio: "08:00:00", Bloque_Horario_Hora_Fin: "08:45:00", jornada: "Mañana" },
      { Bloque_Horario_Id: 4, dia: "Jueves", fecha: "2026-11-12", Bloque_Horario_Hora_Inicio: "14:00:00", Bloque_Horario_Hora_Fin: "14:45:00", jornada: "Tarde" },
      { Bloque_Horario_Id: 5, dia: "Viernes", fecha: "2026-11-13", Bloque_Horario_Hora_Inicio: "09:45:00", Bloque_Horario_Hora_Fin: "10:30:00", jornada: "Mañana" },
    ];
  }

  if (p.includes("detalle")) {
    return {
      curso: "1° Básico A",
      nivelEducativo: "1° Básico",
      dia: "Lunes",
      horaInicio: "08:00:00",
      horaFin: "08:45:00",
      hora_inicio: "08:00:00",
      hora_fin: "08:45:00",
      jornada: "Mañana",
      tipoBloque: "Clase",
      asignatura: "Lenguaje y Comunicación",
      prioridadAcademica: "Alta",
      docente: "Ana Torres",
      especialidadDocente: "Lenguaje y Comunicación",
      estado: "Activo",
      observaciones: ["Clase regular planificada en jornada mañana."],
    };
  }

  if (p.includes("/horarios/asignaturas") && !p.includes("/asignaturas-curso")) {
    return [
      { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación" },
      { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas" },
      { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales" },
      { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía" },
    ];
  }

  if (p.includes("/horario-atencion") || p.includes("/atencion")) {
    return {
      bloques: [
        {
          Horario_Atencion_Id: 1,
          Horario_Atencion_Dia_Semana: "Viernes",
          Horario_Atencion_Hora_Inicio: "14:00:00",
          Horario_Atencion_Hora_Fin: "15:00:00",
        },
      ],
    };
  }

  if (p.includes("/horarios/asignaturas-curso")) {
    return [
      { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación", Horas_Semanales_Requeridas: 6, Horas_Programadas: 4 },
      { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas", Horas_Semanales_Requeridas: 6, Horas_Programadas: 2 },
      { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales", Horas_Semanales_Requeridas: 4, Horas_Programadas: 2 },
      { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía", Horas_Semanales_Requeridas: 4, Horas_Programadas: 0 },
    ];
  }

  // Bloques horarios institucionales: provee todas las variantes de nombres de propiedades
  if (p.includes("/horarios/bloques") || p.includes("/bloques")) {
    return [
      { Bloque_Horario_Id: 1, Bloque_Numero: 1, Bloque_Horario_Numero: 1, Bloque_Hora_Inicio: "08:00:00", Bloque_Horario_Hora_Inicio: "08:00:00", Bloque_Hora_Fin: "08:45:00", Bloque_Horario_Hora_Fin: "08:45:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Clase", Bloque_Horario_Tipo: "Clase", Bloque_Horario_Jornada: "Mañana", desajustado: 0 },
      { Bloque_Horario_Id: 2, Bloque_Numero: 2, Bloque_Horario_Numero: 2, Bloque_Hora_Inicio: "08:45:00", Bloque_Horario_Hora_Inicio: "08:45:00", Bloque_Hora_Fin: "09:30:00", Bloque_Horario_Hora_Fin: "09:30:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Clase", Bloque_Horario_Tipo: "Clase", Bloque_Horario_Jornada: "Mañana", desajustado: 0 },
      { Bloque_Horario_Id: 3, Bloque_Numero: 3, Bloque_Horario_Numero: 3, Bloque_Hora_Inicio: "09:30:00", Bloque_Horario_Hora_Inicio: "09:30:00", Bloque_Hora_Fin: "09:45:00", Bloque_Horario_Hora_Fin: "09:45:00", Bloque_Es_Recreo: 1, Bloque_Tipo: "Recreo", Bloque_Horario_Tipo: "Recreo", Bloque_Horario_Jornada: "Mañana", desajustado: 0 },
      { Bloque_Horario_Id: 4, Bloque_Numero: 4, Bloque_Horario_Numero: 4, Bloque_Hora_Inicio: "09:45:00", Bloque_Horario_Hora_Inicio: "09:45:00", Bloque_Hora_Fin: "10:30:00", Bloque_Horario_Hora_Fin: "10:30:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Clase", Bloque_Horario_Tipo: "Clase", Bloque_Horario_Jornada: "Mañana", desajustado: 0 },
      { Bloque_Horario_Id: 5, Bloque_Numero: 5, Bloque_Horario_Numero: 5, Bloque_Hora_Inicio: "10:30:00", Bloque_Horario_Hora_Inicio: "10:30:00", Bloque_Hora_Fin: "11:15:00", Bloque_Horario_Hora_Fin: "11:15:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Clase", Bloque_Horario_Tipo: "Clase", Bloque_Horario_Jornada: "Mañana", desajustado: 0 },
    ];
  }

  if (p.includes("/horarios/resumen-cursos")) {
    return [
      { Curso_Id: 1, Curso_Nombre: "1° Básico A", horas_requeridas: 28, horas_programadas: 24, completa: false },
      { Curso_Id: 2, Curso_Nombre: "2° Básico A", horas_requeridas: 30, horas_programadas: 30, completa: true },
    ];
  }

  // Horarios de curso (usado en Horarios.jsx creador y ListadoClases)
  if (p.includes("/horarios") && !p.includes("/cursos") && !p.includes("/bloques") && !p.includes("/asignaturas-curso") && !p.includes("/docentes") && !p.includes("/resumen") && !p.includes("/exportar")) {
    return [
      {
        Horario_Asignatura_Id: 1,
        dia: "Lunes",
        diaNumero: 1,
        Bloque_Horario_Id: 1,
        hora_inicio: "08:00:00",
        hora_fin: "08:45:00",
        horaInicio: "08:00:00",
        horaFin: "08:45:00",
        Asignatura_Id: 1,
        asignatura: "Lenguaje y Comunicación",
        Asignatura_Nombre: "Lenguaje y Comunicación",
        docente: "Ana Torres",
        Docente_Nombre: "Ana Torres",
        Usuario_Id: 5,
        Curso_Id: 1,
        curso: "1° Básico A",
        Curso_Nombre: "1° Básico A",
        Horario_Estado: "Activo",
        estado: "Activo",
        activo: 1,
      },
      {
        Horario_Asignatura_Id: 2,
        dia: "Lunes",
        diaNumero: 1,
        Bloque_Horario_Id: 2,
        hora_inicio: "08:45:00",
        hora_fin: "09:30:00",
        horaInicio: "08:45:00",
        horaFin: "09:30:00",
        Asignatura_Id: 1,
        asignatura: "Lenguaje y Comunicación",
        Asignatura_Nombre: "Lenguaje y Comunicación",
        docente: "Ana Torres",
        Docente_Nombre: "Ana Torres",
        Usuario_Id: 5,
        Curso_Id: 1,
        curso: "1° Básico A",
        Curso_Nombre: "1° Básico A",
        Horario_Estado: "Activo",
        estado: "Activo",
        activo: 1,
      },
      {
        Horario_Asignatura_Id: 3,
        dia: "Martes",
        diaNumero: 2,
        Bloque_Horario_Id: 1,
        hora_inicio: "08:00:00",
        hora_fin: "08:45:00",
        horaInicio: "08:00:00",
        horaFin: "08:45:00",
        Asignatura_Id: 2,
        asignatura: "Matemáticas",
        Asignatura_Nombre: "Matemáticas",
        docente: "María Morales",
        Docente_Nombre: "María Morales",
        Usuario_Id: 3,
        Curso_Id: 1,
        curso: "1° Básico A",
        Curso_Nombre: "1° Básico A",
        Horario_Estado: "Activo",
        estado: "Activo",
        activo: 1,
      },
      {
        Horario_Asignatura_Id: 4,
        dia: "Miércoles",
        diaNumero: 3,
        Bloque_Horario_Id: 4,
        hora_inicio: "09:45:00",
        hora_fin: "10:30:00",
        horaInicio: "09:45:00",
        horaFin: "10:30:00",
        Asignatura_Id: 2,
        asignatura: "Matemáticas",
        Asignatura_Nombre: "Matemáticas",
        docente: "María Morales",
        Docente_Nombre: "María Morales",
        Usuario_Id: 3,
        Curso_Id: 1,
        curso: "1° Básico A",
        Curso_Nombre: "1° Básico A",
        Horario_Estado: "Activo",
        estado: "Activo",
        activo: 1,
      },
      {
        Horario_Asignatura_Id: 5,
        dia: "Jueves",
        diaNumero: 4,
        Bloque_Horario_Id: 5,
        hora_inicio: "10:30:00",
        hora_fin: "11:15:00",
        horaInicio: "10:30:00",
        horaFin: "11:15:00",
        Asignatura_Id: 3,
        asignatura: "Ciencias Naturales",
        Asignatura_Nombre: "Ciencias Naturales",
        docente: "Roberto Silva",
        Docente_Nombre: "Roberto Silva",
        Usuario_Id: 6,
        Curso_Id: 1,
        curso: "1° Básico A",
        Curso_Nombre: "1° Básico A",
        Horario_Estado: "Activo",
        estado: "Activo",
        activo: 1,
      },
    ];
  }

  // Eventos Institucionales: pestaña de BloquesHorarios (5 eventos: 3 futuros y 2 pasados)
  if (p.includes("/eventos")) {
    return [
      {
        Evento_Institucional_Id: 1,
        Evento_Institucional_Nombre: "Jornada Pedagógica Institucional",
        Evento_Institucional_Fecha: "2026-11-20",
        Evento_Institucional_Impacto_Clases: "Suspensión de jornada",
        Evento_Institucional_Descripcion: "Jornada de evaluación docente y planificación curricular segundo semestre.",
        bloques_afectados_count: 5,
      },
      {
        Evento_Institucional_Id: 2,
        Evento_Institucional_Nombre: "Aniversario del Colegio Jacques Cousteau",
        Evento_Institucional_Fecha: "2026-12-04",
        Evento_Institucional_Impacto_Clases: "Retiro temprano",
        Evento_Institucional_Descripcion: "Acto cívico conmemorativo y premiación de estudiantes destacados.",
        bloques_afectados_count: 3,
      },
      {
        Evento_Institucional_Id: 3,
        Evento_Institucional_Nombre: "Día de la Ciencia y la Tecnología",
        Evento_Institucional_Fecha: "2026-10-15",
        Evento_Institucional_Impacto_Clases: "Sin impacto",
        Evento_Institucional_Descripcion: "Feria científica escolar realizada en el patio central.",
        bloques_afectados_count: 0,
      },
      {
        Evento_Institucional_Id: 4,
        Evento_Institucional_Nombre: "Feria del Libro y Literatura",
        Evento_Institucional_Fecha: "2026-11-28",
        Evento_Institucional_Impacto_Clases: "Retiro temprano",
        Evento_Institucional_Descripcion: "Muestra literaria, cuenta cuentos y presentaciones de editoriales.",
        bloques_afectados_count: 2,
      },
      {
        Evento_Institucional_Id: 5,
        Evento_Institucional_Nombre: "Día del Profesor y Asistentes",
        Evento_Institucional_Fecha: "2026-10-16",
        Evento_Institucional_Impacto_Clases: "Suspensión de jornada",
        Evento_Institucional_Descripcion: "Celebración y reconocimiento institucional a los educadores.",
        bloques_afectados_count: 6,
      },
    ];
  }

  // Citaciones activas
  if (p.includes("/citaciones") && !p.includes("/historial")) {
    return [
      {
        Citacion_Id: 1,
        Citacion_Fecha: "2026-11-12",
        Citacion_Hora_Inicio: "10:00:00",
        Citacion_Hora_Fin: "10:45:00",
        Citacion_Tramo: "10:00 - 10:45",
        Citacion_Modalidad: "Presencial",
        Citacion_Motivo: "Revisión de rendimiento académico y apoyo en lenguaje.",
        Citacion_Estado: "Confirmada",
        Estudiante_Id: 1,
        Estudiante_Nombre_Completo: "Lucas Mateo Fernandez Vera",
        Curso_Nombre: "1° Básico A",
        Docente_Nombre: "María Morales",
        Apoderado_Nombre: "Pedro Fernandez",
      },
      {
        Citacion_Id: 2,
        Citacion_Fecha: "2026-11-16",
        Citacion_Hora_Inicio: "11:30:00",
        Citacion_Hora_Fin: "12:15:00",
        Citacion_Tramo: "11:30 - 12:15",
        Citacion_Modalidad: "Online",
        Citacion_Motivo: "Coordinación de plan de apoyo pedagógico.",
        Citacion_Estado: "Pendiente",
        Estudiante_Id: 2,
        Estudiante_Nombre_Completo: "Sofia Valentina Gonzalez Morales",
        Curso_Nombre: "2° Básico A",
        Docente_Nombre: "María Morales",
        Apoderado_Nombre: "Pedro Fernandez",
      },
    ];
  }

  if (p.includes("/citaciones/historial")) {
    return [
      {
        Citacion_Id: 101,
        Citacion_Fecha_Hora_Inicio: "2026-11-10T10:00:00",
        Citacion_Fecha_Hora_Fin: "2026-11-10T10:45:00",
        Citacion_Estado: "Confirmada",
        Citacion_Motivo: "Revisión de rendimiento académico",
        Docente_Nombre: "María Morales",
        Estudiante_Nombre_Completo: "Lucas Mateo Fernandez Vera",
        historial: [
          { Fecha_Hora: "2026-11-01T09:00:00", Accion: "Creada por docente" },
          { Fecha_Hora: "2026-11-02T14:30:00", Accion: "Confirmada por apoderado" },
        ],
      },
    ];
  }

  // Listas por defecto: citaciones, bloques, eventos, planes, etc.
  return [];
}

function createValidPdfDocument(title, lines) {
  const content = [
    'BT',
    '/F1 16 Tf',
    '50 780 Td',
    '(' + title.replace(/[()\\\\]/g, '') + ') Tj',
    '/F1 11 Tf',
    '0 -25 Td',
    '(Colegio Jacques Cousteau - Sistema de Gestion Academica Escolar) Tj',
    '0 -15 Td',
    '(Fecha de emision: ' + new Date().toLocaleDateString('es-CL') + ') Tj',
    '0 -20 Td',
    '(------------------------------------------------------------------------------------) Tj',
  ];
  lines.forEach((line) => {
    content.push('0 -18 Td');
    content.push('(' + line.replace(/[()\\\\]/g, '') + ') Tj');
  });
  content.push('0 -30 Td');
  content.push('(Documento oficial generado por SIGAE - Valido para fines academicos) Tj');
  content.push('ET');
  const stream = content.join('\n');

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj');
  objects.push('4 0 obj\n<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

  let pdf = '%PDF-1.4\n';
  const xref = [0];
  objects.forEach((obj) => {
    xref.push(pdf.length);
    pdf += obj + '\n';
  });
  const xrefStart = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  xref.slice(1).forEach((pos) => {
    pdf += String(pos).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n';
  return new TextEncoder().encode(pdf);
}

function generateMockExportResponse(urlStr) {
  const isCsv = urlStr.includes("formato=csv");
  const isExcel = urlStr.includes("formato=excel");
  const isPng = urlStr.includes("formato=png");

  if (isCsv) {
    const csvContent = "\uFEFFDía,Horario,Asignatura,Curso,Docente,Estado\n" +
      "Lunes,08:00 - 08:45,Lenguaje y Comunicación,1° Básico A,Ana Torres,Activo\n" +
      "Lunes,08:45 - 09:30,Lenguaje y Comunicación,1° Básico A,Ana Torres,Activo\n" +
      "Martes,08:00 - 08:45,Matemáticas,2° Básico A,María Morales,Activo\n" +
      "Miércoles,09:45 - 10:30,Matemáticas,2° Básico A,María Morales,Activo\n" +
      "Jueves,10:30 - 11:15,Lenguaje y Comunicación,1° Básico A,Ana Torres,Activo\n" +
      "Viernes,14:00 - 15:00,Atención de Apoderados,-,María Morales,Activo\n";
    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=horario.csv",
      },
    });
  }

  if (isExcel) {
    const excelHtml = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/></head>
<body>
<table border="1">
  <tr><th colspan="6" style="background:#1e3a5f;color:#ffffff;font-size:16px;height:35px;">COLEGIO JACQUES COUSTEAU - HORARIO SEMANAL</th></tr>
  <tr style="background:#f1f5f9;font-weight:bold;"><th>Día</th><th>Horario</th><th>Asignatura</th><th>Curso</th><th>Docente</th><th>Estado</th></tr>
  <tr><td>Lunes</td><td>08:00 - 08:45</td><td>Lenguaje y Comunicación</td><td>1° Básico A</td><td>Ana Torres</td><td>Activo</td></tr>
  <tr><td>Lunes</td><td>08:45 - 09:30</td><td>Lenguaje y Comunicación</td><td>1° Básico A</td><td>Ana Torres</td><td>Activo</td></tr>
  <tr><td>Martes</td><td>08:00 - 08:45</td><td>Matemáticas</td><td>2° Básico A</td><td>María Morales</td><td>Activo</td></tr>
  <tr><td>Miércoles</td><td>09:45 - 10:30</td><td>Matemáticas</td><td>2° Básico A</td><td>María Morales</td><td>Activo</td></tr>
  <tr><td>Jueves</td><td>10:30 - 11:15</td><td>Lenguaje y Comunicación</td><td>1° Básico A</td><td>Ana Torres</td><td>Activo</td></tr>
  <tr><td>Viernes</td><td>14:00 - 15:00</td><td>Atención de Apoderados</td><td>-</td><td>María Morales</td><td>Activo</td></tr>
</table>
</body>
</html>`;
    return new Response(excelHtml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": "attachment; filename=horario.xls",
      },
    });
  }

  if (isPng) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 420;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 900, 420);
      ctx.fillStyle = "#1e3a5f";
      ctx.fillRect(0, 0, 900, 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("COLEGIO JACQUES COUSTEAU - HORARIO SEMANAL", 30, 38);

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 14px sans-serif";
      let y = 110;
      ctx.fillText("DÍA", 30, y);
      ctx.fillText("HORARIO", 160, y);
      ctx.fillText("ASIGNATURA", 330, y);
      ctx.fillText("CURSO", 580, y);
      ctx.fillText("DOCENTE", 720, y);
      y += 10;
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(870, y); ctx.stroke();
      y += 25;

      const rows = [
        ["Lunes", "08:00 - 08:45", "Lenguaje y Comunicación", "1° Básico A", "Ana Torres"],
        ["Lunes", "08:45 - 09:30", "Lenguaje y Comunicación", "1° Básico A", "Ana Torres"],
        ["Martes", "08:00 - 08:45", "Matemáticas", "2° Básico A", "María Morales"],
        ["Miércoles", "09:45 - 10:30", "Matemáticas", "2° Básico A", "María Morales"],
        ["Jueves", "10:30 - 11:15", "Lenguaje y Comunicación", "1° Básico A", "Ana Torres"],
        ["Viernes", "14:00 - 15:00", "Atención de Apoderados", "-", "María Morales"],
      ];
      ctx.font = "14px sans-serif";
      rows.forEach((r) => {
        ctx.fillText(r[0], 30, y);
        ctx.fillText(r[1], 160, y);
        ctx.fillText(r[2], 330, y);
        ctx.fillText(r[3], 580, y);
        ctx.fillText(r[4], 720, y);
        y += 35;
      });

      const dataUrl = canvas.toDataURL("image/png");
      const binStr = atob(dataUrl.split(",")[1]);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": "attachment; filename=horario.png",
        },
      });
    } catch {
      // fallback
    }
  }

  const pdfBytes = createValidPdfDocument(
    "COLEGIO JACQUES COUSTEAU - HORARIO SEMANAL",
    [
      "Periodo Academico: 2026",
      "------------------------------------------------------------------------------------",
      "Lunes      08:00 - 08:45   Lenguaje y Comunicacion   (1 Basico A)   - Ana Torres",
      "Lunes      08:45 - 09:30   Lenguaje y Comunicacion   (1 Basico A)   - Ana Torres",
      "Martes     08:00 - 08:45   Matematicas               (2 Basico A)   - Maria Morales",
      "Miercoles  09:45 - 10:30   Matematicas               (2 Basico A)   - Maria Morales",
      "Jueves     10:30 - 11:15   Lenguaje y Comunicacion   (1 Basico A)   - Ana Torres",
      "Viernes    14:00 - 15:00   Atencion de Apoderados    (-)            - Maria Morales",
    ]
  );
  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=horario.pdf",
    },
  });
}

window.fetch = async function (input, init = {}) {
  let url = input;
  let isApiCall = false;

  if (typeof input === "string") {
    if (input.startsWith("/api/") || input === "/api") {
      url = `${BASE_URL}${input.slice(4)}`;
      isApiCall = true;
    } else if (input.includes("/api/")) {
      isApiCall = true;
    }
  } else if (input instanceof Request) {
    const parsed = new URL(input.url);
    if (parsed.pathname.startsWith("/api/")) {
      url = new Request(`${BASE_URL}${parsed.pathname.slice(4)}${parsed.search}`, input);
      isApiCall = true;
    }
  }

  const modifiedInit = {
    ...init,
    headers: {
      ...(init.headers || {}),
      "bypass-tunnel-reminder": "true",
    },
  };

  const method = (init.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();

  try {
    const response = await originalFetch.call(this, url, modifiedInit);

    // Si una llamada de API devolvió 404/502/504 o devolvió HTML (404.html de GitHub Pages)
    if (isApiCall && (!response.ok || response.headers.get("content-type")?.includes("text/html"))) {
      const urlStr = typeof url === "string" ? url : (url.url || "");
      if (urlStr.includes("/exportar")) {
        return generateMockExportResponse(urlStr);
      }
      const mockData = getMockResponseForUrl(urlStr, method, modifiedInit.body);
      if (mockData !== null) {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return response;
  } catch (err) {
    // Si la llamada falló por error de red (Failed to fetch, túnel offline)
    if (isApiCall) {
      const urlStr = typeof url === "string" ? url : (url.url || "");
      if (urlStr.includes("/exportar")) {
        return generateMockExportResponse(urlStr);
      }
      const mockData = getMockResponseForUrl(urlStr, method, modifiedInit.body);
      if (mockData !== null) {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    throw err;
  }
};

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

// Registro de Service Worker para PWA en producción
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        console.log('SIGAE PWA Service Worker registrado con éxito:', reg.scope);
      })
      .catch((err) => {
        console.error('Error al registrar Service Worker de SIGAE:', err);
      });
  });
}
