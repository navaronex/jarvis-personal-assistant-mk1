# Jarvis personal · Windows

Asistente local para agenda, notas, consulta a un modelo local y revisión de posibles urgencias de correo. Proyecto de aprendizaje y prototipo para uso personal. La interfaz es HTML/CSS/JavaScript, alojada en una aplicación Electron con ventana y bandeja de Windows.

**Estado de la entrega:** 25 pruebas automáticas pasan y el ejecutable sin instalador se empaqueta correctamente. Quedan sin resolver el arranque gráfico detectado durante las pruebas y la creación del instalador NSIS. Consulta el diagnóstico y el orden de continuación en `CONTINUAR.md`; todavía no es una entrega validada para el PC de tu padre.

## Desarrollo

Desde esta carpeta, con Node 24.15.0 y npm:

```powershell
npm.cmd ci
npm.cmd run prepare:runtime
npm.cmd start
```

`npm start` abre el programa Electron. Ejecutar únicamente `node server.mjs` abre el servidor local y **no crea un icono junto al reloj**. Electron arranca su servidor en un puerto libre, por lo que no necesita que el 3210 esté disponible.

## Estructura y conceptos

| Archivo o carpeta               | Responsabilidad                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `electron/main.cjs`             | Proceso principal: ventana, bandeja, inicio con Windows, servidor y avisos nativos. |
| `electron/preload.cjs`          | Puente IPC limitado entre la interfaz y las funciones de escritorio.                |
| `electron/updates.cjs`          | Estados de búsqueda, descarga y disponibilidad de versiones.                        |
| `electron/reminders.cjs`        | Entrega y confirmación de recordatorios; evita duplicados si falla el acuse.        |
| `public/`                       | Interfaz. `desktop.js` conecta sus controles con Electron.                          |
| `server.mjs`, `lib/`            | API local, reglas y SQLite.                                                         |
| `mail.mjs`, `Leer Outlook.ps1`  | Lectura autorizada de Outlook clásico en este PC.                                   |
| `setup.mjs`                     | Preparación opcional del motor y modelo locales.                                    |
| `scripts/`                      | Preparación, empaquetado y comprobación de escritorio.                              |
| `.github/workflows/release.yml` | Construcción del instalador al subir una etiqueta `v…`.                             |

La ventana no recibe acceso directo a Node: `contextIsolation` y `sandbox` están activados y `nodeIntegration` está desactivado. El preload expone acciones concretas; el proceso principal comprueba qué ventana las solicita. La API sólo escucha en `127.0.0.1`.

## Construir y comprobar

```powershell
npm.cmd test
npm.cmd run test:desktop
npm.cmd run dist:win
```

La prueba de escritorio arranca Electron de verdad usando una carpeta temporal. Comprueba servidor, puente IPC, controles de escritorio, bandeja y ocultación al cerrar. No accede a tu agenda personal.

El instalador esperado es `dist/Jarvis-Setup-0.3.0-x64.exe`. Incluye Electron, Node y el programa. El motor de IA y el modelo se preparan aparte desde Ajustes porque requieren varios GB; tu padre no necesita instalar Obsidian ni Node. Las tareas y notas funcionan sin preparar la IA.

## Datos y actualizaciones

La aplicación guarda sus datos fuera del instalador, en `%APPDATA%\jarvis-personal\datos`. El motor preparado desde Electron usa `%APPDATA%\jarvis-personal\ai`. El registro técnico está en `%APPDATA%\jarvis-personal\desktop.log`.

Los datos antiguos de la versión de navegador, en la carpeta `datos` del proyecto, no se importan automáticamente: exporta una copia desde aquella versión y restáurala en la aplicación nueva.

El actualizador consulta las versiones públicas de `navaronex/jarvis-personal-assistant-mk1` al arrancar y cada seis horas. Descarga una versión superior y la instala al salir completamente de Jarvis o al elegir «Reiniciar para actualizar». Cerrar la ventana sólo la oculta. Durante desarrollo no se descargan actualizaciones. Un borrador de release no se distribuye a los usuarios.

Consulta `CONTINUAR.md` para hacer la comprobación manual y publicar tu primera versión. La instalación y una actualización real entre dos versiones deben validarse antes de entregar Jarvis a tu padre.

## Alcance actual

- Agenda manual, notas, copias y conversación con un modelo local disponible.
- Recordatorios con el PC activo y Jarvis en marcha. Windows puede silenciar avisos con No molestar.
- Correo opcional de **Outlook clásico** mediante el perfil abierto. No hay conexión OAuth de Microsoft Graph ni Gmail.
- Las posibles urgencias se detectan por palabras y reglas: no equivalen a comprender el estado real de cada incidencia.
- La lectura de texto de correo ya existe; quedan pendientes entrada por micrófono, conversación por voz y la interfaz visual del asistente.
- Aún no hay certificado de firma propio: Windows puede mostrar un aviso de editor desconocido. No desactives SmartScreen ni el antivirus para distribuirlo.

Referencia técnica: [actualizaciones con electron-builder y NSIS](https://www.electron.build/docs/features/auto-update/). Las APIs utilizadas se corresponden con las versiones fijadas en `package-lock.json`.
