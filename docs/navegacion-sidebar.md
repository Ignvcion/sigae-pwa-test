# Navegación — sidebar (`MainLayout.jsx`)

`webSIGAE/FrontEnd/src/layouts/MainLayout.jsx` es el **único** layout con sidebar de la
aplicación. Envuelve todas las rutas protegidas (ver `routes/AppRouter.jsx`) y renderiza
cada página a través de `<Outlet />`.

> ⚠️ **Cualquier cambio de navegación se hace únicamente en `MainLayout.jsx`.**
> Antes existía `components/Sidebar.jsx`, que parecía ser "el sidebar" pero nunca se
> importaba en ninguna parte. Por eso, enlaces de CU38–CU43 y de CU2/CU3 se agregaron en
> el archivo equivocado y nunca aparecieron en la app. `Sidebar.jsx` fue eliminado.

## Estructura del archivo

```
MainLayout
├── Modal de confirmación de cierre de sesión
├── <aside className="sidebar">
│   ├── Logo institucional
│   ├── Info del usuario (nombre + badge de rol activo)
│   └── <nav className="menu">
│       ├── Enlaces comunes a todos los roles (Dashboard, Mi Perfil)
│       ├── Bloque "Administración"   (esAdmin)
│       ├── Bloque "Docente"          (esDocente)
│       ├── Bloque "UTP"              (conUTP: etiqueta UTP, ver abajo)
│       └── Bloque "Apoderado"        (esApoderado)
└── <main> <Outlet /> </main>   ← contenido de la página actual
```

La lista de enlaces de cada bloque está en el propio `MainLayout.jsx`; no se duplica aquí
para que no quede desactualizada.

## Cómo se determina el rol visible

```js
const rolEfectivo = rolActivo || usuario?.roles?.[0];
const esSuperAdmin = usuario?.administradorTipo === "Super Admin";
const esAdmin      = rolEfectivo === "Administrador" || esSuperAdmin || usuario?.roles?.includes("Administrador");
const esDocente    = rolEfectivo === "Docente";
const esApoderado  = rolEfectivo === "Apoderado";
```

- `esAdmin` es **true** tanto para un Administrador normal como para el Super Admin.
- Dentro del bloque `esAdmin`, algunos enlaces (Gestión de Administradores, Gestión de
  Roles, Registrar Admin) se filtran además con `esSuperAdmin`.

## Etiqueta UTP

La etiqueta UTP (`utils/permisos.js`, en frontend y backend) se muestra junto al rol del
badge: "Administrador · UTP" o "Docente · UTP".

- Un **administrador con UTP** inicia sesión con el rol `UTP` (no `Administrador`): no ve
  el bloque "Administración", solo el bloque "UTP".
- Un **docente con UTP** ve su bloque "Docente" y, además, el bloque "UTP".
- Los enlaces del bloque "UTP" están en `ENLACES_UTP` (`utils/permisos.js`), compartidos
  con el dashboard. Sus rutas llevan `utp` en `RoleRoute` (`routes/AppRouter.jsx`).

## Convenciones al modificar el sidebar

1. Un enlace nuevo se agrega **solo** en `MainLayout.jsx`.
2. Si debe verse solo para Super Admin, va envuelto en `{esSuperAdmin && ...}` dentro del
   bloque `esAdmin`.
3. Revisa la restricción real de la ruta en `routes/AppRouter.jsx` (`roles={[...]}` o
   `superAdminOnly`) para que quien ve el enlace sea exactamente quien puede entrar.

## Pendientes conocidos

- **Gestión de Roles:** el enlace solo lo ve el Super Admin, pero la ruta `/gestion-roles`
  admite `roles={["Administrador"]}`, y `GestionRoles.jsx` permite a un Administrador
  normal gestionar roles de Docente/Apoderado. Hay que decidir cuál de los dos manda.
- **Mis Estudiantes del apoderado (CU40):** no hay enlace ni ruta.
  `components/ListaEstudiantesApoderado.jsx` es un mock estático que `AppRouter.jsx`
  importa pero no usa en ninguna ruta.
