# Auth

Verifica el access token con el SDK de Auth0, obtiene el `sub`, consulta la identidad interna por `usuario.auth0_id` mediante el servicio técnico y solo admite usuarios `ACTIVO`. No crea usuarios, no asocia cuentas por correo y no concede permisos de aplicación. El caso de uso devuelve una respuesta mínima con UUID y estado. El usuario informó un recorrido con el proveedor real; no se capturó directamente el token ni la respuesta 200 de identidad.
