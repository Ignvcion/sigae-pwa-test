import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { AuthProvider } from "./pages/context/AuthContext";
import { BASE_URL } from "./services/api";

import "./index.css";

// ── GLOBAL STATEFUL MOCK STORE (RESILIENT OFFLINE & GH-PAGES DEMO) ───────────
let _nextIdCounter = 1000;
const nextId = () => ++_nextIdCounter;
// ── PERSISTENT STORAGE HELPERS (RETAIN MOCK STATE ACROSS REFRESHES) ─────────
function loadStore(key, fallback) {
  try {
    const raw = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(key) : null;
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

function saveStore(key, data) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(data));
    }
  } catch {}
}


// 1. Usuarios e Institución
const SEED_USUARIOS = [
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
  {
    Usuario_Id: 8,
    Usuario_Nombre_Completo: "Gonzalo Andres Ramos Herrera",
    Usuario_RUT: "15888999-2",
    Es_Administrador: 0,
    Es_Docente: 1,
    Es_Apoderado: 0,
    Docente_Correo_Institucional: "g.ramos@jacquescousteau.edu",
    Usuario_Correo: "g.ramos@jacquescousteau.edu",
    Docente_Especialidad: "Historia y Geografía",
    Usuario_Telefono: "+56 9 7788 9900",
    Usuario_Estado_Cuenta: 0, // Inactivo para pruebas
  },
];

let STORE_USUARIOS = loadStore("SIGAE_USUARIOS", SEED_USUARIOS);


// Asegurar que el docente inactivo esté presente en STORE_USUARIOS
if (!STORE_USUARIOS.some(u => u.Usuario_Id === 8)) {
  STORE_USUARIOS.push({
    Usuario_Id: 8,
    Usuario_Nombre_Completo: "Gonzalo Andres Ramos Herrera",
    Usuario_RUT: "15888999-2",
    Es_Administrador: 0,
    Es_Docente: 1,
    Es_Apoderado: 0,
    Docente_Correo_Institucional: "g.ramos@jacquescousteau.edu",
    Usuario_Correo: "g.ramos@jacquescousteau.edu",
    Docente_Especialidad: "Historia y Geografía",
    Usuario_Telefono: "+56 9 7788 9900",
    Usuario_Estado_Cuenta: 0,
  });
  saveStore("SIGAE_USUARIOS", STORE_USUARIOS);
}

// 2. Eventos Institucionales
const SEED_EVENTOS = [
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

let STORE_EVENTOS = loadStore("SIGAE_EVENTOS", SEED_EVENTOS);

// 3. Bloques Horarios Institucionales
const SEED_BLOQUES = [
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

let STORE_BLOQUES = loadStore("SIGAE_BLOQUES", SEED_BLOQUES);

// 4. Catálogo de Asignaturas
const SEED_ASIGNATURAS = [
  { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación", Asignatura_Prioridad_Academica: "Alta" },
  { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas", Asignatura_Prioridad_Academica: "Alta" },
  { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales", Asignatura_Prioridad_Academica: "Media" },
  { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía", Asignatura_Prioridad_Academica: "Media" },
  { Asignatura_Id: 5, Asignatura_Nombre: "Inglés", Asignatura_Prioridad_Academica: "Media" },
  { Asignatura_Id: 6, Asignatura_Nombre: "Educación Física", Asignatura_Prioridad_Academica: "Baja" },
  { Asignatura_Id: 7, Asignatura_Nombre: "Artes Visuales", Asignatura_Prioridad_Academica: "Baja" },
  { Asignatura_Id: 8, Asignatura_Nombre: "Música", Asignatura_Prioridad_Academica: "Baja" },
];

let STORE_ASIGNATURAS = loadStore("SIGAE_ASIGNATURAS", SEED_ASIGNATURAS);

// 5. Citaciones
const SEED_CITACIONES = [
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

let STORE_CITACIONES = loadStore("SIGAE_CITACIONES", SEED_CITACIONES);

// 6. Horarios de Curso y Docentes
const SEED_HORARIOS = [
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


let STORE_HORARIOS = loadStore("SIGAE_HORARIOS", SEED_HORARIOS);

// 7. Cursos Institucionales
const STORE_CURSOS = [
  { Curso_Id: 1, Curso_Nombre: "1° Básico A", curso: "1° Básico A", Nivel_Educativo_Id: 1, Nivel_Educativo_Nombre: "1° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
  { Curso_Id: 2, Curso_Nombre: "2° Básico A", curso: "2° Básico A", Nivel_Educativo_Id: 2, Nivel_Educativo_Nombre: "2° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
  { Curso_Id: 3, Curso_Nombre: "3° Básico A", curso: "3° Básico A", Nivel_Educativo_Id: 3, Nivel_Educativo_Nombre: "3° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
  { Curso_Id: 4, Curso_Nombre: "4° Básico A", curso: "4° Básico A", Nivel_Educativo_Id: 4, Nivel_Educativo_Nombre: "4° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
  { Curso_Id: 5, Curso_Nombre: "5° Básico A", curso: "5° Básico A", Nivel_Educativo_Id: 5, Nivel_Educativo_Nombre: "5° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
  { Curso_Id: 6, Curso_Nombre: "6° Básico A", curso: "6° Básico A", Nivel_Educativo_Id: 6, Nivel_Educativo_Nombre: "6° Básico", Cupo_Maximo: 35, Jornada: "Mañana" },
];

// 8. Estudiantes (24 estudiantes base vinculados a cursos y apoderados)
const SEED_ESTUDIANTES = [
  {
    "Estudiante_Id": 1,
    "Estudiante_Nombre_Completo": "Lucas Mateo Fernandez Vera",
    "Estudiante_RUT": "24111222-3",
    "Curso_Id": 1,
    "Curso_Nombre": "1° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "100",
    "Estudiante_Direccion_Depto": "Dept 1",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "100",
    "depto": "Dept 1",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Pedro Fernandez",
    "Apoderado_Usuario_Id": 4,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 2,
    "Estudiante_Nombre_Completo": "Sofia Valentina Gonzalez Morales",
    "Estudiante_RUT": "25222333-1",
    "Curso_Id": 2,
    "Curso_Nombre": "2° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "115",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "115",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Pedro Fernandez",
    "Apoderado_Usuario_Id": 4,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 3,
    "Estudiante_Nombre_Completo": "Benjamin Alonso Castro Rojas",
    "Estudiante_RUT": "24333444-5",
    "Curso_Id": 3,
    "Curso_Nombre": "3° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "130",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "130",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 4,
    "Estudiante_Nombre_Completo": "Martina Isidora Silva Munoz",
    "Estudiante_RUT": "24444555-7",
    "Curso_Id": 4,
    "Curso_Nombre": "4° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "145",
    "Estudiante_Direccion_Depto": "Dept 4",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "145",
    "depto": "Dept 4",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 5,
    "Estudiante_Nombre_Completo": "Mateo Nicolas Torres Tapia",
    "Estudiante_RUT": "24555666-9",
    "Curso_Id": 5,
    "Curso_Nombre": "5° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "160",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "160",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 6,
    "Estudiante_Nombre_Completo": "Florencia Paz Morales Araya",
    "Estudiante_RUT": "25666777-2",
    "Curso_Id": 6,
    "Curso_Nombre": "6° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "175",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "175",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 7,
    "Estudiante_Nombre_Completo": "Joaquin Andres Herrera Diaz",
    "Estudiante_RUT": "24777888-4",
    "Curso_Id": 1,
    "Curso_Nombre": "1° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "190",
    "Estudiante_Direccion_Depto": "Dept 7",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "190",
    "depto": "Dept 7",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 8,
    "Estudiante_Nombre_Completo": "Isidora Belen Espinoza Perez",
    "Estudiante_RUT": "25888999-6",
    "Curso_Id": 2,
    "Curso_Nombre": "2° Básico A",
    "Estudiante_Estado_Academico": "Irregular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "205",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "205",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 9,
    "Estudiante_Nombre_Completo": "Tomas Ignacio Alvarez Soto",
    "Estudiante_RUT": "24999000-8",
    "Curso_Id": 3,
    "Curso_Nombre": "3° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "220",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "220",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 10,
    "Estudiante_Nombre_Completo": "Agustina Javiera Sepulveda Contreras",
    "Estudiante_RUT": "25000111-0",
    "Curso_Id": 4,
    "Curso_Nombre": "4° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "235",
    "Estudiante_Direccion_Depto": "Dept 10",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "235",
    "depto": "Dept 10",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 11,
    "Estudiante_Nombre_Completo": "Vicente Emilio Carrasco Lopez",
    "Estudiante_RUT": "24123456-7",
    "Curso_Id": 5,
    "Curso_Nombre": "5° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "250",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "250",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 12,
    "Estudiante_Nombre_Completo": "Emilia Sofia Fuentes Valenzuela",
    "Estudiante_RUT": "25234567-8",
    "Curso_Id": 6,
    "Curso_Nombre": "6° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "265",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "265",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 13,
    "Estudiante_Nombre_Completo": "Maximiliano David Reyes Parra",
    "Estudiante_RUT": "24345678-9",
    "Curso_Id": 1,
    "Curso_Nombre": "1° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "280",
    "Estudiante_Direccion_Depto": "Dept 13",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "280",
    "depto": "Dept 13",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 14,
    "Estudiante_Nombre_Completo": "Antonella Millaray Bravo Sandoval",
    "Estudiante_RUT": "25456789-0",
    "Curso_Id": 2,
    "Curso_Nombre": "2° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "295",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "295",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 15,
    "Estudiante_Nombre_Completo": "Felipe Ignacio Nunez Gutierrez",
    "Estudiante_RUT": "24567890-1",
    "Curso_Id": 3,
    "Curso_Nombre": "3° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "310",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "310",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 16,
    "Estudiante_Nombre_Completo": "Catalina Andrea Molina Vergara",
    "Estudiante_RUT": "25678901-2",
    "Curso_Id": 4,
    "Curso_Nombre": "4° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "325",
    "Estudiante_Direccion_Depto": "Dept 16",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "325",
    "depto": "Dept 16",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 17,
    "Estudiante_Nombre_Completo": "Cristobal Alexis Vega Romero",
    "Estudiante_RUT": "24789012-3",
    "Curso_Id": 5,
    "Curso_Nombre": "5° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "340",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "340",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 18,
    "Estudiante_Nombre_Completo": "Constanza Leonor Campos Pinto",
    "Estudiante_RUT": "25890123-4",
    "Curso_Id": 6,
    "Curso_Nombre": "6° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "355",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "355",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 19,
    "Estudiante_Nombre_Completo": "Alonso Gabriel Castillo Figueroa",
    "Estudiante_RUT": "24901234-5",
    "Curso_Id": 1,
    "Curso_Nombre": "1° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "370",
    "Estudiante_Direccion_Depto": "Dept 19",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "370",
    "depto": "Dept 19",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 20,
    "Estudiante_Nombre_Completo": "Francisca Ignacia Cortes Gallardo",
    "Estudiante_RUT": "25012345-6",
    "Curso_Id": 2,
    "Curso_Nombre": "2° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "385",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "385",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 21,
    "Estudiante_Nombre_Completo": "Martin Eduardo Garrido Ortiz",
    "Estudiante_RUT": "24135790-2",
    "Curso_Id": 3,
    "Curso_Nombre": "3° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "400",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "400",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 22,
    "Estudiante_Nombre_Completo": "Javiera Paz Medina Delgado",
    "Estudiante_RUT": "25246801-3",
    "Curso_Id": 4,
    "Curso_Nombre": "4° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "415",
    "Estudiante_Direccion_Depto": "Dept 22",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "415",
    "depto": "Dept 22",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 23,
    "Estudiante_Nombre_Completo": "Diego Alejandro Riquelme Cardenas",
    "Estudiante_RUT": "24357912-4",
    "Curso_Id": 5,
    "Curso_Nombre": "5° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "430",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "430",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Francisca Soto",
    "Apoderado_Usuario_Id": 7,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  },
  {
    "Estudiante_Id": 24,
    "Estudiante_Nombre_Completo": "Valentina Rocio Sanchez Miranda",
    "Estudiante_RUT": "25468023-5",
    "Curso_Id": 6,
    "Curso_Nombre": "6° Básico A",
    "Estudiante_Estado_Academico": "Regular",
    "Estudiante_Direccion_Calle": "Av. Las Perdices",
    "Estudiante_Direccion_Numero": "445",
    "Estudiante_Direccion_Depto": "",
    "Estudiante_Direccion_Comuna": "La Florida",
    "calle": "Av. Las Perdices",
    "numero": "445",
    "depto": "",
    "comuna": "La Florida",
    "Apoderado_Nombre": "Sin asignar",
    "Apoderado_Usuario_Id": null,
    "Usuario_Telefono": "+56 9 3344 5566",
    "Usuario_Correo": "apoderado@email.cl"
  }
];
let STORE_ESTUDIANTES = loadStore("SIGAE_ESTUDIANTES", SEED_ESTUDIANTES);

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

  // ═════════════════════════════════════════════════════════════════════════
  // 1. MUTACIONES (POST, PUT, PATCH, DELETE) CON PERSISTENCIA LOCAL
  // ═════════════════════════════════════════════════════════════════════════
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
        Citacion_Fecha: b?.fecha || b?.Citacion_Fecha || "2026-11-20",
        Citacion_Hora_Inicio: (b?.tramo || b?.Citacion_Tramo_Horario || "10:00 - 10:45").split(" - ")[0] || "10:00:00",
        Citacion_Hora_Fin: (b?.tramo || b?.Citacion_Tramo_Horario || "10:00 - 10:45").split(" - ")[1] || "10:45:00",
        Citacion_Tramo_Horario: b?.tramo || b?.Citacion_Tramo_Horario || "10:00 - 10:45",
        Citacion_Estado: "Pendiente",
        Citacion_Motivo: b?.motivo || b?.Citacion_Motivo || "Entrevista con apoderado",
        Citacion_Modalidad: b?.modalidad || b?.Citacion_Modalidad || "Presencial",
        Estudiante_Id: Number(b?.estudianteId || b?.Estudiante_Id) || 1,
        Estudiante_Nombre_Completo: Number(b?.estudianteId || b?.Estudiante_Id) === 2 ? "Sofia Valentina Gonzalez Morales" : "Lucas Mateo Fernandez Vera",
        Curso_Nombre: Number(b?.estudianteId || b?.Estudiante_Id) === 2 ? "2° Básico A" : "1° Básico A",
        Docente_Nombre: "María Morales",
        Apoderado_Nombre: "Pedro Fernandez",
        historial: [
          { Historial_Id: nextId(), Historial_Fecha_Registro: new Date().toISOString().slice(0, 10), Historial_Hora_Registro: "10:00:00", Accion: "Citación creada por docente", Historial_Descripcion_Cambio: "Citación agendada inicialmente en estado Pendiente" }
        ]
      };
      STORE_CITACIONES.unshift(nueva);
      saveStore("SIGAE_CITACIONES", STORE_CITACIONES);
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
      saveStore("SIGAE_EVENTOS", STORE_EVENTOS);
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
      saveStore("SIGAE_BLOQUES", STORE_BLOQUES);
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
      saveStore("SIGAE_ASIGNATURAS", STORE_ASIGNATURAS);
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
      saveStore("SIGAE_HORARIOS", STORE_HORARIOS);
      return { ok: true, status: 200, id: nuevaClase.Horario_Asignatura_Id, mensaje: "Clase asignada exitosamente" };
    }

    // Asignar apoderado a uno o más estudiantes
    if (p.includes("/estudiantes/asignar-apoderado")) {
      const apoId = Number(b?.apoderadoId);
      const apo = STORE_USUARIOS.find(u => u.Usuario_Id === apoId);
      const ids = b?.estudianteIds || [];
      STORE_ESTUDIANTES = STORE_ESTUDIANTES.map(e => {
        if (ids.includes(e.Estudiante_Id)) {
          return {
            ...e,
            Apoderado_Usuario_Id: apoId,
            Apoderado_Nombre: apo?.Usuario_Nombre_Completo || "Apoderado Asignado",
            Usuario_Telefono: apo?.Usuario_Telefono || e.Usuario_Telefono,
            Usuario_Correo: apo?.Usuario_Correo || apo?.Apoderado_Correo_Natural || e.Usuario_Correo,
          };
        }
        return e;
      });
      saveStore("SIGAE_ESTUDIANTES", STORE_ESTUDIANTES);
      return { ok: true, status: 200, mensaje: "Estudiantes asignados correctamente" };
    }

    // Registrar Estudiante (CU Ficha Estudiantil)
    if (p.includes("/estudiantes")) {
      const cId = Number(b?.Curso_Id || b?.curso) || 1;
      const cNombre = STORE_CURSOS.find(c => c.Curso_Id === cId)?.Curso_Nombre || (cId + "° Básico A");
      const nuevoEst = {
        Estudiante_Id: nextId(),
        Estudiante_Nombre_Completo: b?.Estudiante_Nombre_Completo || b?.nombre || "Estudiante Nuevo",
        Estudiante_RUT: b?.Estudiante_RUT || b?.rut || "25123456-7",
        Curso_Id: cId,
        Curso_Nombre: cNombre,
        Estudiante_Estado_Academico: b?.Estudiante_Estado_Academico || b?.estadoAcademico || "Regular",
        Estudiante_Direccion_Calle: b?.Estudiante_Calle || b?.calle || "",
        Estudiante_Direccion_Numero: b?.Estudiante_Numero || b?.numero || "",
        Estudiante_Direccion_Depto: b?.Estudiante_Depto || b?.depto || "",
        Estudiante_Direccion_Comuna: b?.Estudiante_Comuna || b?.comuna || "",
        calle: b?.Estudiante_Calle || b?.calle || "",
        numero: b?.Estudiante_Numero || b?.numero || "",
        depto: b?.Estudiante_Depto || b?.depto || "",
        comuna: b?.Estudiante_Comuna || b?.comuna || "",
        Apoderado_Nombre: null,
        Apoderado_Usuario_Id: null,
        Usuario_Telefono: "",
        Usuario_Correo: "",
      };
      STORE_ESTUDIANTES.unshift(nuevoEst);
      saveStore("SIGAE_ESTUDIANTES", STORE_ESTUDIANTES);
      return { ok: true, status: 201, id: nuevoEst.Estudiante_Id, mensaje: "Ficha estudiantil registrada correctamente" };
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
      saveStore("SIGAE_USUARIOS", STORE_USUARIOS);
      return { ok: true, status: 200, mensaje: "Administrador registrado exitosamente" };
    }

    return { ok: true, status: 200, id: nextId(), mensaje: "Operación realizada con éxito" };
  }

  if (m === "DELETE") {
    // Eliminar todas las asociaciones de un apoderado
    if (p.includes("/estudiantes/apoderado/") && p.includes("/todas")) {
      const apoId = reqId;
      STORE_ESTUDIANTES = STORE_ESTUDIANTES.map(e =>
        e.Apoderado_Usuario_Id === apoId
          ? { ...e, Apoderado_Usuario_Id: null, Apoderado_Nombre: null }
          : e
      );
      saveStore("SIGAE_ESTUDIANTES", STORE_ESTUDIANTES);
      return { ok: true, status: 200, mensaje: "Todas las asociaciones fueron eliminadas exitosamente" };
    }

    // Quitar asociación puntual estudiante-apoderado (/api/estudiantes/:id/apoderado)
    if (p.includes("/estudiantes") && p.includes("/apoderado") && reqId) {
      STORE_ESTUDIANTES = STORE_ESTUDIANTES.map(e =>
        e.Estudiante_Id === reqId
          ? { ...e, Apoderado_Usuario_Id: null, Apoderado_Nombre: null }
          : e
      );
      saveStore("SIGAE_ESTUDIANTES", STORE_ESTUDIANTES);
      return { ok: true, status: 200, mensaje: "Asociación eliminada exitosamente" };
    }

    // Eliminar estudiante
    if (p.includes("/estudiantes") && reqId) {
      STORE_ESTUDIANTES = STORE_ESTUDIANTES.filter(e => e.Estudiante_Id !== reqId);
      saveStore("SIGAE_ESTUDIANTES", STORE_ESTUDIANTES);
      return { ok: true, status: 200, mensaje: "Estudiante eliminado exitosamente" };
    }

    if (p.includes("/eventos")) {
      if (reqId) STORE_EVENTOS = STORE_EVENTOS.filter(e => e.Evento_Institucional_Id !== reqId);
      saveStore("SIGAE_EVENTOS", STORE_EVENTOS);
      return { ok: true, status: 200, mensaje: "Evento eliminado correctamente" };
    }
    if (p.includes("/bloques")) {
      if (reqId) STORE_BLOQUES = STORE_BLOQUES.filter(blk => blk.Bloque_Horario_Id !== reqId);
      saveStore("SIGAE_BLOQUES", STORE_BLOQUES);
      return { ok: true, status: 200, mensaje: "Bloque eliminado exitosamente" };
    }
    if (p.includes("/citaciones")) {
      if (reqId) STORE_CITACIONES = STORE_CITACIONES.filter(c => c.Citacion_Id !== reqId);
      saveStore("SIGAE_CITACIONES", STORE_CITACIONES);
      return { ok: true, status: 200, mensaje: "Citación cancelada exitosamente" };
    }
    if (p.includes("/horarios")) {
      if (reqId) {
        STORE_HORARIOS = STORE_HORARIOS.map(h =>
          h.Horario_Asignatura_Id === reqId ? { ...h, estado: "Eliminado", Horario_Estado: "Eliminado", eliminado: 1 } : h
        );
        saveStore("SIGAE_HORARIOS", STORE_HORARIOS);
      }
      return { ok: true, status: 200, mensaje: "Clase eliminada" };
    }
    return { ok: true, status: 200, mensaje: "Eliminado con éxito" };
  }

  if (m === "PUT" || m === "PATCH") {
    // Editar usuario o administrador
    if (p.includes("/usuarios") && reqId) {
      STORE_USUARIOS = STORE_USUARIOS.map(u => {
        if (u.Usuario_Id === reqId) {
          return {
            ...u,
            ...b,
            Usuario_Telefono: b?.Usuario_Telefono ?? b?.telefono ?? u.Usuario_Telefono,
            Usuario_Correo: b?.Administrador_Correo_Institucional ?? b?.correo ?? u.Usuario_Correo,
            Administrador_Correo_Institucional: b?.Administrador_Correo_Institucional ?? b?.correo ?? u.Administrador_Correo_Institucional,
            Docente_Correo_Institucional: b?.Docente_Correo_Institucional ?? b?.correo ?? u.Docente_Correo_Institucional,
            Usuario_Estado_Cuenta: b?.Usuario_Estado_Cuenta !== undefined ? Number(b.Usuario_Estado_Cuenta) : (b?.estado !== undefined ? (b.estado ? 1 : 0) : u.Usuario_Estado_Cuenta),
          };
        }
        return u;
      });
      saveStore("SIGAE_USUARIOS", STORE_USUARIOS);
      return { ok: true, status: 200, mensaje: "Administrador actualizado correctamente" };
    }

    // Reasignar apoderado de estudiante (/api/estudiantes/:id/apoderado)
    if (p.includes("/estudiantes") && p.includes("/apoderado") && reqId) {
      const apoId = Number(b?.apoderadoId);
      const apo = STORE_USUARIOS.find(u => u.Usuario_Id === apoId);
      STORE_ESTUDIANTES = STORE_ESTUDIANTES.map(e =>
        e.Estudiante_Id === reqId
          ? {
              ...e,
              Apoderado_Usuario_Id: apoId || null,
              Apoderado_Nombre: apo ? apo.Usuario_Nombre_Completo : null,
              Usuario_Telefono: apo ? apo.Usuario_Telefono : e.Usuario_Telefono,
              Usuario_Correo: apo ? (apo.Usuario_Correo || apo.Apoderado_Correo_Natural) : e.Usuario_Correo
            }
          : e
      );
      saveStore("SIGAE_ESTUDIANTES", STORE_ESTUDIANTES);
      return { ok: true, status: 200, mensaje: "Asociación actualizada exitosamente" };
    }

    // Editar estudiante puntual
    if (p.includes("/estudiantes") && reqId) {
      STORE_ESTUDIANTES = STORE_ESTUDIANTES.map(e => {
        if (e.Estudiante_Id === reqId) {
          const cId = b?.Curso_Id ? Number(b.Curso_Id) : e.Curso_Id;
          const cNombre = b?.Curso_Nombre || STORE_CURSOS.find(c => c.Curso_Id === cId)?.Curso_Nombre || e.Curso_Nombre;
          return {
            ...e,
            ...b,
            Curso_Id: cId,
            Curso_Nombre: cNombre,
            Estudiante_Estado_Academico: b?.Estudiante_Estado_Academico || b?.estadoAcademico || e.Estudiante_Estado_Academico,
          };
        }
        return e;
      });
      saveStore("SIGAE_ESTUDIANTES", STORE_ESTUDIANTES);
      return { ok: true, status: 200, mensaje: "Estudiante actualizado exitosamente" };
    }

    if (p.includes("/eventos") && reqId) {
      STORE_EVENTOS = STORE_EVENTOS.map(e => e.Evento_Institucional_Id === reqId ? { ...e, ...b } : e);
      saveStore("SIGAE_EVENTOS", STORE_EVENTOS);
      return { ok: true, status: 200, mensaje: "Evento actualizado correctamente" };
    }
    if (p.includes("/bloques") && reqId) {
      STORE_BLOQUES = STORE_BLOQUES.map(blk => blk.Bloque_Horario_Id === reqId ? { ...blk, ...b } : blk);
      saveStore("SIGAE_BLOQUES", STORE_BLOQUES);
      return { ok: true, status: 200, mensaje: "Bloque actualizado exitosamente" };
    }
    if (p.includes("/planes/asignaturas") && reqId) {
      STORE_ASIGNATURAS = STORE_ASIGNATURAS.map(a => a.Asignatura_Id === reqId ? { ...a, Asignatura_Nombre: b?.nombre || a.Asignatura_Nombre, Asignatura_Prioridad_Academica: b?.prioridad || a.Asignatura_Prioridad_Academica } : a);
      saveStore("SIGAE_ASIGNATURAS", STORE_ASIGNATURAS);
      return { ok: true, status: 200, mensaje: "Asignatura actualizada correctamente" };
    }
    if (p.includes("/horarios") && p.includes("/restaurar") && reqId) {
      STORE_HORARIOS = STORE_HORARIOS.map(h =>
        h.Horario_Asignatura_Id === reqId ? { ...h, estado: "Activo", Horario_Estado: "Activo", eliminado: 0 } : h
      );
      saveStore("SIGAE_HORARIOS", STORE_HORARIOS);
      return { ok: true, status: 200, mensaje: "Clase restaurada exitosamente" };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. CONSULTAS (GET) DINÁMICAS Y REACTIVAS
  // ═════════════════════════════════════════════════════════════════════════

  // Bloques afectados por evento (/api/bloques/eventos/:id/afectados o /api/eventos/:id/afectados)
  if (p.includes("/eventos") && p.includes("/afectados")) {
    const encontrado = STORE_EVENTOS.find(e => e.Evento_Institucional_Id === reqId) || STORE_EVENTOS[0];
    return encontrado?.bloques || [];
  }

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
  if (p.includes("/bloque-detalle")) {
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

  // Citaciones de historial y pendientes
  if (p.includes("/citaciones/pendientes")) {
    return STORE_CITACIONES.filter(c => c.Citacion_Estado === "Pendiente");
  }
  if (p.includes("/citaciones/historial")) {
    return STORE_CITACIONES;
  }

  // Citación individual por ID
  if (p.includes("/citaciones/") && reqId && !p.includes("/estudiante")) {
    const found = STORE_CITACIONES.find(c => c.Citacion_Id === reqId) || STORE_CITACIONES[0];
    return {
      ...found,
      historial: found.historial || [
        { Historial_Id: 1, Historial_Fecha_Registro: found.Citacion_Fecha, Historial_Hora_Registro: found.Citacion_Hora_Inicio, Accion: "Citación creada", Historial_Descripcion_Cambio: "Citación creada" }
      ]
    };
  }

  // Citaciones lista general (agenda para docente, apoderado o administrador)
  if (p.includes("/citaciones") && !p.includes("/solicitud") && !p.includes("/contactos")) {
    return STORE_CITACIONES;
  }

  // Contactos de apoderados para citación
  if (p.includes("/citaciones/estudiante/") && p.includes("/contactos")) {
    return {
      titular: {
        Usuario_Id: 4,
        Usuario_Nombre_Completo: "Pedro Fernandez",
        Apoderado_Correo_Natural: "p.fernandez@email.cl",
        Usuario_Telefono: "+56 9 3344 5566"
      },
      suplentes: []
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

  // Planes educativos
  if (p.includes("/planes")) {
    return [
      {
        Plan_Educativo_Id: 1,
        Plan_Educativo_Nombre: "Plan General Básica 2026",
        Nivel_Educativo_Id: 1,
        Nivel_Educativo_Nombre: "1° Básico",
        horas_semanales_requeridas: 38,
        asignaturas: [
          { Asignatura_Id: 1, Asignatura_Nombre: "Lenguaje y Comunicación", Horas_Semanales: 8, Prioridad_Academica: "Alta", Asignatura_Tipo: "Obligatoria" },
          { Asignatura_Id: 2, Asignatura_Nombre: "Matemáticas", Horas_Semanales: 8, Prioridad_Academica: "Alta", Asignatura_Tipo: "Obligatoria" },
          { Asignatura_Id: 3, Asignatura_Nombre: "Ciencias Naturales", Horas_Semanales: 4, Prioridad_Academica: "Media", Asignatura_Tipo: "Obligatoria" },
          { Asignatura_Id: 4, Asignatura_Nombre: "Historia y Geografía", Horas_Semanales: 4, Prioridad_Academica: "Media", Asignatura_Tipo: "Obligatoria" },
        ]
      }
    ];
  }

  // Verificar si RUT de estudiante ya existe (/api/estudiantes/verificar-rut?rut=...)
  if (p.includes("/estudiantes/verificar-rut")) {
    try {
      const urlObj = new URL(urlStr, "http://localhost");
      const rutQ = (urlObj.searchParams.get("rut") || "").trim().toLowerCase();
      const existe = STORE_ESTUDIANTES.some(e => (e.Estudiante_RUT || "").toLowerCase() === rutQ);
      return { existe };
    } catch {
      return { existe: false };
    }
  }

  // Estudiantes sin apoderado asignado
  if (p.includes("/estudiantes/sin-apoderado")) {
    return STORE_ESTUDIANTES.filter(e => !e.Apoderado_Usuario_Id);
  }

  // Buscar estudiantes por nombre o RUT (/api/estudiantes/buscar?criterio=...)
  if (p.includes("/estudiantes/buscar")) {
    try {
      const urlObj = new URL(urlStr, "http://localhost");
      const crit = (urlObj.searchParams.get("criterio") || "").trim().toLowerCase();
      if (!crit) return STORE_ESTUDIANTES;
      return STORE_ESTUDIANTES.filter(e =>
        (e.Estudiante_Nombre_Completo || "").toLowerCase().includes(crit) ||
        (e.Estudiante_RUT || "").toLowerCase().includes(crit)
      );
    } catch {
      return STORE_ESTUDIANTES;
    }
  }

  // Estudiantes asociados a apoderado (/api/estudiantes/apoderado/:id/asociados)
  if (p.includes("/estudiantes/apoderado/") && p.includes("/asociados")) {
    if (urlStr.includes("/asociados/")) {
      const parts = urlStr.split("/asociados/");
      const estId = parseInt(parts[1], 10);
      return STORE_ESTUDIANTES.find(e => e.Estudiante_Id === estId) || STORE_ESTUDIANTES[0];
    }
    if (reqId) {
      return STORE_ESTUDIANTES.filter(e => e.Apoderado_Usuario_Id === reqId);
    }
    return STORE_ESTUDIANTES.filter(e => e.Apoderado_Usuario_Id);
  }

  // Dashboard Estadísticas - Reactivo y Dinámico
  if (p.includes("/dashboard/stats")) {
    return {
      usuarios: STORE_USUARIOS.length,
      docentes: STORE_USUARIOS.filter(u => u.Es_Docente).length,
      apoderados: STORE_USUARIOS.filter(u => u.Es_Apoderado).length,
      estudiantes: STORE_ESTUDIANTES.length,
      cursos: STORE_CURSOS.length,
      citaciones: STORE_CITACIONES.length,
      totalUsuarios: STORE_USUARIOS.length,
      totalDocentes: STORE_USUARIOS.filter(u => u.Es_Docente).length,
      totalApoderados: STORE_USUARIOS.filter(u => u.Es_Apoderado).length,
      totalEstudiantes: STORE_ESTUDIANTES.length,
      totalCursos: STORE_CURSOS.length,
      totalCitaciones: STORE_CITACIONES.length,
    };
  }

  // Administradores
  if (p.includes("/usuarios/administradores")) {
    return STORE_USUARIOS.filter(u => u.Es_Administrador);
  }

  // Docentes (soporta filtros por especialidad y estado activo/inactivo)
  if (p.includes("/docentes")) {
    let list = STORE_USUARIOS.filter(u => u.Es_Docente);
    try {
      const urlObj = new URL(urlStr, "http://localhost");
      const esp = (urlObj.searchParams.get("especialidad") || "").trim().toLowerCase();
      const est = urlObj.searchParams.get("estado");
      if (esp) {
        list = list.filter(d => (d.Docente_Especialidad || "").toLowerCase().includes(esp));
      }
      if (est !== null && est !== "" && est !== undefined) {
        list = list.filter(d => String(d.Usuario_Estado_Cuenta) === String(est));
      }
    } catch {}
    return list.map(d => ({
      ...d,
      Docente_Correo_Institucional: d.Docente_Correo_Institucional || d.Usuario_Correo,
      Usuario_Telefono: d.Usuario_Telefono,
      Carga_Horaria_Maxima: 36,
      Docente_Especialidad: d.Docente_Especialidad || "General"
    }));
  }

  // Apoderados (con cálculo dinámico de estudiantes vinculados y filtrado por operador)
  if (p.includes("/apoderados")) {
    let lista = STORE_USUARIOS.filter(u => u.Es_Apoderado).map(u => ({
      ...u,
      Apoderado_Correo_Natural: u.Usuario_Correo,
      Total_Estudiantes_Asociados: STORE_ESTUDIANTES.filter(e => e.Apoderado_Usuario_Id === u.Usuario_Id).length,
    }));
    try {
      const urlObj = new URL(urlStr, "http://localhost");
      const op = urlObj.searchParams.get("operador") || "=";
      const cantStr = urlObj.searchParams.get("cantidadEstudiantes");
      if (cantStr !== null && cantStr !== "" && cantStr !== undefined) {
        const cant = Number(cantStr);
        if (!isNaN(cant)) {
          lista = lista.filter(u => {
            const t = u.Total_Estudiantes_Asociados;
            if (op === "=") return t === cant;
            if (op === "!=") return t !== cant;
            if (op === ">") return t > cant;
            if (op === "<") return t < cant;
            if (op === ">=") return t >= cant;
            if (op === "<=") return t <= cant;
            return true;
          });
        }
      }
    } catch {}
    return lista;
  }

  // Estudiantes general con filtros curso y estado
  if (p.includes("/estudiantes")) {
    if (reqId) {
      return STORE_ESTUDIANTES.find(e => e.Estudiante_Id === reqId) || STORE_ESTUDIANTES[0];
    }
    let lista = [...STORE_ESTUDIANTES];
    try {
      const urlObj = new URL(urlStr, "http://localhost");
      const curso = urlObj.searchParams.get("curso");
      const estado = urlObj.searchParams.get("estado");
      if (curso) lista = lista.filter(e => String(e.Curso_Id) === String(curso) || e.Curso_Nombre === curso);
      if (estado) lista = lista.filter(e => e.Estudiante_Estado_Academico === estado);
    } catch {}
    return lista;
  }

  // Cursos
  if (p.includes("/horarios/cursos") || p.includes("/cursos")) {
    if (p.includes("/niveles")) {
      return [
        { Nivel_Educativo_Id: 1, Nivel_Educativo_Nombre: "1° Básico" },
        { Nivel_Educativo_Id: 2, Nivel_Educativo_Nombre: "2° Básico" },
        { Nivel_Educativo_Id: 3, Nivel_Educativo_Nombre: "3° Básico" },
        { Nivel_Educativo_Id: 4, Nivel_Educativo_Nombre: "4° Básico" },
        { Nivel_Educativo_Id: 5, Nivel_Educativo_Nombre: "5° Básico" },
        { Nivel_Educativo_Id: 6, Nivel_Educativo_Nombre: "6° Básico" },
      ];
    }
    return STORE_CURSOS;
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
