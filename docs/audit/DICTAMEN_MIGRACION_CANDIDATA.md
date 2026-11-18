# Dictamen técnico de la migración académica candidata

Fecha: 17 de noviembre de 2026. **Lista para revisión humana; no se recomienda incorporarla todavía a LawWare-database ni aplicarla a bases persistentes.** La candidata se probó en PostgreSQL local, pero permanecen decisiones de privacidad, la integración de su registro de versiones con el proceso oficial y revisiones independientes pendientes. Ningún resultado de este informe constituye aprobación de producción.

Nota posterior: este dictamen conserva el 500 de privacidad observado entonces. La ruta experimental se deshabilitó después y ahora devuelve 503 controlado; véase el [informe de Auth0 de desarrollo](INFORME_AUTH0_DESARROLLO.md).

## Archivos y alcance

- [Candidata 03](../proposals/03_vertical_academico_REVISION.sql): nueva, no aprobada.
- [Borrador 02](../proposals/02_vertical_academico_BORRADOR.sql): conservado sin cambios.
- [Catálogo propuesto de permisos](../proposals/CATALOGO_PERMISOS_ACADEMICOS_PROPUESTO.md): no crea ni asigna permisos.
- `src/modules/academic/infrastructure/academic-repository.ts`: adaptación mínima para preferir la nueva vista y conservar compatibilidad con el borrador 02 en laboratorio. Los nombres de vistas son constantes internas y los identificadores se pasan como parámetros; no hay `SELECT *` en el código de producción del backend.
- `tests/compatibilidad/migracion-candidata.mjs` y `tests/integration/vertical.test.ts`: pruebas de la candidata y del contrato HTTP. Las pruebas de compatibilidad usan `SELECT *` deliberadamente solo para verificar que la vista canónica conserva su forma y sus resultados.
- `docs/api/ENDPOINTS.md` y `docs/development/GUIA_DEMOSTRACION_FUNCIONAL.md`: referencias a la candidata, su carácter no aprobado y la dependencia pendiente de privacidad; la guía conserva el flujo histórico con el borrador 02.

SQL canónico, frontend, LawWare-database y LawWare-context no se modificaron. No se aplicó la candidata a una base persistente, no se usaron servicios externos y no hubo commits, push o merge. La revisión especializada de seguridad permanece independiente, conforme al alcance solicitado.

## Comparación con el borrador 02

| Aspecto | Borrador 02 | Candidata 03 |
|---|---|---|
| Lecciones | Reemplaza la vista canónica y añade dos columnas. | Conserva intacta la vista canónica y crea `v_lecciones_academicas`, que obtiene las cinco columnas desde la vista original y agrega módulo y orden desde `leccion`. |
| Funciones | Crea `fn_permisos_propios()` y `fn_bloquear_leccion_publicada(uuid)`. | Mantiene sus contratos y cuerpos; no introduce un mecanismo alternativo de autorización. |
| Privacidad | Crea dos vistas y grants con un filtro temporal. | Omite esas vistas y grants hasta que se decida la regla de vigencia. No modifica tablas, triggers ni reglas de privacidad existentes. |
| Versionado | Sin registro ni verificación explícita de base. | Añade preflight, bloqueo consultivo transaccional y tabla de registro `lawware.migraciones_esquema`. |
| Repetición | La segunda ejecución falla por función existente. | La segunda ejecución falla deliberadamente con `LAWWARE_MIGRATION_ALREADY_APPLIED`; no es idempotente. |

El diff completo se puede revisar localmente con `git diff --no-index -- docs/proposals/02_vertical_academico_BORRADOR.sql docs/proposals/03_vertical_academico_REVISION.sql`. El código de salida 1 de ese comando indica que existen diferencias.

## Vista y contratos de lecciones

| Posición | Vista canónica `v_lecciones_publicadas` | Vista candidata `v_lecciones_academicas` |
|---:|---|---|
| 1 | `id_leccion_version uuid` | `id_leccion_version uuid` |
| 2 | `id_leccion uuid` | `id_leccion uuid` |
| 3 | `numero_version integer` | `numero_version integer` |
| 4 | `titulo varchar(180)` | `titulo varchar(180)` |
| 5 | `contenido text` | `contenido text` |
| 6 | — | `id_modulo uuid` |
| 7 | — | `orden integer` |

La opción de vista independiente evita modificar la definición o el resultado de `SELECT *` de la vista canónica, incluidos consumidores que aún no se conocen. La candidata concede SELECT de la vista nueva a `lawware_app`. El backend consulta sus columnas explícitamente y, si la nueva vista no existe, mantiene el comportamiento anterior con la vista ampliada del borrador 02. Esa compatibilidad transitoria no convierte a ninguno de los dos archivos en una migración aprobada.

## Funciones y dependencias

`fn_permisos_propios()` lee `usuario`, `usuario_rol`, `rol`, `rol_permiso` y `permiso`; devuelve únicamente códigos de asignaciones activas y vigentes. El backend verifica el access token, resuelve `sub` a usuario activo y establece el UUID en el contexto de la transacción antes de consultar la función. La candidata concede EXECUTE a `lawware_app` y `lawware_progress_service`; no concede acceso directo de tabla ni asigna roles de aplicación.

`fn_bloquear_leccion_publicada(uuid)` comprueba el contexto de usuario y bloquea con `FOR SHARE` las filas de versión, lección y módulo publicadas durante la transacción de progreso. EXECUTE se concede a `lawware_progress_service`. El backend mantiene su consulta parametrizada, transacción, RLS existente y comprobación de capacidades.

Ambas funciones son `SECURITY DEFINER` con `search_path=pg_catalog,lawware,pg_temp`; en el laboratorio pertenecen al migrador. La candidata exige que el ejecutor sea propietario del esquema, las tablas necesarias y la vista original. `app.user_id` es contexto, no prueba fuerte de identidad; la integración real Auth0, la revisión de privilegios y las garantías ante revocación concurrente siguen pendientes. Este dictamen no los aprueba.

## Estrategia propuesta de migraciones

1. El archivo comienza una transacción y toma un bloqueo consultivo transaccional identificado por `lawware:migraciones_esquema`.
2. El preflight exige PostgreSQL 16 o superior, un esquema y tablas con propietario esperado, roles técnicos, firma y forma de la vista original, `fn_app_user_id()`, la función de vinculación y marcadores estructurales de v2.1. Rechaza nombres de objetos ya ocupados.
3. Si ya existe `lawware.migraciones_esquema`, verifica su propietario, tres columnas y PK. Si el ID `v2.1/03_vertical_academico` está registrado, rechaza la ejecución de forma controlada.
4. Si no existe el registro, lo crea dentro de la misma transacción; después crea vista y funciones, aplica los grants e inserta la versión con `base_requerida` y timestamp. El commit ocurre al final.
5. Un error antes del commit revierte tanto el registro como los objetos de la candidata. El test inyectó un error después del DDL y observó esa reversión en una base desechable.

La detección de v2.1 es **estructural y parcial**: no verifica la totalidad de definiciones ni prueba criptográficamente la versión instalada. Los hashes del archivo deben registrarse y cotejarse por un procedimiento de migración independiente. La tabla propuesta agrega una tabla, tres columnas, una PK y su índice al catálogo; afecta los recuentos y necesita una decisión sobre el registro oficial y su representación documental. La candidata no registra un checksum del archivo y no reemplaza una herramienta de migraciones.

Un esquema que ya tenga aplicado el borrador 02 se rechaza: su vista canónica tiene siete columnas y sus funciones ya existen. La transición desde ese estado necesita un plan separado; no se sobrescriben ni se eliminan objetos. Las precondiciones también son estrictas respecto al propietario, por lo que instalaciones con propietarios separados requieren una estrategia revisada.

## Avisos y decisión pendiente

El trigger canónico de presentación comprueba `estado='VIGENTE'`. Las vistas del borrador 02 agregaban la condición `fecha_vigencia IS NULL OR fecha_vigencia<=statement_timestamp()`, mientras que el trigger no la comprueba; además, la vista propuesta no filtraba el estado de cada finalidad asociada. Alternativas a revisar: aplicar únicamente el criterio de estado, alinear vista y trigger en una migración de privacidad separada, o definir otra regla con sus pruebas y responsables. No se ha elegido ninguna.

La candidata 03 no crea `v_avisos_vigentes` ni `v_finalidades_aviso_vigente`. Con ella sola, el endpoint experimental `GET /api/v1/privacy/notices/current` existente todavía busca esas vistas y devuelve **500 genérico** cuando llega a la consulta; esto se comprobó y se registra como integración pendiente. No debe presentarse como funcional ni como un cambio aprobado de privacidad. La tabla de permisos propuesta incluye `PRIVACY_NOTICE_READ`, pero no se asigna automáticamente.

Para el frontend que dependa de ese endpoint, esto impide obtener y mostrar el aviso y sus finalidades desde esa integración; no se ha validado aquí su comportamiento de interfaz ante el error. Mientras siga pendiente la decisión, tampoco debe interpretarse la visualización de un aviso en modo simulado como confirmación de la vigencia aplicable ni como registro de presentación o consentimiento.

## Validación local

Servidor y `psql`: PostgreSQL **17.11** en Windows x86-64. El comando `node tests/compatibilidad/migracion-candidata.mjs` creó bases locales desechables y las eliminó. Los SQL canónicos y los dos borradores se usaron sin modificar; no se realizó una prueba de penetración ni se accedió a servicios externos.

| Comprobación | Resultado |
|---|---|
| Base v2.1 y aplicación de candidata | Instaladas en base desechable con fixtures existentes; correcta. |
| Vista canónica | Definición, columnas y resultado de `SELECT *` iguales antes y después en los fixtures. |
| Datos existentes | Instantánea de 11 tablas sintéticas, incluido un avance, igual antes y después. No demuestra compatibilidad con todos los datos históricos. |
| Catálogo | 31 → 32 tablas, 223 → 226 columnas de tablas, 167 → 168 constraints, 88 → 89 índices, 57 triggers sin cambios, 30 → 32 funciones y 8 → 9 vistas. El incremento de tabla/columnas/PK/índice corresponde al registro de migraciones. |
| Precondiciones | Base sin esquema, v2.0 sin marcadores v2.1, registro incompatible y objeto en conflicto rechazados. |
| Estado y segunda ejecución | Registro `v2.1/03_vertical_academico` presente una vez; segunda ejecución rechazada con mensaje controlado. |
| Rollback | Error deliberado después del DDL: sin ledger, vista o función parcialmente creados y sin cambios en fixtures. |
| Funcionalidad de candidata | 8 pruebas seleccionadas pasaron: capacidades, módulos/lecciones publicados, progreso, ausencia de token, concurrencia funcional, rollback, retirada y forma HTTP; 5 se omitieron. El caso HTTP también comprobó el 500 pendiente de privacidad. |
| Regresión de borrador 02 | Una prueba canónica de identidad y 4 pruebas funcionales seleccionadas con 02 pasaron en ejecución separada; la adaptación del backend conserva el fallback. |
| Calidad | `npm run typecheck`, `npm run lint`, `npm run build` y `npm run test:smoke` pasaron. No se ejecutaron todas las suites históricas ni pruebas con Auth0 real. |

Los datos y tokens de estas pruebas son sintéticos. La validación no demuestra compatibilidad con todos los consumidores ni todas las bases con historia. Las bases y roles temporales de la prueba se eliminaron.

## Hashes SHA-256

| Archivo | SHA-256 |
|---|---|
| `LawWare_v2_00_esquema.sql` | `6a4117cde13cec38205c3dad8bf656fc495eb0b663e4e182cac298e3706f70b5` |
| `LawWare_v2_01_integridad.sql` | `9740eb6c85e17a5379a74035aaa7f7ec0fdeab5942054bf758d1f95c90686e3a` |
| `LawWare_v2_02_seguridad_rls.sql` | `d447ddf52c087f84d1f7f7a0c7f146f030d8acf68d2e8c8a4432cdaabf4fea63` |
| `01_migracion_trazabilidad_auditoria_v2_1.sql` | `6a1573dd4c4eb4acaa56564b4f2de38771b72d854379d118ffe2def0958fc12e` |
| Borrador 02 original | `9d49c3e93b503b54e1ab635c3a308801ea918e8f5fd85a21e4d8ec2b1dc8a82c` |
| Candidata 03 | `4d08f8121e846435f5b57c49c95a093d447830bfc4469136dbc170e2b5017cb3` |

## Recomendación

Revisar y aprobar el catálogo de permisos, la titularidad de objetos y la estrategia oficial de versionado; resolver en fase separada las vistas de privacidad y la respuesta del endpoint; diseñar una transición si algún entorno ya instaló el borrador 02; ampliar la regresión y completar la revisión especializada independiente. Solo después debe proponerse una versión canónica al repositorio Database mediante la autorización correspondiente.
