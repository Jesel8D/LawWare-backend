# Diagnóstico del dashboard y laboratorio Auth0

Fecha: 17 de noviembre de 2026. El usuario informó que el login real Auth0, el callback y el recorrido académico hasta completar y recuperar una lección funcionaron. Se confirmó el avance en PostgreSQL. La comprobación en navegador fue realizada por el usuario; la herramienta de interfaz del agente no estaba disponible.

## Dependencia que bloquea el dashboard

El BFF `/api/vertical/bootstrap` obtiene el access token de la sesión de servidor y llama primero a `/api/v1/auth/me`; solo después consulta capacidades, módulos y avance. El frontend usa la URL local correcta del backend. Antes de preparar el laboratorio, el `.env` del backend no definía `AUTH_DATABASE_URL`, `APP_DATABASE_URL` ni `PROGRESS_DATABASE_URL`, y PostgreSQL del laboratorio no escuchaba en el puerto 55439. El backend no utiliza una variable `DATABASE_URL` única.

Si el proceso backend tenía esa configuración efectiva, la primera petición autenticada alcanzaría `IDENTITY_STORE_UNAVAILABLE` (503) porque no se había construido el pool de identidad. La ausencia de una cuenta interna, una vez disponible el pool y validado el token, responde 403; un token no verificado responde 401. La respuesta BFF y el registro anterior solo exponían el 503 genérico, de modo que no permiten probar por sí solos qué rama se produjo ni que se validó el token real. El control de interfaz del navegador no estuvo disponible en esta sesión.

El manejador de errores ahora registra `error_code` solo para un conjunto fijo de códigos de dependencia, sin volcar errores, conexiones o tokens. Reiniciar el backend y repetir la petición permite distinguir `IDENTITY_STORE_UNAVAILABLE`, `APPLICATION_STORE_UNAVAILABLE`, `CAPABILITIES_UNAVAILABLE` y otros casos. Las fallas inesperadas de conexión o consulta pueden ser 500 genéricos; no deben confundirse con un 403 de usuario o un 401 de token.

## Laboratorio autorizado

Con autorización expresa se inició el clúster local `_local/temporary/pg-local` en loopback y se creó exclusivamente `lawware_dev_synthetic_592521a650e0`, con roles técnicos separados y el SQL canónico v2.1 más candidata 03. La candidata y sus funciones y vistas académicas se verificaron presentes. La base tiene una cuenta sintética activa, un rol con `ACADEMIC_READ` y `ACADEMIC_PROGRESS`, un módulo y una lección publicados. No se asignaron permisos administrativos ni de privacidad.

Los tres logins técnicos conectan y poseen sus respectivos roles. Una consulta mediante el repositorio aplicativo y contexto sintético recuperó ambas capacidades, un módulo, una lección y cero avances. Esa comprobación no utilizó Auth0 ni prueba identidad real.

Las tres variables de conexión del laboratorio se añadieron al `.env` local ignorado sin imprimirlas. El operador vinculó la cuenta mediante `scripts/provision-local-user.mjs` y se comprobó que permanece activa y ya no tiene el identificador sintético de marcador. El proceso backend se reinició y su inicio es posterior a la actualización del archivo. La consulta mediante el repositorio de identidad resolvió la cuenta vinculada y el repositorio aplicativo devolvió los dos permisos, un módulo y una lección. No se vincula por correo ni se publican identificadores de identidad.

El usuario informó que, con su sesión real de Auth0, el dashboard mostró el módulo, permitió iniciar y completar la lección y conservó el estado tras recargar. Una consulta independiente a PostgreSQL confirmó `COMPLETADA` y fechas de inicio y finalización presentes. Dado que el BFF del dashboard obtiene el token de sesión y el backend exige su verificación antes de resolver la identidad y servir el contenido, ese resultado respalda el funcionamiento de la cadena con el token de la sesión; el agente no inspeccionó el token, los registros del 200 ni la interfaz. No debe presentarse como inspección directa del token o como validación exhaustiva de seguridad.

El inicializador ahora conserva la base si recibe EOF, Ctrl+C o una confirmación incorrecta; exige `ELIMINAR <nombre-exacto>` y no usa desconexión forzada. Se verificó con Ctrl+C que la sesión actual conserva sus recursos y deja PostgreSQL disponible; la terminal inicializadora ya terminó. La [guía local](../development/GUIA_DEMOSTRACION_FUNCIONAL.md) describe el inicio, vinculación, recorrido y recuperación manual de esa base. La autorización solo cubrió este laboratorio y una cuenta, por lo que la prueba de aislamiento con dos usuarios sigue pendiente.

## Pruebas y pendientes

- Backend: typecheck, lint, build, smoke y 30 pruebas pasaron; 20 pruebas quedaron omitidas. La nueva prueba comprueba el código de diagnóstico con un emisor sintético y que el token no aparece en logs.
- Frontend: typecheck, lint y 19 pruebas pasaron, incluida una prueba con respuesta simulada sin módulos publicados; muestra el estado vacío sin alerta de error. No se alteró el SQL canónico ni la candidata 03.
- El dashboard y la recuperación de progreso fueron comprobados en navegador por el usuario y el estado persistido se confirmó en SQL. El usuario informó que el logout real funcionó y que el bootstrap respondió 401 sin sesión. La captura independiente de `bootstrap` 200 y el aislamiento de dos usuarios siguen pendientes. La causa específica del 503 histórico no pudo confirmarse con sus registros originales, aunque la configuración sin pool de identidad ofrece una explicación consistente.
- La base activa es de laboratorio; su contenido académico es sintético, aunque se acceda a él mediante la integración y PostgreSQL reales. `app.user_id` sigue siendo contexto manipulable y no constituye identidad fuerte.
