# Informe de consolidación full stack

**Informe histórico de la fase anterior.** El estado actual del vertical está en [resultados del vertical](../development/RESULTADOS_VERTICAL.md); algunos endpoints que aquí se describen como pendientes ahora tienen implementación experimental.

Fecha: 16 de noviembre de 2026. Alcance: ramas locales `feat/backend-foundation-auth` y `feat/frontend-foundation-onboarding`; SQL v2.1 consultado, sin modificaciones. Estado del proyecto: **validado en desarrollo local, con observaciones**; no existe aprobación de producción ni jurídica.

## Estado e inventario

El backend sigue basado en el commit `7a57a6c5b39700c8466771a051699c6581e98ed7`: monolito Express/TypeScript con SDK Auth0, validación de tokens y resolución de usuario activo en PostgreSQL. El frontend sigue basado en `552e21a485eabf65aec311a9e95e0031a865acf3`: Next.js App Router, BFF de identidad, recorrido y paneles sintéticos. Ambos conjuntos de cambios siguen sin commit ni staging. `git status --short --untracked-files=all` da el inventario exacto; incluye código, configuración, lockfiles, pruebas y documentación. No se modificaron `main`, `LawWare-database` ni `LawWare-context`.

El [inventario de cambios](INVENTARIO_CAMBIOS.md) enumera los archivos nuevos y modificados de ambas ramas. El [contrato propuesto](../api/CONTRATO_FULL_STACK_PROPUESTO.md) contiene la matriz de APIs, entradas, salidas, errores, permisos, reglas, pruebas, diagrama de flujo y estados. Existe una copia idéntica en el frontend. Ambas copias son documentación local y requieren revisión conjunta; no son endpoints implementados. El inventario de rutas visuales está en `LawWare-frontend/docs/design/SISTEMA_VISUAL.md`.

## Hallazgos y correcciones

| Hallazgo | Estado |
|---|---|
| El BFF convertía un 500 del backend a 503 y etiquetaba 401/403 como indisponibilidad. | Corregido: conserva 401, 403, 500, 502 y 503 con códigos genéricos y `no-store`; pruebas unitarias nuevas. |
| La configuración de frontend podía anunciar Auth0 preparado con variables vacías o audiencia igual al client ID, incompatible con la condición del backend. | Corregido para esos casos; la igualdad de configuración de los dos procesos y el tenant real requieren verificación operativa. |
| El cliente HTTP seguía redirecciones por defecto al enviar un Bearer. | Corregido a `redirect: error`, manteniendo el token en servidor; prueba de configuración del request. |
| Un nombre heredado del prototipo, como `toString`, podía producir error en rutas de escenarios sintéticos. | Corregido con comprobación de propiedad propia; recorrido de navegador añadido. |
| Discovery/JWKS no disponible puede acabar en el mismo 401 que un token no verificable. | Pendiente: el SDK instalado envuelve excepciones de verificación; no se clasifican por mensajes frágiles. El BFF no interpreta 401 como necesidad de registro. |
| El servicio técnico Auth SQL tiene `SELECT, INSERT, UPDATE` sobre `usuario`; el código actual solo consulta. | Pendiente revisión de concesiones mínimas, conexiones directas y despliegue. Los checks de rol detectan privilegios, propietarios y roles mezclados conocidos, no todos los grants directos posibles. |
| `app.user_id` es un GUC manipulable por quien pueda ejecutar SQL. | Límite vigente: identidad proviene del token y backend, no del GUC. Las pruebas de pool no son aprobación de todas las políticas RLS. |
| SQL exige al menos una finalidad al sellar y aplica 24 horas para decisión y vinculación. | Pendiente acordar tratamiento si no hay finalidades consentibles y duración; 24 h es provisional, no plazo legal. |
| `usuario_rol` admite múltiples asignaciones y `rol_permiso` une permisos; SQL revisado no proporciona catálogo definitivo de códigos de aplicación. | La interfaz demo une capacidades sintéticas; el backend deberá derivar permisos efectivos y verificar cada operación. |
| Sesión Auth0 real, rotación JWKS, cookies/CSRF, API de permisos, privacidad, reintentos idempotentes, observabilidad externa y TLS administrado. | Sin pruebas suficientes y sin aprobación. Las pantallas reales privadas no exponen datos ni operaciones; las demo solo funcionan en desarrollo. |

El backend acepta access tokens JWT con emisor configurado, audiencia de API, RS256, vigencia y `sub`; no acepta ID token como sustituto. El SDK Next se configura para solicitar la audiencia de la API y mantiene el token en servidor. Es una compatibilidad de diseño, **no una validación con Auth0 real**. El backend rechaza una audiencia igual a su client ID; ambos servicios deben usar la misma audiencia y el mismo tenant. Documentación oficial: [SDK Next](https://github.com/auth0/nextjs-auth0) y [formatos de access token Auth0](https://support.auth0.com/center/s/article/opaque-versus-jwt-access-token).

## Reproducción y resultados

Node 24.18.0, npm 11.16.0; PostgreSQL 17.11 con `data_directory` comprobado en `_local/temporary/pg-local`, puerto local 55439 y escucha `127.0.0.1`. Los datos, roles y tokens de prueba son sintéticos. Las bases y logins temporales quedaron en cero al terminar; el clúster fue detenido.

| Proyecto | Comandos y resultado |
|---|---|
| Backend | `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:smoke`: correctos. `npm test`: 29 pasaron, 6 de PostgreSQL omitidas en esa ejecución. `npm run test:db`: las 6 de integración pasaron por separado, con JWT/JWKS simulado y PostgreSQL local. |
| Frontend | `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`: 14 pasaron. `npm run build`, `npm run test:production` y `npm run test:e2e`: correctos; 6 recorridos de navegador pasaron. |
| Salud full stack | `npm run test:integration`: frontend `/api/health` → backend `/health` 200; backend `/auth/me` sin token 401; frontend `/api/identity` sin Auth0 configurado 503. No se probó un recorrido autenticado real. |
| Accesibilidad y visual | Revisión del recorrido, estados, navegación múltiple, teclado, móvil sin desbordamiento y axe A/AA seleccionado en tres pantallas. No es auditoría integral de accesibilidad. |
| Producción | El build local de producción devuelve 404 para rutas demo aunque se establezca `LAWWARE_DEMO=1`; no hay despliegue. |
| Seguridad | `npm audit --audit-level=moderate`: 0 vulnerabilidades reportadas en ambos lockfiles. `detect-secrets --no-verify`: sin hallazgos en archivos candidatos revisados. Resultados no garantizan ausencia absoluta de secretos ni seguridad global. |

La instalación backend advierte que `esbuild@0.28.2` tiene un postinstall sin decisión explícita en `allowScripts`. **El aviso de npm 11 no significa que esté bloqueado**: con `ignore-scripts=false` y sin política expresa, esta fase de npm ejecuta por defecto los scripts no revisados y después advierte. Se revisó el archivo instalado: prepara/verifica el binario y contempla descarga alternativa; el binario opcional instalado `@esbuild/win32-x64@0.28.2` ejecutó `--version` correctamente y las pruebas/build pasaron. No se ha registrado una aprobación o denegación de ese script. La política explícita y la reproducibilidad en otras plataformas siguen pendientes; no aprobar indiscriminadamente scripts. Consulte el [RFC de política de scripts de npm](https://github.com/npm/rfcs/blob/main/accepted/0054-make-scripts-install-opt-in.md).

El frontend instala `eslint@9.39.5`, fuera de soporte desde agosto de 2026 según [ESLint](https://eslint.org/version-support/). Los plugins instalados por `eslint-config-next@16.4.6` declaran compatibilidad hasta ESLint 9; forzar ESLint 10 generó advertencias de dependencias pares. No se cambió a una combinación no soportada: actualizar plugins/configuración y repetir lint/pruebas es un pendiente previo a publicación.

## Seguridad y límites visuales

`.gitignore` de cada repositorio excluye variables locales, dependencias, build, llaves, respaldos, logs y `_local`; frontend también excluye reportes Playwright. Los datos de escenarios no crean sesión ni capacidades reales. Las rutas privadas reales muestran indisponibilidad y no contienen datos protegidos; las operaciones demo no persisten. La presentación del aviso sintético no evidencia presentación ni consentimiento real. La validación del cliente no sustituye controles del backend, RLS o permisos.

El flujo visual incluye bienvenida, acceso, aviso, decisiones no preseleccionadas, revisión, vinculación pendiente, estados de cuenta y tres espacios. Carga, errores, contenido vacío y acciones deshabilitadas están representados; los escenarios de error no demuestran una recuperación transaccional real.

## Decisiones y pasos posteriores

1. Aprobar contenido y finalidades legales, orden de identidad/prerregistro, manejo de sesiones y expiración, caso de cero finalidades y vinculación/activación.
2. Definir contrato de permisos, reglas para múltiples roles, idempotencia y recuperación tras commit incierto, y auditoría externa.
3. Diseñar la integración de Auth0 en tenant autorizado; verificar emisor, audiencia, algoritmo, sesión, cookies/CSRF, expiración, rotación y tratamiento de fallo JWKS.
4. Revisar grants y roles de servicio, RLS aún pendiente, aislamiento del pool, TLS, secretos, respaldo y observabilidad de infraestructura, sin tratar la validación local como producción.
5. Revisar ambos diffs, el contrato duplicado y las advertencias de dependencias antes de autorizar commits separados.

Mensajes sugeridos: backend `feat: establish backend auth foundation and full-stack contracts`; frontend `feat: add onboarding demo and prepare backend integration`. No se han creado commits, push, merges, pull requests ni despliegues.
