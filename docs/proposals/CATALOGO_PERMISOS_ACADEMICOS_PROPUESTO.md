# Catálogo propuesto de permisos de aplicación

**Propuesta no aprobada.** Los códigos siguientes son reconocidos por el backend experimental; no son roles técnicos de PostgreSQL. No se insertan ni asignan en la migración candidata. El catálogo definitivo, sus destinatarios y reglas requieren aprobación funcional.

| Código | Operación autorizada | Recurso | Módulo responsable | Endpoints actuales o uso | Estado |
|---|---|---|---|---|---|
| `ACADEMIC_READ` | Consultar contenido publicado y avance propio. | Módulos, lecciones publicadas y progreso del usuario. | Academic. | `GET /api/v1/academic/modules`, `/modules/:id/lessons`, `/lessons/:id`, `/progress`. | Provisional; validado solo con fixtures y emisor de prueba. |
| `ACADEMIC_PROGRESS` | Iniciar o completar el avance propio. | `avance_leccion` del usuario y versión publicada. | Academic. | `POST /api/v1/academic/lessons/:id/progress`; el backend exige además `ACADEMIC_READ`. | Provisional; no concede administración ni edición. |
| `CONTENT_MANAGE` | Mostrar el espacio de gestión de contenido. | Navegación editorial. | Authorization / futuro módulo editorial. | Se devuelve en `GET /api/v1/auth/capabilities`; no hay endpoints de edición implementados. | Alcance y operaciones pendientes; la interfaz mantiene acciones deshabilitadas. |
| `ADMIN_ACCESS` | Mostrar el espacio administrativo. | Navegación administrativa. | Authorization / futura administración. | Se devuelve en `GET /api/v1/auth/capabilities`; no hay endpoints de administración implementados. | Provisional; no concede operaciones administrativas por sí solo. |
| `PRIVACY_NOTICE_READ` | Consultar el aviso vigente y finalidades si existen vistas y configuración aprobadas. | Aviso y finalidades publicados. | Privacy. | `GET /api/v1/privacy/notices/current`; las vistas requeridas quedan fuera de la candidata académica. | Semántica y contrato legal pendientes; con la candidata sola el endpoint no está operativo. |

`GET /api/v1/auth/me` y `GET /api/v1/auth/capabilities` requieren autenticación y cuenta activa, pero no un código de la tabla. Los permisos desconocidos no se convierten en capacidades. El modelo permite varios roles activos: las asociaciones vigentes se consultan desde `usuario_rol`, `rol_permiso`, `rol` y `permiso`; el backend une los códigos permitidos. No se asignan estos códigos a roles existentes ni se crean administradores automáticamente.
