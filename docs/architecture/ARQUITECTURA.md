# Arquitectura del backend

LawWare usa un monolito modular. Express recibe HTTP; `middleware/` establece correlación y verifica identidad; los casos de uso en `modules/auth/application/` aplican la regla de acceso; el repositorio de Auth consulta el esquema v2.1; `infrastructure/` administra el pool y las transacciones. Las entidades y contratos se mantienen cerca del módulo que los usa. Se evitan capas vacías y dependencias entre módulos sin una interfaz acordada.

## Flujo de identidad

1. El servidor genera un UUID de petición y uno de correlación. No confía en los identificadores recibidos del cliente.
2. Auth usa `@auth0/auth0-express-api` 1.0.0 y su verificador para comprobar firma por JWKS, emisor, audiencia, expiración, `iat`, `sub` y algoritmo permitido RS256. Se rechaza una audiencia que incluya el client ID configurado; la audiencia API debe ser distinta del ID del cliente.
3. El repositorio consulta `lawware.usuario.auth0_id` con parámetros usando la conexión técnica de `lawware_auth_service`. Usuario inexistente o con estado distinto de `ACTIVO` se rechaza con 403. No se usan email, body, query ni headers para vincular identidades.
4. `GET /api/v1/auth/me` devuelve únicamente UUID interno y estado. No crea ni activa cuentas, asigna roles o expone permisos administrativos.

El SDK usa un emisor configurado por el servidor. Las pruebas automatizadas de JWKS usan claves sintéticas; el usuario informó un recorrido académico con Auth0 real, sin captura directa del token o del 200 de bootstrap. Las políticas completas del tenant siguen pendientes de revisión. El SDK puede tratar un fallo de descubrimiento/JWKS como token inválido; esta versión responde 401 de forma genérica en ese caso y no demuestra un diagnóstico independiente de disponibilidad.

## Persistencia y RLS

`AUTH_DATABASE_URL`, `APP_DATABASE_URL` y `PROGRESS_DATABASE_URL` representan identidades técnicas distintas. El acceso real comprueba al obtener conexión la membresía esperada y rechaza roles superusuario, `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, replicación, propietarios del esquema/objetos y membresías de otros servicios o roles amplios conocidos. Esto no constituye una auditoría exhaustiva de grants individuales. El baseline concede al servicio de Auth `SELECT`, `INSERT` y `UPDATE` de usuario: el backend solo ejecuta SELECT, pero la concesión amplia existente debe revisarse en la base de datos por separado.

`withTransaction` adquiere una conexión, verifica el rol, ejecuta `BEGIN`, fija contexto con `set_config(..., true)`, corre el callback en esa misma conexión y confirma o revierte. Antes de liberar, limpia los GUC a nivel de sesión; si rollback o limpieza fallan, descarta la conexión. El servicio ordinario requiere un UUID de usuario proporcionado por código confiable tras autenticación. El helper no valida JWT por sí mismo. Se probaron dos usuarios, concurrencia, reutilización de un backend PostgreSQL, rollback y un valor de sesión contaminado en desarrollo local.

`app.user_id` es manipulable por SQL y no prueba identidad; la frontera depende de Auth0, las credenciales restringidas y consultas parametrizadas. No exponer SQL arbitrario. `/auth/me` usa el pool Auth; lectura académica y RBAC usan aplicación, y escritura de progreso usa el pool de progreso. Los endpoints nuevos dependen de un borrador SQL no aprobado que solo se ha probado en base desechable.

## Módulos y convenciones

Los límites de `users`, `authorization`, `privacy`, `academic`, `dilemmas`, `evaluations` y `audit` se documentan en sus README. No contienen lógica ficticia. Los módulos se comunican por contratos explícitos; las reglas críticas que ya garantiza PostgreSQL no deben duplicarse sin justificación. Código, archivos y rutas usan nombres descriptivos; cada módulo agrega sus carpetas de presentación, aplicación, dominio e infraestructura solo cuando sean necesarias.

La autorización experimental se apoya en `rol`, `permiso`, `usuario_rol` y `rol_permiso`, y es distinta de los roles técnicos PostgreSQL. La función SQL propuesta devuelve roles y permisos activos del usuario del contexto; los códigos reconocidos son provisionales y los demás se deniegan. Su función `SECURITY DEFINER`, grants y carreras con revocación requieren revisión antes de aprobación. La regla de permisos se comprueba en cada operación.

Pino emite eventos estructurados sin headers, body, tokens ni errores internos. El logger corre fuera de la transacción de negocio, pero stdout no demuestra transporte, almacenamiento, retención ni integridad de un sistema de auditoría externo. Las decisiones de consentimiento, retención y el contrato completo con Next.js permanecen pendientes. La URL y el TLS reales de PostgreSQL administrado deben evaluarse antes de un despliegue.

Fuentes: [SDK oficial de Auth0 para Express API](https://github.com/auth0/auth0-express/blob/main/packages/auth0-express-api/README.md), [ciclo de versiones de Node.js](https://nodejs.org/en/about/previous-releases), [transacciones con node-postgres](https://node-postgres.com/features/transactions).
