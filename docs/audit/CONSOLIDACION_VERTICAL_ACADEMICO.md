# Consolidación del primer vertical académico real

Fecha: 17 de noviembre de 2026. **LawWare v2.1: validado en desarrollo local, con observaciones.** La candidata 03 sigue sin aprobación y Privacy persistente permanece deshabilitado. Esto no es una aprobación de producción.

## Evidencia del recorrido

| Etapa | Evidencia y límites |
|---|---|
| Login y callback Auth0 real | Informados por el usuario desde el navegador de desarrollo. La solicitud de autorización se comprobó antes con audiencia de API y PKCE. No se conservaron tokens ni se capturaron los cookies de sesión real. |
| Validación de token por Express y bootstrap 200 | El contenido se mostró tras login y el código del BFF/backend exige un token verificado antes de acceder a identidad y capacidades. La validación de ese token y la respuesta 200 son inferencias del flujo y resultado informado: no se capturó el HTTP 200 ni se inspeccionó el token real. El 503 histórico no tiene código concreto capturado. |
| Usuario y permisos internos | La vinculación administrativa fue informada por el operador; una consulta local mediante el repositorio de identidad resolvió la cuenta activa vinculada. El repositorio aplicativo devolvió `ACADEMIC_READ` y `ACADEMIC_PROGRESS`. Esa consulta independiente no usó un token real. |
| Contenido y avance | El usuario informó que vio el módulo, abrió la lección, completó el avance y lo recuperó al recargar. Una consulta directa en PostgreSQL confirmó `COMPLETADA` y fechas de inicio y finalización presentes. El contenido es sintético y las consultas y persistencia son del laboratorio real. |
| Logout | El usuario informó logout correcto y respuesta 401 del bootstrap sin sesión. No se capturó por separado una respuesta HTTP por el agente. |

El [diagnóstico](DIAGNOSTICO_503_AUTH0.md) conserva la secuencia y el [dictamen](DICTAMEN_MIGRACION_CANDIDATA.md) la evaluación de la candidata. El registro de errores del backend incluye solo códigos de dependencia conocidos; no agrega tokens, sub ni conexiones.

Se examinaron sin reproducir sus contenidos los logs locales del laboratorio, la candidata y la sesión Auth0: son logs de PostgreSQL y no contienen eventos HTTP del bootstrap. No se encontró en ellos una captura directa del 200; los mensajes previos del usuario y la consulta SQL son las evidencias disponibles del recorrido.

## Interfaz y límites

El dashboard consume identidad, capacidades, módulos y progreso del BFF; no usa datos del modo demo. El contenido vacío muestra un mensaje propio y las fallas de servicio muestran un error diferente. Los enlaces administrativos y de gestión se condicionan a capacidades; con solo lectura académica no aparecen. Los estados 401 y 503 se distinguieron en pruebas de componentes, y el usuario comprobó 401 después del logout real. La expiración natural y renovación de una sesión real todavía no se reprodujeron.

El contrato de identidad devuelve UUID interno y estado, pero el dashboard no muestra nombre ni perfil personal; en cuenta solo informa el estado activo. Si se desea mostrar un nombre, hace falta un contrato de perfil y una decisión sobre sus datos: no se inventó ni se añadió una pantalla. Los módulos sin contenido se probaron con respuesta simulada, no vaciando el laboratorio. El modo demo está separado y se verificó inaccesible en el build de producción local.

## Concurrencia y segunda cuenta

La prueba `node tests/compatibilidad/concurrencia-lectura-local.mjs` ejecutó ocho lecturas coherentes mediante cuatro conexiones físicas del pool aplicativo, con la cuenta sintética existente y sin escribir filas. Requiere `npm run build`, `APP_DATABASE_URL` configurada para un laboratorio compatible y el clúster local verificado. No demuestra aislamiento entre dos usuarios ni escrituras concurrentes.

El usuario autorizó la [propuesta de dos usuarios](../proposals/PRUEBA_AISLAMIENTO_DOS_USUARIOS.md). Se creó B con lectura y el operador vinculó su cuenta Auth0; ambas identidades internas activas se resolvieron en una prueba local. `tests/compatibilidad/aislamiento-lectura-dos-usuarios.mjs` denegó la escritura de B con 403 y confirmó con dos conexiones que A ve su avance y B no ve avances; no dejó cambios persistidos y utilizó contextos locales sintéticos. El usuario informó un POST 403 desde la sesión Auth0 real de B y un evento `security.denied` 403 en backend. PostgreSQL confirmó que B no tenía avances antes de asignar el rol de avance autorizado. La prueba de escritura independiente con las dos cuentas reales sigue en curso. La limitación de `app.user_id` como GUC manipulable, el comportamiento ante revocación concurrente y las revisiones independientes de RLS, pool y auditoría externa permanecen abiertos.

## Pruebas ejecutadas

- Backend: typecheck, lint, build, smoke y `npm test`: **30 aprobadas, 20 omitidas**. La prueba de lectura concurrente adicional pasó con 4 conexiones.
- Frontend: typecheck, lint y **20 pruebas unitarias** aprobadas; build de producción y **7 pruebas Playwright** aprobados en una copia aislada sin `.env.local`, con Chrome instalado. La comprobación local de exclusión del modo demo en build de producción pasó. La primera compilación aislada mediante un enlace a dependencias falló por la raíz de resolución de Turbopack; se repitió con dependencias copiadas y el comando normal pasó.
- Ninguna de las pruebas de frontend anteriores constituye una segunda sesión Auth0 real. No se alteraron los datos actuales para construir un estado vacío y no se ejecutaron pruebas ofensivas.

### Las 20 pruebas omitidas del backend

El comando ordinario `npm test` no recibe las variables `LAWWARE_TEST_*` que habilitan bases creadas para integración; las suites exigen una base local con nombre `lawware_backend_test_<sufijo>` y roles de test. La base de demostración activa **no cumple ese contrato y no debe utilizarse para forzar estas pruebas**. El caso específico de candidata requiere además `LAWWARE_TEST_CANDIDATE=1`. Estas omisiones no equivalen a fallos ni a aprobaciones. Las siguientes 6 pertenecen a `tests/integration/database.test.ts`:

1. Resolver sujetos Auth0 mediante el servicio técnico.
2. Peticiones HTTP autenticadas concurrentes de dos usuarios contra PostgreSQL.
3. Reutilización de una conexión sin fuga de contexto RLS entre usuarios.
4. Limpieza de contexto contaminado al devolver una conexión.
5. Rollback y rechazo de inserciones entre usuarios por RLS.
6. Rechazo de owner y servicio técnico equivocado como identidades de ejecución.

Las siguientes 14 pertenecen a `tests/integration/vertical.test.ts`:

1. Acumulación de permisos efectivos y exclusión de roles inactivos.
2. Lectura de contenido publicado y exclusión de borradores.
3. Persistencia y recuperación de avance sin degradar `COMPLETADA`.
4. Denegación por permisos insuficientes y rechazo de identidad arbitraria.
5. Denegación sin token y de cuentas bloqueadas o inexistentes.
6. Permiso insuficiente y separación funcional de dos cuentas.
7. Indisponibilidad controlada de Privacy.
8. Aislamiento de escrituras simultáneas y reutilización del pool.
9. Rollback del progreso y limpieza de contexto.
10. Serialización entre retiro de lección y progreso.
11. Hallazgo histórico: suplantación del GUC si un servicio obtiene SQL arbitrario.
12. Escrituras concurrentes con conexiones PostgreSQL diferentes.
13. Hallazgo histórico: revocación confirmada después de comprobar permisos.
14. Forma HTTP de la candidata y Privacy pendiente, condicionada además a `LAWWARE_TEST_CANDIDATE=1`.

En la validación anterior se ejecutaron, en otras bases desechables con emisor simulado, una prueba de identidad canónica y nueve casos funcionales seleccionados de la candidata; eso no representa una ejecución completa de estas 20 ni prueba el tenant real. Los casos de hallazgos y cualquier revisión ofensiva permanecen fuera de esta tarea.

## Inventario, seguridad y Git

El [inventario de candidatos](INVENTARIO_CANDIDATOS_GIT.md) enumera los archivos modificados y sin seguimiento de ambas ramas; no es una selección aprobada para staging. Los `.env` y `.env.local`, `node_modules`, `.next`, `_local`, logs, backups, clusters, llaves y resultados temporales están ignorados según cada repositorio; los archivos de entorno reales no están registrados. Un barrido estático de candidatos buscó claves privadas, patrones de tokens GitHub/AWS/JWT, conexiones con contraseña y asignaciones de secretos, sin coincidencias tras revisar un falso positivo causado por un salto de línea. No sustituye una auditoría completa de secretos. El `.env.example` del backend incluye el dominio y audiencia de desarrollo no secretos indicados para este entorno; revisar si deben generalizarse antes del commit.

Antes de seleccionar archivos para un PR deben revisarse dos piezas heredadas: `scripts/init-local-lab.mjs` crea fixtures y utiliza `DROP DATABASE ... WITH (FORCE)` en su autoprueba o ante fallos, limitado a la base de nombre aleatorio que él mismo crea tras comprobar el clúster; no se ejecutó en esta consolidación y no debe confundirse con el cierre conservador de la sesión actual. Además, `src/modules/privacy/infrastructure/notices.ts` conserva una implementación de lectura no conectada a la ruta deshabilitada; mantenerla como código experimental no convierte Privacy en una funcionalidad aprobada.

La copia de compilación con dependencias y la copia con enlace a `node_modules` quedaron en `_local/temporary`, fuera de ambos repositorios. La revisión automática rechazó su eliminación por política sin detallar el motivo; no se reintentó su borrado. El laboratorio activo y las evidencias históricas se conservan.

## Estrategia propuesta de commits y PR

- **Backend, `feat/backend-foundation-auth`:** agrupar primero base Express/Auth0 y contratos, después vertical académico/pools/pruebas, y finalmente documentación y propuestas SQL. Títulos posibles: `feat: add Auth0 identity and transactional backend foundation`, `feat: add experimental academic progress vertical`, `docs: record local Auth0 academic validation`. Los límites reales entre commits deben revisarse para no separar código de sus dependencias; la candidata 03 se incluye solo como propuesta de backend, no como migración oficial.
- **Frontend, `feat/frontend-foundation-onboarding`:** agrupar base Next/Auth0 y adaptador de servidor, después experiencia académica y pruebas, y documentación. Títulos posibles: `feat: add server-side Auth0 integration`, `feat: connect academic dashboard to backend`, `docs: record local academic experience`.
- Preparar PR separados hacia `main`, primero el backend y luego frontend con referencia cruzada y dependencia explícita. No fusionar, publicar ni crear commits hasta nueva autorización. Antes de staging, volver a revisar el inventario, secretos, datos y diferencias; usar selección por rutas o partes revisadas.

## Siguiente módulo recomendado

Antes de ampliar el producto, completar aislamiento de dos usuarios y la revisión de permisos/consulta de progreso. Después, definir un contrato mínimo de perfil de usuario para mostrar información autorizada en el dashboard; mantener Privacy y registro como trabajos independientes sujetos a decisiones funcionales, legales y técnicas. No promover la migración candidata ni declarar aprobados RLS, pool, revocación o auditoría externa sin evidencia y revisión separadas.
