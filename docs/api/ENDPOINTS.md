# Endpoints de esta etapa

## `GET /health`

Devuelve `200` con `{"status":"ok"}` si el proceso HTTP responde. No comprueba conectividad con PostgreSQL o Auth0 y no es una prueba de disponibilidad de esos servicios.

## `GET /api/v1/auth/me`

Recibe `Authorization: Bearer <access_token>`. La audiencia debe ser la API de LawWare y distinta del client ID. Tras verificar el token y resolver un usuario `ACTIVO`, responde `200` con `{"id_usuario":"<uuid>","estado":"ACTIVO"}` y `Cache-Control: no-store`. No usa identificadores enviados en body, query o headers.

| Estado | Significado |
|---|---|
| 401 | Token ausente, malformado o no verificable. Esta versión también devuelve 401 si falla la obtención de claves del proveedor; no distingue todavía esa indisponibilidad. |
| 403 | Token verificado pero usuario interno inexistente o no activo. |
| 503 | Auth no configurado o repositorio interno no configurado después de verificar el token. |
| 500 | Error interno o de PostgreSQL; no incluye detalles, credenciales ni tokens. |

Errores usan `{"error":"<codigo>","requestId":"<uuid>"}`. Se genera `X-Request-Id` en servidor y se ignora el header del cliente. Los cuerpos JSON se limitan a 32 KiB. CORS permite únicamente orígenes configurados; no reemplaza autenticación ni autorización.

## Vertical académico experimental

Estos endpoints requieren token y cuenta activa y pools técnicos separados. Se probaron en PostgreSQL desechable con emisor simulado y el [borrador SQL 02](../proposals/02_vertical_academico_BORRADOR.sql). La [candidata académica 03](../proposals/03_vertical_academico_REVISION.sql) conserva la vista canónica y crea una vista académica independiente; el usuario informó un recorrido académico con Auth0 real usando esa candidata en laboratorio, sin captura directa del token o del bootstrap 200. El backend admite ambas variantes durante el laboratorio; ninguna está aprobada para bases persistentes. El endpoint experimental de privacidad está deshabilitado mientras se define la integración; el [dictamen](../audit/DICTAMEN_MIGRACION_CANDIDATA.md) documenta la situación anterior al bloqueo controlado.

| Método y ruta | Permiso experimental | Resultado |
|---|---|---|
| `GET /api/v1/auth/capabilities` | Usuario activo | Roles activos y capacidades reconocidas; sin permisos desconocidos. |
| `GET /api/v1/academic/modules` | `ACADEMIC_READ` | `{items}` de módulos publicados. |
| `GET /api/v1/academic/modules/:id/lessons` | `ACADEMIC_READ` | `{items}` de lecciones publicadas del módulo. |
| `GET /api/v1/academic/lessons/:id` | `ACADEMIC_READ` | Contenido de versión publicada. |
| `GET /api/v1/academic/progress` | `ACADEMIC_READ` | `{items}` de avance propio en versiones publicadas. |
| `POST /api/v1/academic/lessons/:id/progress` | `ACADEMIC_READ` y `ACADEMIC_PROGRESS` | Cuerpo estricto `{estado: "EN_PROGRESO" | "COMPLETADA"}`; respuesta confirmada por PostgreSQL. No acepta UUID de usuario. |
| `GET /api/v1/privacy/notices/current?type=INTEGRAL` | Cuenta activa | Deshabilitado: responde 503 `PRIVACY_NOT_AVAILABLE`. No consulta ni registra privacidad. |

No existe aprobación de las denominaciones de permisos, de Auth0 real ni del contenido legal. El código bloquea una lección publicada durante la transacción de avance para serializar su retirada; el caso de revocación concurrente de permisos necesita revisión adicional.
