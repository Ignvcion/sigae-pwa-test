import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { AuthProvider } from "./pages/context/AuthContext";
import { BASE_URL } from "./services/api";

import "./index.css";

// ── GLOBAL STATEFUL MOCK STORE (RESILIENT OFFLINE & GH-PAGES DEMO) ───────────
let _nextIdCounter = 1000;
const nextId = () => ++_nextIdCounter;

// 1. Usuarios e Institución
let STORE_USUARIOS = [
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
    Usuario_Telefono: "+56 9 4321 8765",
    Usuario_Estado_Cuenta: 1,
  },
  {
    Usuario_Id: 4,
    Usuario_Nombre_Completo: "Pedro Fernandez",
    Usuario_RUT: "21143956-4",
    Es_Administrador: 0,
    Es_Docente: 0,
    Es_Apoderado: 1,
    Usuario_Correo: "p.fernandez@email.cl",
    Usuario_Telefono: "+56 9 3344 5566",
    Usuario_Estado_Cuenta: 1,
  },
  {
    Usuario_Id: 5,
    Usuario_Nombre_Completo: "Ana Torres",
    Usuario_RUT: "11222333-8",
    Es_Administrador: 0,
    Es_Docente: 1,
    Es_Apoderado: 0,
    Docente_Correo_Institucional: "a.torres@jacquescousteau.edu",
    Usuario_Correo: "a.torres@jacquescousteau.edu",
    Docente_Especialidad: "Lenguaje y Comunicación",
    Usuario_Telefono: "+56 9 5566 7788",
    Usuario_Estado_Cuenta: 1,
  },
  {
    Usuario_Id: 6,
    Usuario_Nombre_Completo: "Roberto Silva",
    Usuario_RUT: "14555666-4",
    Es_Administrador: 0,
    Es_Docente: 1,
    Es_Apoderado: 0,
    Docente_Correo_Institucional: "r.silva@jacquescousteau.edu",
    Usuario_Correo: "r.silva@jacquescousteau.edu",
    Docente_Especialidad: "Ciencias Naturales",
    Usuario_Telefono: "+56 9 6677 8899",
    Usuario_Estado_Cuenta: 1,
  },
  {
    Usuario_Id: 7,
    Usuario_Nombre_Completo: "Francisca Soto",
    Usuario_RUT: "16777888-2",
    Es_Administrador: 0,
    Es_Docente: 0,
    Es_Apoderado: 1,
    Usuario_Correo: "f.soto@email.cl",
    Usuario_Telefono: "+56 9 7788 9900",
    Usuario_Estado_Cuenta: 0, // Inactivo para pruebas
  },
];

// 2. Eventos Institucionales
let STORE_EVENTOS = [
  {
    Evento_Institucional_Id: 1,
    Evento_Institucional_Nombre: "Jornada Pedagógica Institucional",
    Evento_Institucional_Fecha: "2026-11-20",
    Evento_Institucional_Impacto_Clases: "Suspensión total",
    Evento_Institucional_Descripcion: "Jornada de capacitación docente y planificación semestral.",
    bloques_afectados_count: 2,
    bloques: [
      { Afecta_Id: 1, Bloque_Horario_Hora_Inicio: "08:00:00", Bloque_Horario_Hora_Fin: "08:45:00", Bloque_Horario_Jornada: "Mañana" },
      { Afecta_Id: 2, Bloque_Horario_Hora_Inicio: "08:45:00", Bloque_Horario_Hora_Fin: "09:30:00", Bloque_Horario_Jornada: "Mañana" },
    ],
    clases: [
      { Horario_Asignatura_Id: 1, curso: "1° Básico A", Curso_Nombre: "1° Básico A", asignatura: "Lenguaje y Comunicación", Asignatura_Nombre: "Lenguaje y Comunicación", docente: "Ana Torres", Docente_Nombre: "Ana Torres", hora_inicio: "08:00:00", hora_fin: "08:45:00" },
      { Horario_Asignatura_Id: 2, curso: "1° Básico A", Curso_Nombre: "1° Básico A", asignatura: "Lenguaje y Comunicación", Asignatura_Nombre: "Lenguaje y Comunicación", docente: "Ana Torres", Docente_Nombre: "Ana Torres", hora_inicio: "08:45:00", hora_fin: "09:30:00" },
    ],
    dia_semana: "Viernes",
  },
  {
    Evento_Institucional_Id: 2,
    Evento_Institucional_Nombre: "Olimpiadas Escolares Jacques Cousteau",
    Evento_Institucional_Fecha: "2026-11-27",
    Evento_Institucional_Impacto_Clases: "Suspensión jornada mañana",
    Evento_Institucional_Descripcion: "Competencias deportivas de atletismo y fútbol entre alianzas.",
    bloques_afectados_count: 3,
    bloques: [
      { Afecta_Id: 3, Bloque_Horario_Hora_Inicio: "09:45:00", Bloque_Horario_Hora_Fin: "10:30:00", Bloque_Horario_Jornada: "Mañana" },
    ],
    clases: [],
    dia_semana: "Viernes",
  },
  {
    Evento_Institucional_Id: 3,
    Evento_Institucional_Nombre: "Feria de Ciencias y Tecnología",
    Evento_Institucional_Fecha: "2026-12-04",
    Evento_Institucional_Impacto_Clases: "Salida anticipada",
    Evento_Institucional_Descripcion: "Muestra de proyectos científicos en el gimnasio del colegio.",
    bloques_afectados_count: 1,
    bloques: [],
    clases: [],
    dia_semana: "Viernes",
  },
  {
    Evento_Institucional_Id: 4,
    Evento_Institucional_Nombre: "Día del Profesor",
    Evento_Institucional_Fecha: "2026-10-16",
    Evento_Institucional_Impacto_Clases: "Suspensión total",
    Evento_Institucional_Descripcion: "Celebración y acto conmemorativo del Día del Profesor.",
    bloques_afectados_count: 0,
    bloques: [],
    clases: [],
    dia_semana: "Viernes",
  },
  {
    Evento_Institucional_Id: 5,
    Evento_Institucional_Nombre: "Aniversario del Colegio Jacques Cousteau",
    Evento_Institucional_Fecha: "2026-10-02",
    Evento_Institucional_Impacto_Clases: "Suspensión total",
    Evento_Institucional_Descripcion: "Acto solemne por el aniversario de la fundación del colegio.",
    bloques_afectados_count: 0,
    bloques: [],
    clases: [],
    dia_semana: "Viernes",
  },
];

// 3. Bloques Horarios Institucionales
let STORE_BLOQUES = [
  {
    Bloque_Horario_Id: 1,
    Bloque_Horario_Hora_Inicio: "08:00:00",
    Bloque_Horario_Hora_Fin: "08:45:00",
    Bloque_Horario_Jornada: "Mañana",
    Bloque_Horario_Tipo: "Clase",
    clases: 4,
    eventos: 1,
    activo: 1,
  },
  {
    Bloque_Horario_Id: 2,
    Bloque_Horario_Hora_Inicio: "08:45:00",
    Bloque_Horario_Hora_Fin: "09:30:00",
    Bloque_Horario_Jornada: "Mañana",
    Bloque_Horario_Tipo: "Clase",
    clases: 4,
    eventos: 1,
    activo: 1,
  },
  {
    Bloque_Horario_Id: 3,
    Bloque_Horario_Hora_Inicio: "09:30:00",
    Bloque_Horario_Hora_Fin: "09:45:00",
    Bloque_Horario_Jornada: "Mañana",
    Bloque_Horario_Tipo: "Recreo",
    clases: 0,
    eventos: 0,
    activo: 1,
  },
  {
    Bloque_Horario_Id: 4,
    Bloque_Horario_Hora_Inicio: "09:45:00",
    Bloque_Horario_Hora_Fin: "10:30:00",
    Bloque_Horario_Jornada: "Mañana",
    Bloque_Horario_Tipo: "Clase",
    clases: 3,
    eventos: 0,
    activo: 1,
  },
  {
    Bloque_Horario_Id: 5,
    Bloque_Horario_Hora_Inicio: "10:30:00",
    Bloque_Horario_Hora_Fin: "11:15:00",
    Bloque_Horario_Jornada: "Mañana",
    Bloque_Horario_Tipo: "Clase",
    clases: 3,
    eventos: 0,
    activo: 1,
  },
];

// 4. Catálogo de Asignaturas
let STORE_ASIGNATURAS = [
  { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación", Asignatura_Prioridad_Academica: "Alta" },
  { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas", Asignatura_Prioridad_Academica: "Alta" },
  { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales", Asignatura_Prioridad_Academica: "Media" },
  { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía", Asignatura_Prioridad_Academica: "Media" },
  { Asignatura_Id: 5, Asignatura_Nombre: "Inglés", Asignatura_Prioridad_Academica: "Media" },
  { Asignatura_Id: 6, Asignatura_Nombre: "Educación Física", Asignatura_Prioridad_Academica: "Baja" },
  { Asignatura_Id: 7, Asignatura_Nombre: "Artes Visuales", Asignatura_Prioridad_Academica: "Baja" },
  { Asignatura_Id: 8, Asignatura_Nombre: "Música", Asignatura_Prioridad_Academica: "Baja" },
];

// 5. Citaciones
let STORE_CITACIONES = [
  {
    Citacion_Id: 1,
    Citacion_Fecha: "2026-11-12",
    Citacion_Hora_Inicio: "10:00:00",
    Citacion_Hora_Fin: "10:45:00",
    Citacion_Estado: "Futura",
    Citacion_Motivo: "Revisión de rendimiento académico y apoyo en lenguaje.",
    Citacion_Modalidad: "Presencial",
    Estudiante_Id: 1,
    Estudiante_Nombre_Completo: "Lucas Mateo Fernandez Vera",
    Curso_Nombre: "1° Básico A",
    Docente_Nombre: "María Morales",
    Apoderado_Nombre: "Pedro Fernandez",
    historial: [
      { Historial_Id: 1, Historial_Fecha_Registro: "2026-11-02", Historial_Hora_Registro: "09:00:00", Accion: "Citación coordinada" }
    ],
  },
  {
    Citacion_Id: 2,
    Citacion_Fecha: "2026-11-16",
    Citacion_Hora_Inicio: "11:30:00",
    Citacion_Hora_Fin: "12:15:00",
    Citacion_Estado: "Pendiente",
    Citacion_Motivo: "Coordinación de plan de apoyo pedagógico.",
    Citacion_Modalidad: "Online",
    Estudiante_Id: 2,
    Estudiante_Nombre_Completo: "Sofia Valentina Gonzalez Morales",
    Curso_Nombre: "2° Básico A",
    Docente_Nombre: "María Morales",
    Apoderado_Nombre: "Pedro Fernandez",
    historial: [
      { Historial_Id: 2, Historial_Fecha_Registro: "2026-11-04", Historial_Hora_Registro: "14:15:00", Accion: "Solicitud registrada" }
    ],
  },
  {
    Citacion_Id: 3,
    Citacion_Fecha: "2026-11-05",
    Citacion_Hora_Inicio: "08:45:00",
    Citacion_Hora_Fin: "09:30:00",
    Citacion_Estado: "Confirmada",
    Citacion_Motivo: "Entrevista de seguimiento primer semestre.",
    Citacion_Modalidad: "Presencial",
    Estudiante_Id: 1,
    Estudiante_Nombre_Completo: "Lucas Mateo Fernandez Vera",
    Curso_Nombre: "1° Básico A",
    Docente_Nombre: "Ana Torres",
    Apoderado_Nombre: "Pedro Fernandez",
    historial: [
      { Historial_Id: 3, Historial_Fecha_Registro: "2026-10-28", Historial_Hora_Registro: "11:00:00", Accion: "Confirmada por apoderado" }
    ],
  },
];

// 6. Horarios de Curso y Docentes
let STORE_HORARIOS = [
  {
    Horario_Asignatura_Id: 1,
    Curso_Id: 1,
    curso: "1° Básico A",
    Curso_Nombre: "1° Básico A",
    Asignatura_Id: 1,
    asignatura: "Lenguaje y Comunicación",
    Asignatura_Nombre: "Lenguaje y Comunicación",
    Usuario_Id: 5,
    docente: "Ana Torres",
    Docente_Nombre: "Ana Torres",
    Bloque_Horario_Id: 1,
    hora_inicio: "08:00:00",
    hora_fin: "08:45:00",
    dia: "Lunes",
    estado: "Activo",
    Horario_Estado: "Activo",
    eliminado: 0,
    observaciones: ["Clase regular de Lenguaje y Comunicación."]
  },
  {
    Horario_Asignatura_Id: 2,
    Curso_Id: 1,
    curso: "1° Básico A",
    Curso_Nombre: "1° Básico A",
    Asignatura_Id: 1,
    asignatura: "Lenguaje y Comunicación",
    Asignatura_Nombre: "Lenguaje y Comunicación",
    Usuario_Id: 5,
    docente: "Ana Torres",
    Docente_Nombre: "Ana Torres",
    Bloque_Horario_Id: 2,
    hora_inicio: "08:45:00",
    hora_fin: "09:30:00",
    dia: "Lunes",
    estado: "Activo",
    Horario_Estado: "Activo",
    eliminado: 0,
    observaciones: ["Clase regular de Lenguaje y Comunicación."]
  },
  {
    Horario_Asignatura_Id: 3,
    Curso_Id: 1,
    curso: "1° Básico A",
    Curso_Nombre: "1° Básico A",
    Asignatura_Id: 2,
    asignatura: "Matemáticas",
    Asignatura_Nombre: "Matemáticas",
    Usuario_Id: 3,
    docente: "María Morales",
    Docente_Nombre: "María Morales",
    Bloque_Horario_Id: 4,
    hora_inicio: "09:45:00",
    hora_fin: "10:30:00",
    dia: "Martes",
    estado: "Activo",
    Horario_Estado: "Activo",
    eliminado: 0,
    observaciones: ["Clase regular de Matemáticas."]
  },
  {
    Horario_Asignatura_Id: 4,
    Curso_Id: 1,
    curso: "1° Básico A",
    Curso_Nombre: "1° Básico A",
    Asignatura_Id: 2,
    asignatura: "Matemáticas",
    Asignatura_Nombre: "Matemáticas",
    Usuario_Id: 3,
    docente: "María Morales",
    Docente_Nombre: "María Morales",
    Bloque_Horario_Id: 5,
    hora_inicio: "10:30:00",
    hora_fin: "11:15:00",
    dia: "Martes",
    estado: "Activo",
    Horario_Estado: "Activo",
    eliminado: 0,
    observaciones: ["Clase regular de Matemáticas."]
  },
  {
    Horario_Asignatura_Id: 5,
    Curso_Id: 1,
    curso: "1° Básico A",
    Curso_Nombre: "1° Básico A",
    Asignatura_Id: 3,
    asignatura: "Ciencias Naturales",
    Asignatura_Nombre: "Ciencias Naturales",
    Usuario_Id: 6,
    docente: "Roberto Silva",
    Docente_Nombre: "Roberto Silva",
    Bloque_Horario_Id: 5,
    hora_inicio: "10:30:00",
    hora_fin: "11:15:00",
    dia: "Miércoles",
    estado: "Activo",
    Horario_Estado: "Activo",
    eliminado: 0,
    observaciones: ["Clase regular de Ciencias Naturales."]
  },
];

// Helper para extraer ID numérico de URL
function parseUrlId(url) {
  const m = String(url).match(/\/(\d+)(?:[/?#]|$)/);
  return m ? Number(m[1]) : null;
}

// Interceptor Mock Inteligente y Reactivo
function getMockResponseForUrl(urlStr, method = "GET", reqBody = null) {
  const p = (urlStr || "").toLowerCase();
  const m = (method || "GET").toUpperCase();
  const reqId = parseUrlId(urlStr);

  let b = null;
  if (reqBody) {
    try {
      b = typeof reqBody === "string" ? JSON.parse(reqBody) : reqBody;
    } catch {}
  }

  // ── 1. MUTACIONES (POST, PUT, PATCH, DELETE) ──────────────────────────────
  if (m === "POST") {
    // Búsqueda de usuarios (acepta POST /api/usuarios/buscar)
    if (p.includes("/usuarios/buscar")) {
      const qRut = (b?.rut || "").trim().toLowerCase();
      const qNom = (b?.nombre || "").trim().toLowerCase();
      const qCor = (b?.correo || "").trim().toLowerCase();
      return STORE_USUARIOS.filter((u) => {
        const mRut = !qRut || (u.Usuario_RUT || "").toLowerCase().includes(qRut);
        const mNom = !qNom || (u.Usuario_Nombre_Completo || "").toLowerCase().includes(qNom);
        const mCor = !qCor || (u.Usuario_Correo || u.Administrador_Correo_Institucional || u.Docente_Correo_Institucional || "").toLowerCase().includes(qCor);
        return mRut && mNom && mCor;
      });
    }

    // Crear Citación
    if (p.includes("/citaciones")) {
      const nueva = {
        Citacion_Id: nextId(),
        Citacion_Fecha: b?.fecha || "2026-11-20",
        Citacion_Hora_Inicio: (b?.tramo || "10:00 - 10:45").split(" - ")[0] || "10:00:00",
        Citacion_Hora_Fin: (b?.tramo || "10:00 - 10:45").split(" - ")[1] || "10:45:00",
        Citacion_Estado: "Pendiente",
        Citacion_Motivo: b?.motivo || "Entrevista con apoderado",
        Citacion_Modalidad: b?.modalidad || "Presencial",
        Estudiante_Id: Number(b?.estudianteId) || 1,
        Estudiante_Nombre_Completo: Number(b?.estudianteId) === 2 ? "Sofia Valentina Gonzalez Morales" : "Lucas Mateo Fernandez Vera",
        Curso_Nombre: Number(b?.estudianteId) === 2 ? "2° Básico A" : "1° Básico A",
        Docente_Nombre: "María Morales",
        Apoderado_Nombre: "Pedro Fernandez",
        historial: [
          { Historial_Id: nextId(), Historial_Fecha_Registro: new Date().toISOString().slice(0, 10), Historial_Hora_Registro: "10:00:00", Accion: "Citación creada por docente" }
        ]
      };
      STORE_CITACIONES.unshift(nueva);
      return { ok: true, status: 200, id: nueva.Citacion_Id, mensaje: "Citación creada, pendiente de confirmación" };
    }

    // Crear Evento Institucional
    if (p.includes("/eventos")) {
      const nuevo = {
        Evento_Institucional_Id: nextId(),
        Evento_Institucional_Nombre: b?.Evento_Institucional_Nombre || b?.nombre || "Nuevo Evento Institucional",
        Evento_Institucional_Fecha: b?.Evento_Institucional_Fecha || b?.fecha || "2026-11-25",
        Evento_Institucional_Impacto_Clases: b?.Evento_Institucional_Impacto_Clases || b?.impacto || "Suspensión total",
        Evento_Institucional_Descripcion: b?.Evento_Institucional_Descripcion || b?.descripcion || "Evento registrado por dirección.",
        bloques_afectados_count: (b?.bloques || []).length || 2,
        bloques: (b?.bloques || []).map((bl, i) => ({
          Afecta_Id: i + 1,
          Bloque_Horario_Hora_Inicio: bl.Bloque_Horario_Hora_Inicio || "08:00:00",
          Bloque_Horario_Hora_Fin: bl.Bloque_Horario_Hora_Fin || "08:45:00",
          Bloque_Horario_Jornada: bl.Bloque_Horario_Jornada || "Mañana"
        })),
        clases: [],
        dia_semana: "Miércoles"
      };
      STORE_EVENTOS.unshift(nuevo);
      return { ok: true, status: 200, id: nuevo.Evento_Institucional_Id, mensaje: "Evento registrado correctamente" };
    }

    // Crear Bloque Horario
    if (p.includes("/bloques")) {
      const nuevo = {
        Bloque_Horario_Id: nextId(),
        Bloque_Horario_Hora_Inicio: b?.Bloque_Horario_Hora_Inicio || "08:00:00",
        Bloque_Horario_Hora_Fin: b?.Bloque_Horario_Hora_Fin || "08:45:00",
        Bloque_Horario_Jornada: b?.Bloque_Horario_Jornada || "Mañana",
        Bloque_Horario_Tipo: b?.Bloque_Horario_Tipo || "Clase",
        clases: 0,
        eventos: 0,
        activo: 1
      };
      STORE_BLOQUES.push(nuevo);
      return { ok: true, status: 200, id: nuevo.Bloque_Horario_Id, mensaje: "Bloque registrado exitosamente" };
    }

    // Crear Asignatura
    if (p.includes("/planes/asignaturas")) {
      const nueva = {
        Asignatura_Id: nextId(),
        Asignatura_Nombre: b?.nombre || "Nueva Asignatura",
        Asignatura_Prioridad_Academica: b?.prioridad || "Media"
      };
      STORE_ASIGNATURAS.push(nueva);
      return { ok: true, status: 200, id: nueva.Asignatura_Id, mensaje: "Asignatura registrada correctamente" };
    }

    // Crear Clase en Horario
    if (p.includes("/horarios")) {
      const nuevaClase = {
        Horario_Asignatura_Id: nextId(),
        Curso_Id: b?.Curso_Id || 1,
        curso: "1° Básico A",
        Asignatura_Id: b?.Asignatura_Id || 1,
        asignatura: STORE_ASIGNATURAS.find(a => a.Asignatura_Id === b?.Asignatura_Id)?.Asignatura_Nombre || "Asignatura",
        Usuario_Id: b?.Usuario_Id || 5,
        docente: STORE_USUARIOS.find(u => u.Usuario_Id === b?.Usuario_Id)?.Usuario_Nombre_Completo || "Docente Asignado",
        Bloque_Horario_Id: b?.Bloque_Horario_Id || 1,
        hora_inicio: b?.hora_inicio || "08:00:00",
        hora_fin: b?.hora_fin || "08:45:00",
        dia: b?.dia || "Lunes",
        estado: "Activo",
        Horario_Estado: "Activo",
        eliminado: 0,
        observaciones: ["Clase programada."]
      };
      STORE_HORARIOS.push(nuevaClase);
      return { ok: true, status: 200, id: nuevaClase.Horario_Asignatura_Id, mensaje: "Clase asignada exitosamente" };
    }

    // Registrar Administrador / Usuario
    if (p.includes("/usuarios/administradores") || p.includes("/usuarios")) {
      const nuevoUsuario = {
        Usuario_Id: nextId(),
        Usuario_Nombre_Completo: b?.Usuario_Nombre_Completo || b?.nombre || "Administrador Nuevo",
        Usuario_RUT: b?.Usuario_RUT || b?.rut || "12345678-5",
        Es_Administrador: 1,
        Es_Docente: 0,
        Es_Apoderado: 0,
        Administrador_Tipo: "Administrador Normal",
        Administrador_Correo_Institucional: b?.Administrador_Correo_Institucional || b?.correo || "admin.nuevo@jacquescousteau.edu",
        Usuario_Correo: b?.Usuario_Correo || b?.correo || "admin.nuevo@jacquescousteau.edu",
        Usuario_Telefono: b?.Usuario_Telefono || b?.telefono || "+56 9 1122 3344",
        Usuario_Estado_Cuenta: 1
      };
      STORE_USUARIOS.push(nuevoUsuario);
      return { ok: true, status: 200, mensaje: "Administrador registrado exitosamente" };
    }

    return { ok: true, status: 200, id: nextId(), mensaje: "Operación realizada con éxito" };
  }

  if (m === "DELETE") {
    if (p.includes("/eventos")) {
      if (reqId) STORE_EVENTOS = STORE_EVENTOS.filter(e => e.Evento_Institucional_Id !== reqId);
      return { ok: true, status: 200, mensaje: "Evento eliminado correctamente" };
    }
    if (p.includes("/bloques")) {
      if (reqId) STORE_BLOQUES = STORE_BLOQUES.filter(blk => blk.Bloque_Horario_Id !== reqId);
      return { ok: true, status: 200, mensaje: "Bloque eliminado exitosamente" };
    }
    if (p.includes("/citaciones")) {
      if (reqId) STORE_CITACIONES = STORE_CITACIONES.filter(c => c.Citacion_Id !== reqId);
      return { ok: true, status: 200, mensaje: "Citación cancelada exitosamente" };
    }
    if (p.includes("/horarios")) {
      if (reqId) {
        STORE_HORARIOS = STORE_HORARIOS.map(h =>
          h.Horario_Asignatura_Id === reqId ? { ...h, estado: "Eliminado", Horario_Estado: "Eliminado", eliminado: 1 } : h
        );
      }
      return { ok: true, status: 200, mensaje: "Clase eliminada" };
    }
    return { ok: true, status: 200, mensaje: "Eliminado con éxito" };
  }

  if (m === "PUT" || m === "PATCH") {
    if (p.includes("/eventos") && reqId) {
      STORE_EVENTOS = STORE_EVENTOS.map(e => e.Evento_Institucional_Id === reqId ? { ...e, ...b } : e);
      return { ok: true, status: 200, mensaje: "Evento actualizado correctamente" };
    }
    if (p.includes("/bloques") && reqId) {
      STORE_BLOQUES = STORE_BLOQUES.map(blk => blk.Bloque_Horario_Id === reqId ? { ...blk, ...b } : blk);
      return { ok: true, status: 200, mensaje: "Bloque actualizado exitosamente" };
    }
    if (p.includes("/planes/asignaturas") && reqId) {
      STORE_ASIGNATURAS = STORE_ASIGNATURAS.map(a => a.Asignatura_Id === reqId ? { ...a, Asignatura_Nombre: b?.nombre || a.Asignatura_Nombre, Asignatura_Prioridad_Academica: b?.prioridad || a.Asignatura_Prioridad_Academica } : a);
      return { ok: true, status: 200, mensaje: "Asignatura actualizada correctamente" };
    }
    if (p.includes("/horarios") && p.includes("/restaurar") && reqId) {
      STORE_HORARIOS = STORE_HORARIOS.map(h =>
        h.Horario_Asignatura_Id === reqId ? { ...h, estado: "Activo", Horario_Estado: "Activo", eliminado: 0 } : h
      );
      return { ok: true, status: 200, mensaje: "Clase restaurada exitosamente" };
    }
    return { ok: true, status: 200, mensaje: "Actualizado con éxito" };
  }

  // ── 2. CONSULTAS (GET) ───────────────────────────────────────────────────

  // Detalle de evento individual por ID (ej: /api/eventos/1)
  if (p.includes("/eventos") && reqId) {
    const encontrado = STORE_EVENTOS.find(e => e.Evento_Institucional_Id === reqId) || STORE_EVENTOS[0];
    return {
      ...encontrado,
      bloques: encontrado.bloques || [],
      clases: encontrado.clases || [],
      dia_semana: encontrado.dia_semana || "Viernes",
    };
  }

  // Eventos Institucionales completos
  if (p.includes("/eventos")) {
    return STORE_EVENTOS;
  }

  // Detalle de bloque horario (ej: /api/horarios/bloque-detalle/1)
  if (p.includes("/bloque-detalle") || p.includes("detalle")) {
    const matchH = (reqId && STORE_HORARIOS.find(h => h.Horario_Asignatura_Id === reqId)) || STORE_HORARIOS[0];
    return {
      curso: matchH.curso || matchH.Curso_Nombre || "1° Básico A",
      nivelEducativo: "1° Básico",
      dia: matchH.dia || "Lunes",
      horaInicio: matchH.hora_inicio || "08:00:00",
      horaFin: matchH.hora_fin || "08:45:00",
      hora_inicio: matchH.hora_inicio || "08:00:00",
      hora_fin: matchH.hora_fin || "08:45:00",
      jornada: "Mañana",
      tipoBloque: "Clase",
      asignatura: matchH.asignatura || matchH.Asignatura_Nombre || "Lenguaje y Comunicación",
      prioridadAcademica: "Alta",
      docente: matchH.docente || matchH.Docente_Nombre || "Ana Torres",
      especialidadDocente: "Lenguaje y Comunicación",
      estado: matchH.estado || matchH.Horario_Estado || "Activo",
      observaciones: matchH.observaciones || ["Clase regular planificada en jornada mañana."],
    };
  }

  // Citaciones de historial
  if (p.includes("/citaciones/historial")) {
    return STORE_CITACIONES;
  }

  // Citación individual por ID
  if (p.includes("/citaciones/") && reqId && !p.includes("/estudiante")) {
    const found = STORE_CITACIONES.find(c => c.Citacion_Id === reqId) || STORE_CITACIONES[0];
    return {
      ...found,
      historial: found.historial || []
    };
  }

  // Citaciones activas
  if (p.includes("/citaciones") && !p.includes("/contactos")) {
    return STORE_CITACIONES;
  }

  // Contactos de apoderados para citación
  if (p.includes("/citaciones/estudiante/") && p.includes("/contactos")) {
    return {
      titular: {
        Usuario_Id: 4,
        Usuario_Nombre_Completo: "Pedro Fernandez",
        Usuario_Correo: "p.fernandez@email.cl",
        Usuario_Telefono: "+56 9 3344 5566",
      },
      suplentes: [],
    };
  }

  // Bloques horarios institucionales
  if (p.includes("/bloques")) {
    return STORE_BLOQUES;
  }

  // Asignaturas de planes educativos
  if (p.includes("/planes/asignaturas")) {
    return STORE_ASIGNATURAS;
  }

  // Asignaturas disponibles para asignar a un curso
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
    ];
  }

  // Dashboard Estadísticas
  if (p.includes("/dashboard/stats")) {
    return {
      usuarios: STORE_USUARIOS.length,
      docentes: STORE_USUARIOS.filter(u => u.Es_Docente).length,
      apoderados: STORE_USUARIOS.filter(u => u.Es_Apoderado).length,
      estudiantes: 24,
      cursos: 6,
      citaciones: STORE_CITACIONES.length,
      totalUsuarios: STORE_USUARIOS.length,
      totalDocentes: STORE_USUARIOS.filter(u => u.Es_Docente).length,
      totalApoderados: STORE_USUARIOS.filter(u => u.Es_Apoderado).length,
      totalEstudiantes: 24,
      totalCursos: 6,
      totalCitaciones: STORE_CITACIONES.length,
    };
  }

  // Administradores
  if (p.includes("/usuarios/administradores")) {
    return STORE_USUARIOS.filter(u => u.Es_Administrador);
  }

  // Docentes
  if (p.includes("/docentes")) {
    return STORE_USUARIOS.filter(u => u.Es_Docente).map(d => ({
      ...d,
      Docente_Correo_Institucional: d.Docente_Correo_Institucional || d.Usuario_Correo,
      Usuario_Telefono: d.Usuario_Telefono,
      Carga_Horaria_Maxima: 36,
      Docente_Especialidad: d.Docente_Especialidad || "General"
    }));
  }

  // Estudiantes
  if (p.includes("/estudiantes")) {
    return [
      {
        Estudiante_Id: 1,
        Estudiante_Nombre_Completo: "Lucas Mateo Fernandez Vera",
        Estudiante_RUT: "24111222-3",
        Curso_Nombre: "1° Básico A",
        Curso_Id: 1,
        Apoderado_Nombre: "Pedro Fernandez",
        Apoderado_Usuario_Id: 4,
        Usuario_Telefono: "+56 9 3344 5566",
        Usuario_Correo: "p.fernandez@email.cl",
      },
      {
        Estudiante_Id: 2,
        Estudiante_Nombre_Completo: "Sofia Valentina Gonzalez Morales",
        Estudiante_RUT: "25222333-1",
        Curso_Nombre: "2° Básico A",
        Curso_Id: 2,
        Apoderado_Nombre: "Pedro Fernandez",
        Apoderado_Usuario_Id: 4,
        Usuario_Telefono: "+56 9 3344 5566",
        Usuario_Correo: "p.fernandez@email.cl",
      },
    ];
  }

  // Cursos
  if (p.includes("/horarios/cursos") || p.includes("/cursos")) {
    if (p.includes("/niveles")) {
      return [
        { Nivel_Educativo_Id: 1, Nivel_Educativo_Nombre: "1° Básico" },
        { Nivel_Educativo_Id: 2, Nivel_Educativo_Nombre: "2° Básico" },
        { Nivel_Educativo_Id: 3, Nivel_Educativo_Nombre: "3° Básico" },
      ];
    }
    return [
      { Curso_Id: 1, Curso_Nombre: "1° Básico A", curso: "1° Básico A", Nivel_Educativo_Id: 1, Nivel_Educativo_Nombre: "1° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
      { Curso_Id: 2, Curso_Nombre: "2° Básico A", curso: "2° Básico A", Nivel_Educativo_Id: 2, Nivel_Educativo_Nombre: "2° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
      { Curso_Id: 3, Curso_Nombre: "3° Básico A", curso: "3° Básico A", Nivel_Educativo_Id: 3, Nivel_Educativo_Nombre: "3° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
    ];
  }

  // Horario Maestro
  if (p.includes("/horarios/maestro")) {
    return STORE_HORARIOS;
  }

  // Horario de Docente
  if (p.includes("/horarios/docente/") && p.includes("/horario")) {
    return STORE_HORARIOS.filter(h => h.Usuario_Id === 3 || h.Usuario_Id === 5 || h.estado !== "Eliminado");
  }

  // Parámetros institucionales
  if (p.includes("/parametros")) {
    return {
      Parametro_Institucional_Id: 1,
      Parametro_Institucional_Nombre_Colegio: "Colegio Jacques Cousteau",
      nombre_colegio: "Colegio Jacques Cousteau",
      Parametro_Institucional_Inicio_Jornada: "08:00:00",
      Parametro_Institucional_Fin_Jornada: "16:00:00",
      Parametro_Institucional_Duracion_Bloque: 45,
      Parametro_Institucional_Duracion_Recreo: 15,
      Parametro_Institucional_Bloques_Maximos_Diarios: 8,
    };
  }

  // Horarios de curso
  if (p.includes("/horarios") && !p.includes("/exportar")) {
    return STORE_HORARIOS;
  }

  // Lista general de Usuarios con filtros
  if (p.includes("/usuarios")) {
    let filtrados = [...STORE_USUARIOS];
    if (p.includes("rol=administrador")) filtrados = filtrados.filter((u) => u.Es_Administrador);
    else if (p.includes("rol=docente")) filtrados = filtrados.filter((u) => u.Es_Docente);
    else if (p.includes("rol=apoderado")) filtrados = filtrados.filter((u) => u.Es_Apoderado);
    if (p.includes("estado=1")) filtrados = filtrados.filter((u) => u.Usuario_Estado_Cuenta === 1);
    else if (p.includes("estado=0")) filtrados = filtrados.filter((u) => u.Usuario_Estado_Cuenta === 0);
    return filtrados;
  }

  return [];
}

// Generador de respuestas mock de exportación (PDF, Excel, CSV, PNG)
function generateMockExportResponse(urlStr) {
  const p = (urlStr || "").toLowerCase();
  const esPdf = p.includes("pdf") || p.includes("formato=pdf");
  const esExcel = p.includes("excel") || p.includes("xlsx") || p.includes("formato=excel");
  const esCsv = p.includes("csv") || p.includes("formato=csv");
  const esPng = p.includes("png") || p.includes("formato=png");

  if (esCsv) {
    const csvContent = "Día,Hora Inicio,Hora Fin,Curso,Asignatura,Docente\nLunes,08:00,08:45,1° Básico A,Lenguaje y Comunicación,Ana Torres\nLunes,08:45,09:30,1° Básico A,Lenguaje y Comunicación,Ana Torres\nMartes,09:45,10:30,1° Básico A,Matemáticas,María Morales\nMartes,10:30,11:15,1° Básico A,Matemáticas,María Morales\nMiércoles,10:30,11:15,1° Básico A,Ciencias Naturales,Roberto Silva";
    return new Response(new Blob([csvContent], { type: "text/csv;charset=utf-8" }), {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8" }
    });
  }

  if (esExcel) {
    const csvForExcel = "\uFEFFDía,Hora Inicio,Hora Fin,Curso,Asignatura,Docente\nLunes,08:00,08:45,1° Básico A,Lenguaje y Comunicación,Ana Torres\nLunes,08:45,09:30,1° Básico A,Lenguaje y Comunicación,Ana Torres\nMartes,09:45,10:30,1° Básico A,Matemáticas,María Morales\nMartes,10:30,11:15,1° Básico A,Matemáticas,María Morales\nMiércoles,10:30,11:15,1° Básico A,Ciencias Naturales,Roberto Silva";
    return new Response(new Blob([csvForExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), {
      status: 200,
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    });
  }

  if (esPng) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="20" y="20" width="760" height="50" fill="#1e3a5f" rx="8"/>
      <text x="40" y="52" fill="#ffffff" font-family="sans-serif" font-size="20" font-weight="bold">Colegio Jacques Cousteau - Horario Académico</text>
      <text x="40" y="120" fill="#1e3a5f" font-family="sans-serif" font-size="16">Lunes 08:00 - 09:30 : Lenguaje y Comunicación (Ana Torres)</text>
      <text x="40" y="160" fill="#1e3a5f" font-family="sans-serif" font-size="16">Martes 09:45 - 11:15 : Matemáticas (María Morales)</text>
      <text x="40" y="200" fill="#1e3a5f" font-family="sans-serif" font-size="16">Miércoles 10:30 - 11:15 : Ciencias Naturales (Roberto Silva)</text>
    </svg>`;
    return new Response(new Blob([svg], { type: "image/svg+xml" }), {
      status: 200,
      headers: { "Content-Type": "image/png" }
    });
  }

  // Por defecto: PDF estructurado
  const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 200 >> stream
BT
/F1 18 Tf 50 720 Td (Colegio Jacques Cousteau - Horario Institucional) Tj
/F1 12 Tf 0 -30 Td (Generado conforme al Sistema de Gestion Academica Escolar SIGAE) Tj
0 -25 Td (Lunes 08:00 - 09:30 : Lenguaje y Comunicacion - Ana Torres) Tj
0 -20 Td (Martes 09:45 - 11:15 : Matematicas - Maria Morales) Tj
0 -20 Td (Miercoles 10:30 - 11:15 : Ciencias Naturales - Roberto Silva) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000227 00000 n 
0000000480 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
547
%%EOF`;
  return new Response(new Blob([pdfContent], { type: "application/pdf" }), {
    status: 200,
    headers: { "Content-Type": "application/pdf" }
  });
}

// ── FETCH INTERCEPTOR GLOBAL ───────────────────────────────────────────────
const originalFetch = window.fetch;

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
