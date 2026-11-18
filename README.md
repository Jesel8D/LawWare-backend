# LawWare Backend

Backend en desarrollo como **monolito modular** con Node.js 24 LTS, TypeScript y Express. Implementa verificación de access tokens, resolución de usuario activo y un vertical experimental de capacidades, contenido publicado y progreso. El usuario completó un recorrido con Auth0 real en una base local desechable y PostgreSQL confirmó el avance; el registro HTTP y el token real no se inspeccionaron directamente. El vertical depende de una [candidata SQL](docs/proposals/03_vertical_academico_REVISION.sql) aún no aprobada. La consulta experimental de avisos está deshabilitada. No existe aprobación para producción.

El SQL v2.1 y sus pruebas son la fuente de verdad en [LawWare-database](https://github.com/Jesel8D/LawWare-database); las decisiones y el estado general están en [LawWare-context](https://github.com/Jesel8D/LawWare-context). Render es el alojamiento previsto y requiere validación posterior. Se conservan los [contratos de integración](docs/CONTRATOS_INTEGRACION.md).

## Inicio local

Requisitos: Node 24 y npm. No se necesitan credenciales para ejecutar las pruebas unitarias, iniciar el proceso o consultar `/health`; sin configuración Auth0, la ruta protegida permanece cerrada.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:smoke
npm.cmd run dev
```

En otros entornos use `npm` en lugar de `npm.cmd`. `GET /health` indica únicamente que el proceso responde. `GET /api/v1/auth/me` requiere un access token válido y un usuario interno activo. Las variables disponibles, incluidas las credenciales separadas de Auth y aplicación, están en `.env.example`; no se deben incluir secretos reales en el repositorio.

Para configurar servicios en desarrollo, copie `.env.example` a `.env` y complete allí los valores del entorno autorizado. `.env` está ignorado por Git. Configure `AUTH0_ISSUER_BASE_URL`, `AUTH0_AUDIENCE` y `AUTH0_CLIENT_ID` conjuntamente; los pools de Auth, aplicación y progreso requieren logins técnicos separados. No se crean cuentas internas automáticamente.

La integración de PostgreSQL se ejecuta aparte mediante `npm.cmd run test:db` con el clúster local aislado y el repositorio de base de datos hermano. La prueba crea una base y roles sintéticos temporales; no se ejecuta automáticamente sin ese entorno. Consulte [pruebas locales](docs/development/PRUEBAS.md).

## Guías

- [Arquitectura y responsabilidades](docs/architecture/ARQUITECTURA.md)
- [Endpoints y respuestas](docs/api/ENDPOINTS.md)
- [Propuesta contractual full stack](docs/api/CONTRATO_FULL_STACK_PROPUESTO.md)
- [Informe de consolidación full stack](docs/audit/CONSOLIDACION_FULL_STACK.md)
- [Seguridad y limitaciones](docs/security/SEGURIDAD.md)
- [Pruebas y entorno local](docs/development/PRUEBAS.md)
- [Guía de demostración funcional y bloqueos](docs/development/GUIA_DEMOSTRACION_FUNCIONAL.md)
- [Resultados del vertical académico](docs/development/RESULTADOS_VERTICAL.md)
- [Diagnóstico y evidencia del recorrido real](docs/audit/DIAGNOSTICO_503_AUTH0.md)
- [Prueba propuesta de aislamiento con dos usuarios](docs/proposals/PRUEBA_AISLAMIENTO_DOS_USUARIOS.md)
- [Resultados de esta etapa](docs/development/RESULTADOS_LOCALES.md)
- [Propuestas para los repositorios hermanos](docs/architecture/PROPUESTAS_CRUZADAS.md)

Los módulos académicos y de autorización tienen implementación experimental; registro público, consentimiento y operaciones administrativas siguen pendientes.
