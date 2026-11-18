# Compatibilidad técnica del vertical académico con PostgreSQL v2.1

Fecha: 17 de noviembre de 2026. Alcance: comparación local del [borrador](../proposals/02_vertical_academico_BORRADOR.sql) con los tres archivos baseline y la migración v2.1. Este informe trata compatibilidad de objetos, dependencias, permisos declarados y comportamiento funcional; no es una auditoría especializada de seguridad ni una aprobación de la migración.

## Resultado

El borrador se instaló y las pruebas funcionales seleccionadas pasaron en PostgreSQL 17.11, sobre una base desechable con datos sintéticos ya presentes. No modifica tablas ni filas directamente en ese escenario. **No es una migración idempotente**: al ejecutarla una segunda vez falla con SQLSTATE `42723` por una función ya existente. Quedan por resolver las condiciones de aplicación, la compatibilidad de consumidores de vistas y la interpretación de fechas de vigencia antes de proponer su incorporación al modelo canónico.

No se modificaron los SQL canónicos ni el borrador durante esta revisión. No se usaron servicios externos ni datos reales. Las pruebas de este informe no constituyen aprobación de producción, de Auth0 ni de controles especializados de seguridad.

## Diferencias de objetos

| Objeto | Modelo v2.1 | Borrador y dependencia funcional |
|---|---|---|
| `lawware.v_modulos_publicados` | Expone módulos con `estado='PUBLICADO'`; `lawware_app` tiene SELECT. | No cambia. El listado de módulos del backend depende de esta vista. |
| `lawware.v_lecciones_publicadas` | Expone, en orden, `id_leccion_version`, `id_leccion`, `numero_version`, `titulo`, `contenido`. Filtra versión publicada, lección activa y módulo publicado. | `CREATE OR REPLACE VIEW` conserva las cinco columnas y agrega `id_modulo` y `orden` al final. El listado de lecciones por módulo y su orden requieren ambas. El SELECT existente de `lawware_app` continúa vigente. |
| `lawware.fn_permisos_propios()` | No existe. `rol`, `permiso`, `usuario_rol` y `rol_permiso` contienen las asignaciones; el rol de aplicación no tiene SELECT directo sobre ellas. | Añade una función que devuelve códigos de roles y permisos activos del usuario establecido en el contexto, filtrando asignaciones futuras y roles/capacidades inactivos. La API de capacidades y las operaciones académicas dependen de ella. |
| `lawware.fn_bloquear_leccion_publicada(uuid)` | No existe. El trigger `tr_avance_version_publicada` comprueba la versión al insertar avance. | Añade una función que comprueba y bloquea versión, lección y módulo publicados durante la transacción de avance. La escritura experimental la invoca antes de insertar o actualizar. |
| `lawware.v_avisos_vigentes` y `lawware.v_finalidades_aviso_vigente` | No existen vistas equivalentes para `lawware_app`; el servicio de privacidad tiene permisos sobre las tablas. | Agrega dos vistas de consulta para el endpoint experimental de aviso y sus finalidades. No registra presentación ni consentimiento. |
| `lawware.avance_leccion` | PK `(id_usuario,id_leccion_version)`; estados `EN_PROGRESO` y `COMPLETADA`; timestamps y trigger existentes. | El borrador no cambia la tabla, PK, constraints ni triggers. La aplicación usa la PK para repetir el guardado y no degradar una lección completada. |

Ambas funciones nuevas se crearon con `SECURITY DEFINER`, propietario `lawware_migrador` en el laboratorio y `search_path=pg_catalog,lawware,pg_temp`; `fn_permisos_propios` es `STABLE` y `fn_bloquear_leccion_publicada` es `VOLATILE`. El propietario real será quien ejecute la migración, por lo que su identidad y capacidades deben quedar explícitamente fijadas durante la preparación de la versión definitiva.

## Roles y permisos necesarios

| Rol técnico | Permisos relevantes en v2.1 | Adiciones del borrador |
|---|---|---|
| `lawware_auth_service` | `SELECT`, `INSERT` y `UPDATE` sobre `usuario`; el backend actual consulta por `auth0_id`. | Ninguna. |
| `lawware_app` | SELECT en vistas publicadas y SELECT del avance propio conforme al contexto aplicado por la aplicación. | EXECUTE en `fn_permisos_propios()` y SELECT en las dos vistas nuevas de aviso; conserva SELECT en la vista reemplazada de lecciones. |
| `lawware_progress_service` | SELECT, INSERT y UPDATE en `avance_leccion`, con la política existente basada en el contexto transaccional. | EXECUTE en las dos funciones nuevas; el backend usa un pool separado para progreso. |
| Migrador/propietario | Crea o reemplaza objetos y ejecuta grants. | Debe poder reemplazar la vista, crear las funciones/vistas y otorgar permisos a los roles existentes. No se utiliza para atender las solicitudes normales. |

Los roles de aplicación en `usuario_rol` y sus permisos de negocio son distintos de estos roles técnicos. Los códigos `ACADEMIC_READ`, `ACADEMIC_PROGRESS`, `CONTENT_MANAGE`, `ADMIN_ACCESS` y `PRIVACY_NOTICE_READ` son contratos provisionales del backend; el borrador no los inserta ni asigna. Para que un usuario pueda usar el vertical deben existir roles y permisos efectivos configurados por un mecanismo autorizado.

El borrador obtiene el UUID interno mediante `fn_app_user_id()` y el contexto `app.user_id`; esta es una dependencia del contrato del backend. El presente informe no evalúa las garantías de identidad o seguridad de ese mecanismo.

## Incompatibilidades y decisiones de migración

1. **Modelo canónico sin borrador:** la vista de lecciones no proporciona `id_modulo` ni `orden`, y no existen las dos funciones ni las vistas de avisos propuestas. Por tanto, los endpoints nuevos del vertical no están disponibles con el esquema canónico sin cambios; la consulta de capacidades devuelve 503 controlado cuando falta su función.
2. **Reaplicación:** `CREATE FUNCTION` y `CREATE VIEW` no usan `OR REPLACE` ni una comprobación previa de versión. Una segunda aplicación falla; la prueba local observó `42723` y los datos de fixture permanecieron iguales. Antes de una migración definitiva debe decidirse cómo registrar versiones y verificar que los objetos existentes son los esperados; no se propone ignorar errores con `IF NOT EXISTS` de forma indiscriminada.
3. **Clientes de la vista:** los cinco campos originales mantienen su nombre, tipo y orden; se agregan dos al final. Consultas explícitas de las cinco columnas siguen siendo compatibles en el caso probado, pero clientes que dependan de que `SELECT *` devuelva exactamente cinco campos deberán revisarse.
4. **Avisos vigentes:** las vistas propuestas exigen `estado='VIGENTE'` y aceptan `fecha_vigencia` nula o no futura. El trigger canónico de presentación comprueba el estado `VIGENTE` sin ese filtro de fecha. Es una diferencia de semántica que requiere decisión de negocio; el borrador no cambia el trigger. La vista de finalidades devuelve las asociaciones del aviso y no filtra `finalidad_tratamiento.estado`; debe decidirse si ese comportamiento es el deseado para avisos históricos o vigentes.
5. **Precondiciones y dependencias:** el archivo presupone el esquema v2.1, la vista original, las tablas y funciones de contexto, y los roles `lawware_app` y `lawware_progress_service`. No verifica explícitamente la versión instalada, la propiedad de objetos ni si existen objetos homónimos con una definición diferente. Se recomienda un preflight y una política de migraciones antes de su aplicación en una base existente.
6. **Aplicación sobre datos existentes:** se comprobó una base sintética con usuarios, roles, módulos, versiones, aviso, finalidades y un avance previo; las filas de las tablas incluidas en la instantánea no cambiaron. Esta muestra no demuestra compatibilidad con todas las bases históricas, dependencias de vistas o configuraciones particulares. Antes de una aplicación real deben revisarse dependencias, bloqueo de la vista, respaldo y recuperación.

No se propone copiar o aplicar automáticamente este archivo al repositorio de base de datos. La revisión especializada de seguridad y la aprobación humana son actividades independientes.

## Pruebas funcionales ejecutadas

Se ejecutó desde `LawWare-backend`:

```powershell
node tests/compatibilidad/vertical-funcional.mjs
npm.cmd run typecheck
npm.cmd run lint
```

El script verifica el directorio del clúster local, crea dos bases y logins temporales de nombres aleatorios, aplica los cuatro SQL canónicos a ambas, carga fixtures sintéticos y aplica el borrador solo en la segunda. Elimina las bases y logins que creó. Utiliza `psql -X -v ON_ERROR_STOP=1` y el servidor `127.0.0.1:55439`; los tests de identidad usan emisor de pruebas, no Auth0 real.

| Comprobación | Resultado |
|---|---|
| Servidor y cliente | PostgreSQL **17.11**, Windows x86-64; `psql` **17.11**. |
| Instalación | Una base canónica y otra con borrador: correctas. |
| Catálogo | Tablas **31**, columnas de tablas **223**, restricciones **167**, índices **88** y triggers **57** sin cambio en el recuento. Funciones **30 → 32** y vistas **8 → 10**. La comparación es de recuentos, no de semántica exhaustiva. |
| Datos existentes | Antes y después del borrador coincidieron los conteos y el hash de una instantánea de 11 tablas de fixtures, incluido un avance previo. |
| Vistas y grants | Los logins técnicos de prueba consultaron módulos y lecciones publicados; los grants propuestos se comprobaron en catálogo. |
| Pruebas existentes seleccionadas | Base canónica: **1** prueba de resolución de identidad; base con borrador: **4** pruebas de capacidades, contenido publicado, guardado/recuperación de avance y consulta de aviso. Las demás se omitieron intencionalmente por el alcance de esta tarea. |
| Repetición | La segunda aplicación del borrador falló por función existente y la instantánea de fixture no cambió. |
| Calidad | `typecheck` y `lint` pasaron. |

Hashes SHA-256 de los archivos utilizados:

| Archivo | SHA-256 |
|---|---|
| `LawWare_v2_00_esquema.sql` | `6a4117cde13cec38205c3dad8bf656fc495eb0b663e4e182cac298e3706f70b5` |
| `LawWare_v2_01_integridad.sql` | `9740eb6c85e17a5379a74035aaa7f7ec0fdeab5942054bf758d1f95c90686e3a` |
| `LawWare_v2_02_seguridad_rls.sql` | `d447ddf52c087f84d1f7f7a0c7f146f030d8acf68d2e8c8a4432cdaabf4fea63` |
| `01_migracion_trazabilidad_auditoria_v2_1.sql` | `6a1573dd4c4eb4acaa56564b4f2de38771b72d854379d118ffe2def0958fc12e` |
| `02_vertical_academico_BORRADOR.sql` | `9d49c3e93b503b54e1ab635c3a308801ea918e8f5fd85a21e4d8ec2b1dc8a82c` |
