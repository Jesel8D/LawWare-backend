# Informe de preparación de Auth0 de desarrollo

Fecha: 17 de noviembre de 2026. **Auth0 real y el recorrido académico autenticado en navegador no están validados:** el usuario confirmó que aún no dispone de un tenant de desarrollo. No se crearon recursos externos ni se enviaron credenciales.

Actualización posterior: el usuario configuró el tenant de desarrollo. La redirección de login local se ha comprobado contra su configuración pública; login, emisión y validación de un token real continúan pendientes. No se crearon usuarios internos ni se asignaron permisos en esta comprobación. El estado anterior del tenant en este informe es histórico.

Actualización adicional: posteriormente el usuario realizó el login real, vinculó una cuenta sintética de laboratorio, recorrió el módulo y confirmó el avance tras recargar; PostgreSQL confirmó el estado `COMPLETADA`. También informó logout correcto y 401 sin sesión. Estos resultados y sus límites están en [Diagnóstico del dashboard](DIAGNOSTICO_503_AUTH0.md); las secciones anteriores son históricas.

En la comprobación posterior, el documento de descubrimiento público respondió 200 con el issuer esperado. Next.js devolvió una redirección 307 al endpoint de autorización del tenant con la audiencia `[AUDIENCIA_AUTH0_LOCAL]`, callback local, flujo de código y PKCE S256; la cookie de transacción observada tenía `HttpOnly` y `SameSite=Lax`. El endpoint de token para navegador devolvió 404. Sin sesión, el bootstrap devolvió 401; el backend respondió 200 en health y 401 sin token. Se comprobó el manejo de logout sin sesión, pero no un cierre real de sesión. No se inspeccionó ninguna cookie de sesión real ni se validaron las URLs configuradas en el panel Auth0.

Se creó un `.env` local ignorado en backend con issuer, audiencia y Client ID público para el puerto 3001; no se configuró ninguna URL de base de datos. El frontend conserva su `.env.local` ignorado. En la siguiente prueba real, 503 por identidad no disponible es esperable hasta configurar un repositorio de identidad autorizado; no demuestra por sí solo que un token real haya sido validado.

## Configuración y recursos

La [guía local](../development/GUIA_DEMOSTRACION_FUNCIONAL.md) detalla la creación manual de una Regular Web Application, una API RS256, audiencia e issuer, callback, logout, variables locales, cookies y vinculación de cuentas sintéticas. Los SDK instalados son `@auth0/nextjs-auth0` 4.33.0 y `@auth0/auth0-express-api` 1.0.0. La aplicación web, API, conexión y cuentas Auth0 siguen pendientes; no se han proporcionado parámetros Auth0 en los archivos locales inspeccionados. No se inspeccionaron ni registraron valores secretos.

El frontend solicita una audiencia de API, obtiene el access token en servidor y deshabilita el endpoint de token del navegador. El backend verifica el token mediante el SDK, consulta el sub en el pool de identidad, exige una cuenta interna activa y calcula capacidades desde PostgreSQL. Son observaciones de código y pruebas con emisor simulado; no son prueba de configuración real, renovación o sesión Auth0.

## Laboratorio y cambios

`scripts/academic-disposable-session.mjs` crea una base y tres logins propios en el clúster de loopback verificado, instala v2.1 y la candidata 03 y carga fixtures y roles sintéticos. Su `--self-test` terminó correctamente y eliminó los recursos creados. La sesión interactiva mantiene la base disponible hasta que el operador termine, para permitir la vinculación administrativa ya existente; también elimina sus propios recursos al finalizar normalmente. Una terminación forzada puede requerir limpieza manual. No se instaló 02 en la base de 03 ni se cambió SQL canónico.

El endpoint experimental de privacidad está deshabilitado tras autenticación e identidad: devuelve `503 PRIVACY_NOT_AVAILABLE` sin acceder a sus vistas. El frontend informa que la consulta y el registro persistente de privacidad están pendientes; el recorrido visual sigue siendo demostrativo y no guarda consentimiento. El anterior dictamen de migración conserva el resultado histórico de 500 observado antes de este cambio.

## Resultados

| Control | Resultado |
|---|---|
| Login, callback y logout con Auth0 real | Pendientes: no hay tenant disponible. |
| Identidad, permisos y progreso con Auth0 real | Pendientes; no se vinculó ningún sub real y no se usaron cuentas simuladas para declararlos completos. |
| Sesión ausente | Sin configuración, el navegador recibe indisponibilidad controlada; no se probó una sesión Auth0 real ausente o expirada. |
| Token inválido o caducado; identidad inexistente o bloqueada | Pruebas backend pasaron con tokens y emisor/JWKS sintéticos. |
| Candidata 03 en PostgreSQL 17.11 | Instalación canónica, precondiciones, repetición controlada y rollback correctos; 9 pruebas funcionales seleccionadas pasaron y 5 se omitieron. Incluyen capacidades, módulos/lecciones, progreso, permisos insuficientes, separación de cuentas, rollback y Privacy 503. Una prueba adicional de identidad con esquema canónico pasó. |
| Regresión con borrador 02 | En otra base desechable: una prueba de identidad canónica y 4 casos seleccionados pasaron. El endpoint Privacy sigue deshabilitado aunque existan las vistas del borrador. |
| Backend | Typecheck, lint, build y smoke pasaron. `npm test`: 29 pruebas pasaron y 20 quedaron omitidas por configuración o selección. |
| Frontend | Typecheck, lint, build y 18 pruebas unitarias pasaron. Playwright: 7 pruebas pasaron usando Chrome ya instalado; incluyen el mensaje de Privacy y la ausencia de configuración de sesión, no un login real. También pasaron las comprobaciones de integración local de `/health` y de exclusión del modo demo en un servidor local con build de producción. |

La primera ejecución de Playwright no encontró el Chromium administrado; se repitió satisfactoriamente con el Chrome local mediante `PLAYWRIGHT_CHROME_PATH`, sin descargar un navegador. Los resultados de pruebas se refieren solo a datos y emisores sintéticos. La prueba HTTP de identidad usa el SDK, pero el proveedor real y su configuración no se han ejercitado.

Las bases y roles temporales de estas ejecuciones se eliminaron; no quedó ningún recurso con los prefijos generados por las pruebas. El clúster local, iniciado para la tarea, volvió a detenerse.

## Riesgos y estado Git

- `app.user_id` es contexto manipulable, no identidad fuerte. RLS, pool, revocación concurrente y auditoría externa siguen sujetos a revisión independiente; no se declaran aprobados.
- El endpoint Privacy permanece intencionalmente indisponible y no existe consentimiento persistente aprobado.
- La candidata 03 sigue siendo experimental: su registro de versiones es propuesto y la detección de la base v2.1 es parcial.
- Backend: rama `feat/backend-foundation-auth`, con modificaciones y archivos sin seguimiento previos y de este trabajo. Frontend: rama `feat/frontend-foundation-onboarding`, también con cambios locales. No se descartaron cambios preexistentes ni se crearon commits.
- Database y Context: `main` limpio al cierre de la comprobación. No se modificaron sus archivos, no hubo push, merge ni despliegues.

**Estado: LawWare v2.1 validado en desarrollo local, con observaciones; Auth0 real pendiente.**
