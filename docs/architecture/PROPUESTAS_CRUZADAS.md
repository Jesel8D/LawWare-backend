# Propuestas para revisión posterior

Este documento no modifica los repositorios hermanos ni decide políticas de negocio.

- **Database:** evaluar una identidad técnica que solo lea `id_usuario`, `estado` y la columna necesaria para resolver `auth0_id`; `lawware_auth_service` actualmente tiene también INSERT y UPDATE sobre `usuario`. Revisar permisos directos, propietarios, RLS y el acceso de auditoría antes de desplegar. Cualquier cambio del modelo requiere migración, pruebas y revisión separadas.
- **Context:** confirmar las condiciones de alta, estados de usuario, enlace Auth0 y prerregistro, vigencia de consentimiento, retención y alcance de roles de aplicación. El backend actual no inventa esas reglas.
- **Frontend:** acordar el contrato de `GET /api/v1/auth/me`, las respuestas 401/403/503, el manejo de `X-Request-Id`, la audiencia API y el flujo de privacidad. CORS no reemplaza autenticación ni autorización.
- **Infraestructura:** acordar TLS de PostgreSQL, identidades de servicio, orígenes, forwarding y retención de logs, observabilidad de indisponibilidad de JWKS y capacidad del proveedor. No se han verificado ni configurado Render o Vercel.
