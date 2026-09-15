# Continuar Jarvis tú mismo

## Estado al terminar esta entrega · 15/09/2026

- `npm test`: **25 pruebas pasan**.
- `npm run prepare:runtime`: Node 24.15.0 x64 verificado con SHA-256.
- `npm run build:dir`: **compilación correcta**, aplicación en `dist\win-unpacked`.
- Arranque real de Electron: **pendiente de resolver**, fallo del proceso gráfico indicado abajo.
- `npm run dist:win`: **falló** en NSIS porque no encontró `Jarvis-Setup-0.3.0-x64.__uninstaller.exe`. El fallo anterior de `package.json` dentro de `app.asar` sí quedó corregido.
- El instalador parcial se ha renombrado a `Jarvis-Setup-0.3.0-x64.exe.incomplete` para evitar abrirlo por error. **No lo uses ni le quites esa extensión.** Una nueva compilación debe terminar con éxito antes de probar su resultado.
- No se han subido commits ni publicado releases. El workflow y las actualizaciones están configurados, pero el recorrido real entre dos versiones aún no está validado.

Prioridad: comprobar el arranque en tu PowerShell, resolverlo si también falla allí y después completar NSIS. La voz y nuevas integraciones van después de estas comprobaciones.

## 1. Validar la aplicación de escritorio

Abre PowerShell normal, entra en la carpeta del proyecto y ejecuta:

```powershell
Set-Location 'C:\Users\Dylan Armas\Documents\Codex\2026-09-08\puedes-crear-mi-propio-jarvis-personal\outputs\Jarvis'
npm.cmd test
npm.cmd run test:desktop
npm.cmd start
```

La suite de lógica/API debe pasar. La prueba `test:desktop` debe acabar con `OK` y devolver datos del arranque. En las pruebas realizadas desde Codex apareció un fallo de arranque del proceso gráfico de Electron (`-1073741515`, seguido de `ERR_FAILED`). No está diagnosticado; no se debe dar por validada la aplicación gráfica hasta que esta prueba y la comprobación manual funcionen.

Si falla también en tu PowerShell, guarda la salida:

```powershell
npm.cmd run test:desktop 2>&1 | Tee-Object -FilePath desktop-test.log
```

El registro de la aplicación normal está en `%APPDATA%\jarvis-personal\desktop.log`. No añadas `--no-sandbox` ni desactives protecciones para ocultar el problema. No continúes con la publicación mientras el arranque falle.

Cuando abra correctamente:

1. Ve a Ajustes. Debe aparecer «Jarvis 0.3.0 · Modo de desarrollo». Las actualizaciones y el inicio con Windows sólo se activan en el ejecutable empaquetado.
2. Pulsa «Probar un aviso». Comprueba el centro de notificaciones de Windows.
3. Crea un compromiso de prueba a dos minutos vista.
4. Cierra la ventana con la X. Jarvis debe seguir en los iconos junto al reloj, quizá dentro de la flecha de iconos ocultos.
5. Espera al aviso. Abre de nuevo Jarvis desde el icono.
6. Sal desde su menú «Salir de Jarvis». Confirma que desaparece el icono.

## 2. Construir y probar el instalador

```powershell
npm.cmd run prepare:runtime
npm.cmd run dist:win
```

Este comando construye localmente; no publica en GitHub. Si reaparece el error de NSIS, guarda la salida con `npm.cmd run dist:win 2>&1 | Tee-Object -FilePath build-test.log`. No pruebes ni publiques el instalador parcial. El siguiente diagnóstico debe revisar la generación y ejecución del desinstalador temporal; todavía no se ha determinado la causa.

Puedes comprobar el ejecutable empaquetado sin esperar al instalador ejecutando primero `npm.cmd run build:dir` y después:

```powershell
$env:JARVIS_DESKTOP_EXE = (Resolve-Path '.\dist\win-unpacked\Jarvis.exe').Path
npm.cmd run test:desktop
Remove-Item Env:JARVIS_DESKTOP_EXE
```

Después, ejecuta `dist\Jarvis-Setup-0.3.0-x64.exe`. Instala para tu usuario. Desde esta versión instalada comprueba ventana, bandeja y avisos; activa «Iniciar Jarvis al entrar en Windows», cierra sesión y vuelve a entrar para verificarlo. Exporta una copia antes de probar restauraciones o cambios de versión.

Antes de dárselo a tu padre, haz también una prueba en un Windows 11 sin Node ni Ollama instalados. Agenda y notas deben funcionar directamente. La preparación de IA debe completarse desde Ajustes con Internet y espacio libre. Esa descarga completa en un PC limpio aún está pendiente de validación.

## 3. Subir el código a tu repositorio

El repositorio de trabajo está dentro de `outputs\Jarvis`, no en la carpeta superior. La configuración de actualizaciones apunta a:

https://github.com/navaronex/jarvis-personal-assistant-mk1

Primero revisa qué vas a subir:

```powershell
git status --short
git remote -v
git add .
git diff --cached --stat
git diff --cached --name-only
```

No deben aparecer bases de datos, correos, notas privadas, credenciales, modelos, `node_modules` ni `dist`. El `.gitignore` ya excluye sus ubicaciones habituales. Revisa también que no hayas añadido documentos personales en otra carpeta.

Si no existe un remoto `origin`:

```powershell
git remote add origin https://github.com/navaronex/jarvis-personal-assistant-mk1.git
```

Si ya existe, comprueba su URL; no lo añadas de nuevo. Después:

```powershell
git commit -m "Prepara Jarvis de escritorio y actualizaciones"
git branch -M main
git push -u origin main
```

Git puede pedirte iniciar sesión en GitHub. No guardes un token en el código. Si el remoto contiene cambios nuevos y rechaza el envío, no uses `--force`: revisa e integra esos cambios antes.

## 4. Publicar 0.3.0

Hazlo sólo después de comprobar el instalador:

```powershell
git tag v0.3.0
git push origin v0.3.0
```

En GitHub, abre **Actions → Construir instalador de Jarvis**. El workflow verifica que la etiqueta coincide con `package.json`, instala dependencias, verifica Node, ejecuta las pruebas y construye un **borrador** de release. Usa `GITHUB_TOKEN` de Actions; no necesitas incrustar un token en Jarvis.

Cuando termine, entra en **Releases**, abre el borrador y comprueba que contiene:

- `Jarvis-Setup-0.3.0-x64.exe`
- El `.blockmap` correspondiente.
- `latest.yml`.

Descarga y comprueba el instalador del borrador. Después pulsa **Publish release**, como versión estable, sin marcar «pre-release». Los tres archivos deben mantenerse juntos: el actualizador usa los metadatos para encontrar y verificar la descarga. Hasta que exista una release pública, la búsqueda de actualizaciones puede informar de que no puede comprobarlas.

## 5. Comprobar una actualización real

Con 0.3.0 instalada y una nota de prueba guardada, haz un pequeño cambio visible y prepara la siguiente versión:

```powershell
npm.cmd version patch --no-git-tag-version
npm.cmd test
npm.cmd run test:desktop
npm.cmd run dist:win
git add .
git diff --cached --stat
git commit -m "Publica Jarvis 0.3.1"
git push origin main
git tag v0.3.1
git push origin v0.3.1
```

Revisa y publica el nuevo borrador de release igual que antes. En Jarvis **0.3.0 instalado**, pulsa «Buscar actualizaciones» y comprueba la descarga. Usa «Reiniciar para actualizar»: debe abrir 0.3.1 y conservar la nota. Repite otra vez en una versión posterior para comprobar la instalación al usar «Salir de Jarvis».

Esto valida el recorrido completo: GitHub → descarga → instalación → datos conservados. Las pruebas automáticas del controlador, por sí solas, no prueban este recorrido.

## 6. Siguiente funcionalidad: conversación por voz

Una vez estable el escritorio y la actualización:

1. Añade un botón «Hablar» que solicite permiso de micrófono sólo al usarlo. Hoy Electron deniega esos permisos; será necesario habilitar exclusivamente el micrófono para la ventana de Jarvis.
2. Integra un transcriptor local y prueba primero frases cortas en español. Mantén siempre la alternativa de escribir.
3. Envía el texto al flujo de conversación existente y añade lectura de la respuesta con control de detener y silenciar.
4. Para crear reuniones por voz, muestra título, fecha y hora interpretados y pide confirmación antes de guardar. No conviertas respuestas libres del modelo en comandos ejecutables.
5. Después diseña la ventana compacta o avatar del asistente. La escucha continua y una palabra de activación pueden esperar hasta comprobar precisión y consumo.

Finalmente, conecta calendario y correo mediante Microsoft Graph/OAuth si necesita Outlook nuevo o Microsoft 365. El acceso actual por Outlook clásico no sincroniza automáticamente su calendario. Gmail requiere una integración separada.
