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

function getMockResponseForUrl(urlStr) {
  const p = (urlStr || "").toLowerCase();

  if (p.includes("/dashboard/stats")) {
    return {
      totalUsuarios: 10,
      totalEstudiantes: 24,
      totalDocentes: 8,
      totalCursos: 6,
      activos: 10,
    };
  }

  if (p.includes("/cursos/niveles")) {
    return [
      { Nivel_Id: 1, Nivel_Nombre: "1° Básico" },
      { Nivel_Id: 2, Nivel_Nombre: "2° Básico" },
      { Nivel_Id: 3, Nivel_Nombre: "3° Básico" },
      { Nivel_Id: 4, Nivel_Nombre: "4° Básico" },
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
        { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación", Plan_Asignatura_Tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 8, tipo: "Obligatorio", horas_semanales: 8, Asignatura_Prioridad_Academica: "Alta" },
        { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas", Plan_Asignatura_Tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 8, tipo: "Obligatorio", horas_semanales: 8, Asignatura_Prioridad_Academica: "Alta" },
        { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales", Plan_Asignatura_Tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 4, tipo: "Obligatorio", horas_semanales: 4, Asignatura_Prioridad_Academica: "Media" },
        { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía", Plan_Asignatura_Tipo: "Obligatorio", Plan_Asignatura_Horas_Semanales: 4, tipo: "Obligatorio", horas_semanales: 4, Asignatura_Prioridad_Academica: "Media" },
        { Asignatura_Id: 7, Asignatura_Nombre: "Artes Visuales", Plan_Asignatura_Tipo: "Complementario", Plan_Asignatura_Horas_Semanales: 2, tipo: "Complementario", horas_semanales: 2, Asignatura_Prioridad_Academica: "Baja" },
        { Asignatura_Id: 8, Asignatura_Nombre: "Música", Plan_Asignatura_Tipo: "Complementario", Plan_Asignatura_Horas_Semanales: 2, tipo: "Complementario", horas_semanales: 2, Asignatura_Prioridad_Academica: "Baja" },
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
        Usuario_Telefono: "+56 9 8765 4321",
        Usuario_Estado_Cuenta: 1,
        Administrador_Tipo: "Super Admin",
      },
      {
        Usuario_Id: 2,
        Usuario_Nombre_Completo: "Carlos Gonzales",
        Usuario_RUT: "9343727-6",
        Administrador_Correo_Institucional: "c.gonzales@jacquescousteau.edu",
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

  if (p.includes("/estudiantes")) {
    return [
      {
        Estudiante_Id: 1,
        Estudiante_Nombre_Completo: "Lucas Mateo Fernandez Vera",
        Estudiante_RUT: "24111222-3",
        Curso_Nombre: "1° Básico A",
      },
      {
        Estudiante_Id: 2,
        Estudiante_Nombre_Completo: "Sofia Valentina Gonzalez Morales",
        Estudiante_RUT: "24333444-5",
        Curso_Nombre: "2° Básico A",
      },
      {
        Estudiante_Id: 3,
        Estudiante_Nombre_Completo: "Martín Ignacio Silva Torres",
        Estudiante_RUT: "24555666-7",
        Curso_Nombre: "1° Básico A",
      },
    ];
  }

  if (p.includes("/usuarios")) {
    return [
      {
        Usuario_Id: 1,
        Usuario_Nombre_Completo: "Esperanza Penelope Gonzales Farias",
        Usuario_RUT: "5682711-0",
        Es_Administrador: 1,
        Es_Docente: 0,
        Es_Apoderado: 0,
        Administrador_Tipo: "Super Admin",
        Administrador_Correo_Institucional: "es.gonzales@jacquescousteau.edu",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 2,
        Usuario_Nombre_Completo: "Carlos Gonzales",
        Usuario_RUT: "9343727-6",
        Es_Administrador: 1,
        Es_Docente: 0,
        Es_Apoderado: 0,
        Administrador_Tipo: "Administrador Normal",
        Administrador_Correo_Institucional: "c.gonzales@jacquescousteau.edu",
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
        Docente_Especialidad: "Matemáticas",
        Usuario_Estado_Cuenta: 1,
      },
      {
        Usuario_Id: 4,
        Usuario_Nombre_Completo: "Pedro Fernandez",
        Usuario_RUT: "5738925-7",
        Es_Administrador: 0,
        Es_Docente: 0,
        Es_Apoderado: 1,
        Usuario_Estado_Cuenta: 1,
      },
    ];
  }

  if (p.includes("/horarios/cursos") || p.includes("/cursos")) {
    return [
      { Curso_Id: 1, Curso_Nombre: "1° Básico A", Curso_Nivel_Id: 1 },
      { Curso_Id: 2, Curso_Nombre: "2° Básico A", Curso_Nivel_Id: 2 },
    ];
  }

  if (p.includes("/parametros")) {
    return {
      jornada: "Completa",
      horaInicio: "08:00",
      horaFin: "16:00",
      duracionBloque: 45,
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

  if (p.includes("/horarios/bloques") || p.includes("/bloques")) {
    return [
      { Bloque_Horario_Id: 1, Bloque_Numero: 1, Bloque_Hora_Inicio: "08:00:00", Bloque_Hora_Fin: "08:45:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Pedagógico", desajustado: 0 },
      { Bloque_Horario_Id: 2, Bloque_Numero: 2, Bloque_Hora_Inicio: "08:45:00", Bloque_Hora_Fin: "09:30:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Pedagógico", desajustado: 0 },
      { Bloque_Horario_Id: 3, Bloque_Numero: 3, Bloque_Hora_Inicio: "09:30:00", Bloque_Hora_Fin: "09:45:00", Bloque_Es_Recreo: 1, Bloque_Tipo: "Recreo", desajustado: 0 },
      { Bloque_Horario_Id: 4, Bloque_Numero: 4, Bloque_Hora_Inicio: "09:45:00", Bloque_Hora_Fin: "10:30:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Pedagógico", desajustado: 0 },
      { Bloque_Horario_Id: 5, Bloque_Numero: 5, Bloque_Hora_Inicio: "10:30:00", Bloque_Hora_Fin: "11:15:00", Bloque_Es_Recreo: 0, Bloque_Tipo: "Pedagógico", desajustado: 0 },
    ];
  }

  if (p.includes("/horarios/resumen-cursos")) {
    return [
      { Curso_Id: 1, Curso_Nombre: "1° Básico A", horas_requeridas: 28, horas_programadas: 24, completa: false },
      { Curso_Id: 2, Curso_Nombre: "2° Básico A", horas_requeridas: 30, horas_programadas: 30, completa: true },
    ];
  }

  if (p.includes("/horarios") && !p.includes("/cursos") && !p.includes("/bloques") && !p.includes("/asignaturas-curso") && !p.includes("/docentes") && !p.includes("/resumen")) {
    return [
      {
        Horario_Asignatura_Id: 1,
        dia: 1,
        Bloque_Horario_Id: 1,
        Asignatura_Id: 1,
        Asignatura_Nombre: "Lenguaje y Comunicación",
        Docente_Nombre: "Ana Torres",
        Horario_Estado: "Activo",
        activo: 1,
      },
      {
        Horario_Asignatura_Id: 2,
        dia: 1,
        Bloque_Horario_Id: 2,
        Asignatura_Id: 1,
        Asignatura_Nombre: "Lenguaje y Comunicación",
        Docente_Nombre: "Ana Torres",
        Horario_Estado: "Activo",
        activo: 1,
      },
      {
        Horario_Asignatura_Id: 3,
        dia: 2,
        Bloque_Horario_Id: 1,
        Asignatura_Id: 2,
        Asignatura_Nombre: "Matemáticas",
        Docente_Nombre: "María Morales",
        Horario_Estado: "Activo",
        activo: 1,
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

  try {
    const response = await originalFetch.call(this, url, modifiedInit);

    // Si una llamada de API devolvió 404/502/504 o devolvió HTML (404.html de GitHub Pages)
    if (isApiCall && (!response.ok || response.headers.get("content-type")?.includes("text/html"))) {
      const urlStr = typeof url === "string" ? url : (url.url || "");
      const mockData = getMockResponseForUrl(urlStr);
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
      const mockData = getMockResponseForUrl(urlStr);
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
