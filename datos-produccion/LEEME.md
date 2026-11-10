# Datos para producción

Esta carpeta es solo para **trabajar** con los archivos de datos reales antes de cargarlos
(listas de estudiantes, apoderados, docentes, horarios...). Todo lo que pongas aquí, salvo este
archivo y `.gitkeep`, **git lo ignora**: no se sube a GitHub porque tiene datos personales de menores.

- No se guardan en equipos personales más tiempo del necesario.
- Se copian al servidor por `scp` (el repo no los lleva) y se cargan desde la aplicación o con un
  script puntual; después se borran de la EC2 y de tu equipo.
- Los respaldos y Excel del cierre de período van al Drive de `respaldosigae@colegiojc.cl`, no aquí.
