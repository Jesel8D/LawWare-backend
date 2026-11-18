# Resultados locales de la etapa Auth

Fecha: 16 de noviembre de 2026. Node.js 24.18.0, npm 11.16.0 y PostgreSQL local 17.11. Las pruebas usaron datos y claves sintéticos. No se accedió a Auth0 real, Render ni Vercel.

| Comprobación | Resultado observado |
|---|---|
| `npm ci` | Completó con el lockfile; npm advirtió que el postinstall de esbuild estaba pendiente de revisión. |
| `npm run typecheck`, `npm run lint`, `npm run build` | Completaron sin errores. |
| `npm test` | 29 pruebas unitarias y HTTP aprobadas; seis de PostgreSQL se omiten intencionalmente en esta ejecución. |
| `npm run test:smoke` | Arrancó el proceso compilado, `/health` respondió y la ruta protegida sin token devolvió 401. |
| `npm run test:db` | Seis pruebas de integración aprobadas contra una base v2.1 desechable y logins técnicos separados. |
| `npm audit --audit-level=moderate` | No se reportaron vulnerabilidades en la ejecución local. |

El emisor y JWKS de los tests HTTP son simulados. Se comprobaron token ausente o malformado, firma, emisor, audiencia, expiración, `nbf`, `iat`, falta de claims, algoritmo incorrecto y audiencia de ID token; también usuario inexistente, bloqueado, inactivo o pendiente, suplantación de IDs, CORS, límites de cuerpo y ocultación de errores. Los resultados no demuestran seguridad integral ni integración con Auth0 real.

Las pruebas PostgreSQL verificaron resolución de `auth0_id`, peticiones de dos usuarios concurrentes, RLS de usuario, reutilización de conexión, limpieza de GUC, rollback y rechazo de identidades privilegiadas o roles mezclados. El clúster es exclusivamente local y las bases/logins sintéticos se eliminan al finalizar. No se han probado todas las políticas RLS, la infraestructura administrada, el logger externo ni la configuración final de TLS.
