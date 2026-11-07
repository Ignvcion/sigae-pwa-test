import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

/* AUTH */

import Login from "../pages/auth/Login";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import SessionExpired from "../pages/auth/SessionExpired";
import SelectRole from "../pages/auth/SelectRole";
import GestionRoles from "../pages/users/GestionRoles";

/* PROTECTED ROUTE */

import ProtectedRoute, { RoleRoute } from "./ProtectedRoute";

/* DASHBOARD */

import Dashboard from "../pages/dashboard/Dashboard";

/* USERS */

import Usuarios from "../pages/users/Usuarios";
import RegisterAdmin from "../pages/users/RegisterAdmin";
import RegisterTeacher from "../pages/users/RegisterTeacher";
import RegisterGuardian from "../pages/users/RegisterGuardian";
import RegisterStudent from "../pages/users/RegisterStudent";
import Apoderados from "../pages/users/Apoderados";
import Administradores from "../pages/users/Administradores";
import Docentes from "../pages/users/Docentes";
import BuscarUsuarios from "../pages/users/BuscarUsuarios";
import Perfil from "../pages/users/Perfil";

/* NUEVOS COMPONENTES */
import ListaEstudiantesApoderado from "../components/ListaEstudiantesApoderado";

/* ACADEMIC */

import Cursos from "../pages/academic/Cursos";
import Estudiantes from "../pages/academic/Estudiantes";
import Horarios from "../pages/academic/Horarios";
import MiHorario from "../pages/academic/MiHorario";
import HorarioEstudiante from "../pages/academic/HorarioEstudiante";
import MisCursos from "../pages/academic/MisCursos";
import BloquesHorarios from "../pages/academic/BloquesHorarios";
import HorarioMaestro from "../pages/academic/HorarioMaestro";
import ConsultaHorarios from "../pages/academic/ConsultaHorarios";
import PlanEducativo from "../pages/academic/PlanEducativo";
import Asignaturas from "../pages/academic/Asignaturas";
import SituacionFinal from "../pages/academic/SituacionFinal";
import CierrePeriodo from "../pages/academic/CierrePeriodo";

/* COMMUNICATION */

import Mensajes from "../pages/communications/Mensajes";
import Citaciones from "../pages/communications/Citaciones";
import HistorialCitaciones from "../pages/communications/HistorialCitaciones";

/* REPORTS */

import Reportes from "../pages/reports/Reportes";

/* LAYOUT */

import MainLayout from "../layouts/MainLayout";

function AppRouter() {

  return (

    <BrowserRouter basename={import.meta.env.BASE_URL}>

      <Routes>

        {/* AUTH — publicas */}

        <Route path="/"                 element={<Login />} />
        <Route path="/seleccionar-rol" element={<SelectRole />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/session-expired" element={<SessionExpired />} />

        {/* RUTAS PRIVADAS — requieren sesion */}

        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >

          {/* Accesibles por todos los roles autenticados */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/perfil"     element={<Perfil />} />
          <Route
            path="/perfil/:id"
            element={
              <RoleRoute roles={["Administrador"]}>
                <Perfil />
              </RoleRoute>
            }
          />
          {/* Accesibles por Docente y Apoderado */}
          {/* CU74–CU78: agenda, creación, confirmación, cancelación y reprogramación de citaciones
              (el Administrador/Super Admin ve y gestiona las de toda la institución) */}
          <Route
            path="/citaciones"
            element={
              <RoleRoute roles={["Docente", "Apoderado", "Administrador"]}>
                <Citaciones />
              </RoleRoute>
            }
          />
          {/* CU79: historial y detalle de citaciones de un estudiante (también Admin/Super Admin) */}
          <Route
            path="/citaciones/historial"
            element={
              <RoleRoute roles={["Docente", "Apoderado", "Administrador"]}>
                <HistorialCitaciones />
              </RoleRoute>
            }
          />
          {/* CU73: mensajería interna — actores Docente y Apoderado */}
          <Route
            path="/mensajes"
            element={
              <RoleRoute roles={["Docente", "Apoderado"]}>
                <Mensajes />
              </RoleRoute>
            }
          />
          {/* CU67, CU68, CU69: consultas y filtros de horario — solo Super Admin/Admin */}
          <Route
            path="/consulta-horarios"
            element={
              <RoleRoute roles={["Administrador"]}>
                <ConsultaHorarios />
              </RoleRoute>
            }
          />

          {/* Accesibles por Docente */}
          <Route
            path="/horarios"
            element={
              <RoleRoute roles={["Docente", "Administrador"]}>
                <Horarios />
              </RoleRoute>
            }
          />

          {/* CU43: horario semanal propio (Docente) o de cualquier docente (Admin/Super Admin) */}
          <Route
            path="/mi-horario"
            element={
              <RoleRoute roles={["Docente", "Administrador"]}>
                <MiHorario />
              </RoleRoute>
            }
          />

          {/* RF61: situación final (profesor jefe y administración) y promoción (administración) */}
          <Route
            path="/situacion-final"
            element={
              <RoleRoute roles={["Docente", "Administrador"]}>
                <SituacionFinal />
              </RoleRoute>
            }
          />

          {/* Cambio de período: avance para la administración; acciones solo Super Admin */}
          <Route
            path="/cierre-periodo"
            element={
              <RoleRoute roles={["Administrador"]}>
                <CierrePeriodo />
              </RoleRoute>
            }
          />

          {/* Mis Cursos: clases que imparte el docente y sus estudiantes */}
          <Route
            path="/mis-cursos"
            element={
              <RoleRoute roles={["Docente"]}>
                <MisCursos />
              </RoleRoute>
            }
          />

          {/* Horario semanal del curso de los estudiantes asociados (Apoderado) */}
          <Route
            path="/horario-alumno"
            element={
              <RoleRoute roles={["Apoderado"]}>
                <HorarioEstudiante />
              </RoleRoute>
            }
          />

          {/* CU57: vista consolidada del horario de toda la institución (Super Admin/Admin) */}
          <Route
            path="/horario-maestro"
            element={
              <RoleRoute roles={["Administrador"]}>
                <HorarioMaestro />
              </RoleRoute>
            }
          />

          {/* Exclusivas de Administrador / SuperAdmin */}
          <Route
            path="/usuarios"
            element={
              <RoleRoute roles={["Administrador"]}>
                <Usuarios />
              </RoleRoute>
            }
          />
          
          <Route
            path="/gestion-roles"
            element={
              <RoleRoute roles={["Administrador"]}>
                <GestionRoles />
              </RoleRoute>
            }
          />

          <Route
            path="/gestion-roles/:id"
            element={
              <RoleRoute roles={["Administrador"]}>
                <GestionRoles />
              </RoleRoute>
            }
          />

          <Route
            path="/registrar-admin"
            element={
              <RoleRoute superAdminOnly={true}>
                <RegisterAdmin />
              </RoleRoute>
            }
          />

          {/* CU2 y CU3: Visualizar y editar administradores — exclusivo del Super Administrador */}
          <Route
            path="/administradores"
            element={
              <RoleRoute superAdminOnly={true}>
                <Administradores />
              </RoleRoute>
            }
          />

          {/* CU30 y CU31: Listado y filtros de docentes — Super Admin/Admin */}
          <Route
            path="/docentes"
            element={
              <RoleRoute roles={["Administrador"]}>
                <Docentes />
              </RoleRoute>
            }
          />

          {/* CU28: Búsqueda de usuarios por nombre, RUT o correo — Super Admin/Admin */}
          <Route
            path="/buscar-usuarios"
            element={
              <RoleRoute roles={["Administrador"]}>
                <BuscarUsuarios />
              </RoleRoute>
            }
          />

          <Route
            path="/registrar-docente"
            element={
              <RoleRoute roles={["Administrador"]}>
                <RegisterTeacher />
              </RoleRoute>
            }
          />

          <Route
            path="/registrar-apoderado"
            element={
              <RoleRoute roles={["Administrador"]}>
                <RegisterGuardian />
              </RoleRoute>
            }
          />

          <Route
            path="/registrar-estudiante"
            element={
              <RoleRoute roles={["Administrador"]}>
                <RegisterStudent />
              </RoleRoute>
            }
          />

          <Route
            path="/apoderados"
            element={
              <RoleRoute roles={["Administrador"]}>
                <Apoderados />
              </RoleRoute>
            }
          />

          {/* ACADEMIC */}

          <Route
            path="/asignaturas"
            element={
              <RoleRoute roles={["Administrador"]}>
                <Asignaturas />
              </RoleRoute>
            }
          />

          <Route
            path="/cursos"
            element={
              <RoleRoute roles={["Administrador"]}>
                <Cursos />
              </RoleRoute>
            }
          />

          {/* CU34: Listado completo de estudiantes — Administrador y Docente */}
          <Route
            path="/estudiantes"
            element={
              <RoleRoute roles={["Administrador", "Docente"]}>
                <Estudiantes />
              </RoleRoute>
            }
          />

          <Route
            path="/bloques"
            element={
              <RoleRoute roles={["Administrador"]}>
                <BloquesHorarios />
              </RoleRoute>
            }
          />

          <Route
            path="/bloques-horarios"
            element={
              <RoleRoute roles={["Administrador"]}>
                <BloquesHorarios />
              </RoleRoute>
            }
          />

          <Route
            path="/plan-educativo"
            element={
              <RoleRoute roles={["Administrador"]}>
                <PlanEducativo />
              </RoleRoute>
            }
          />

          <Route
            path="/reportes"
            element={
              <RoleRoute roles={["Administrador"]}>
                <Reportes />
              </RoleRoute>
            }
          />

        </Route>

      </Routes>

    </BrowserRouter>
  );
}

export default AppRouter;