# Resultados del vertical académico

Fecha local: 17 de noviembre de 2026. Estado: implementación experimental **no completa para uso real**. No se accedió a Auth0, Render o Vercel y no se modificaron LawWare-database ni LawWare-context.

## Clasificación

| Clasificación | Resultado |
|---|---|
| Integrado y comprobado con servicios reales de desarrollo | Solo salud frontend → backend y pruebas de PostgreSQL local; no se ejecutó login real de Auth0. |
| PostgreSQL real + emisor de prueba | Identidad, varios roles, permisos activos, módulos y lecciones publicadas, progreso propio persistido y recuperado, repetición, denegación, rollback, RLS y dos peticiones concurrentes. Se aplicó el borrador SQL exclusivamente en base desechable. |
| Implementado pero pendiente de configuración/revisión | SDK Auth0 de Next y Express, pantallas académicas conectadas al BFF, login/logout, consulta de aviso vigente y aprovisionamiento de cuenta de desarrollo. Falta el tenant y la migración aprobada; no se ha probado el viaje completo de navegador a PostgreSQL con Auth0 real. |
| Demostrativo no persistente | Registro de privacidad y paneles de `/demo`; se identifican y bloquean en producción. |
| Pendiente de negocio o privacidad | Contenido legal, presentación persistida, consentimiento, vinculación de prerregistro, activación, cero finalidades, reintentos idempotentes de evidencia y roles definitivos. |

## Pruebas

- PostgreSQL 17.11 en clúster local aislado: `npm run test:db` ejecutó 6 pruebas con el SQL canónico; `npm run test:vertical:draft` ejecutó 15 pruebas, incluyendo las 6 anteriores y 9 verticales, con emisor/JWKS simulado y borrador aplicado únicamente en una base temporal. Los fixtures son sintéticos. Los requests de dos usuarios se ejercitaron concurrentemente con pool de progreso de tamaño 1; no cubren todas las posibles intercalaciones.
- Se comprobó persistencia de avance tras nueva petición HTTP, no degradación de `COMPLETADA`, rechazo de cuerpo con usuario arbitrario, rol inactivo, permiso inactivo, lecciones en borrador, separación de usuarios, rollback y limpieza del GUC. También se probó el bloqueo de una retirada concurrente durante la transacción. No se probó una recarga de navegador autenticado con Auth0 real.
- `npm run test:provision` creó un laboratorio sintético, vinculó un `sub` sintético introducido por la herramienta administrativa y comprobó el resultado sin cambiar estado o roles; se eliminaron los recursos de la prueba. El `sub` real de desarrollo deberá obtenerse y verificarse externamente.
- Backend: `typecheck`, `lint`, build y smoke correctos; `npm test` ejecuta 29 pruebas y omite las 15 de PostgreSQL que se corren por separado. Frontend: `typecheck`, `lint`, build y 18 unitarias correctas; 6 pruebas de navegador cubrieron demostración, denegaciones y accesibilidad básica. El BFF de progreso rechaza origen ajeno, entrada excesiva e identificadores de usuario en la solicitud.
- Build de producción: rutas de demo devuelven 404 incluso con la variable activada. La prueba de salud comprueba únicamente `/api/health` → backend `/health`; backend sin token devuelve 401 y el BFF sin configuración Auth0 devuelve 503.

## Bloqueos y riesgos

1. No hay `AUTH0_DOMAIN`, Client ID/secret, secreto de sesión ni audiencia de un tenant de desarrollo configurados. Login, callback, logout, expiración y rotación de claves con Auth0 real no se han probado. Las pruebas de tokens sintéticos no sustituyen esa prueba.
2. El SQL canónico no permite consultar permisos propios desde `lawware_app`, la vista de lecciones omite el módulo y el orden y no proporciona un mecanismo de bloqueo de publicación para progreso. El [borrador](../proposals/02_vertical_academico_BORRADOR.sql) propone cambios mínimos, no está aprobado ni instalado en una base persistente y debe revisarse como migración versionada en LawWare-database. Sin él las capacidades responden 503 y el vertical queda cerrado.
3. `fn_permisos_propios` y `fn_bloquear_leccion_publicada` propuestos son `SECURITY DEFINER`; revisar propietario, privilegios, búsqueda de objetos, RLS, riesgos del GUC y carreras con revocación concurrente de roles o permisos. Sus códigos de capacidades son provisionales. Los grants preexistentes a servicios Auth y progreso abarcan más operaciones que este vertical; requieren revisión de mínimo privilegio.
4. El clúster local usa `trust` y solo es apto para datos sintéticos en equipo confiable. `app.user_id` no verifica identidad por sí mismo. La configuración administrada, TLS, secretos, auditoría externa y políticas RLS restantes no han sido aprobadas.
5. El aviso consultado desde la fixture es sintético y no tiene aprobación jurídica. Consultar no registra presentación ni consentimiento. Las operaciones de administración y contenido permanecen deshabilitadas.

Consulte [la guía local](GUIA_DEMOSTRACION_FUNCIONAL.md), [endpoints](../api/ENDPOINTS.md) y el [inventario de cambios](INVENTARIO_VERTICAL.md). Las cifras detallan pruebas locales; no confundirlas con la demostración obligatoria de Auth0 real.
