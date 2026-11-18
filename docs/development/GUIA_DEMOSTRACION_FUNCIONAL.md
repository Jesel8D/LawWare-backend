# Guía de integración funcional local con Auth0

**Estado: el usuario informó login Auth0 real y recorrido académico hasta completar y recuperar una lección; PostgreSQL confirmó el avance.** La verificación de token se infiere del flujo implementado y del resultado reportado, sin inspección directa del token o del registro HTTP. La candidata 03 no está aprobada para el repositorio Database ni para bases persistentes. La prueba local no constituye aprobación de producción o legal.

**Alcance actual:** se autorizó una sesión local desechable con una cuenta sintética activa y permisos académicos mínimos. Ya se creó la base `lawware_dev_synthetic_592521a650e0`; no iniciar otro laboratorio sin una autorización aplicable. El proceso inicializador se cerró con Ctrl+C y se comprobó que conservó los recursos. El operador vinculó la cuenta y el backend se reinició con la configuración de la base.

## 1. Preparar Auth0 de desarrollo

En un tenant de desarrollo autorizado y separado de producción:

1. En **Applications**, crear una **Regular Web Application** para Next.js. Obtener Domain, Client ID y Client Secret del panel; mantener el secreto fuera de Git, logs y conversaciones.
2. En **APIs**, crear una API para Express con un identificador de audiencia propio, diferente del Client ID, y algoritmo de firma **RS256**. Usar ese identificador exactamente igual en ambos proyectos. No confundirlo con la URL física de Express.
3. Para la configuración actual con `localhost`, registrar **Allowed Callback URLs** `http://localhost:3000/auth/callback`, **Allowed Logout URLs** `http://localhost:3000` y, si se requiere, **Allowed Web Origins** `http://localhost:3000`. Usar siempre el mismo origen que `APP_BASE_URL`; si se cambia a `127.0.0.1`, registrar su callback y logout correspondientes. No mezclar ambos durante el recorrido.
4. Habilitar únicamente la conexión de desarrollo autorizada para la aplicación. Crear manualmente una o dos cuentas sintéticas de prueba y deshabilitar el alta pública en esa conexión. Obtener de manera autorizada el identificador estable `user_id`/sub de cada cuenta; no asociar por correo ni enviar el sub al chat. No habilitar altas o activaciones automáticas en LawWare.
5. El SDK Next.js instalado es `@auth0/nextjs-auth0@4.33.0` y el de Express es `@auth0/auth0-express-api@1.0.0`. El primero usa `proxy.ts`, sesión y cookies cifradas, `/auth/login`, `/auth/callback` y `/auth/logout`. Solicita la audiencia de API y deshabilita `/auth/access-token`; el token se obtiene solo en servidor. Express verifica el access token con el SDK y resuelve su sub a una cuenta interna activa.

En `LawWare-frontend/.env.local`, crear o editar sin sobrescribir ajustes existentes y completar localmente:

```dotenv
AUTH0_DOMAIN=<dominio-del-tenant-sin-https>
AUTH0_CLIENT_ID=<client-id-de-aplicacion-web>
AUTH0_CLIENT_SECRET=<secreto-de-aplicacion-web>
AUTH0_SECRET=<32-bytes-aleatorios-codificados-en-64-caracteres-hex>
AUTH0_AUDIENCE=<identificador-de-la-api>
APP_BASE_URL=http://localhost:3000
LAWWARE_BACKEND_URL=http://127.0.0.1:3001
LAWWARE_DEMO=0
```

Generar `AUTH0_SECRET` con un generador criptográfico local y escribirlo directamente en el archivo privado. El SDK cifra sus cookies de sesión y transacción con ese valor; conserva los valores predeterminados del SDK. El HTTP de loopback es solo para desarrollo. No imprimir valores secretos ni incluirlos en archivos versionados.

En `LawWare-backend/.env`, crear o editar sin sobrescribir ajustes existentes:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
CORS_ORIGINS=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<dominio-del-tenant>/
AUTH0_AUDIENCE=<el-mismo-identificador-de-api>
AUTH0_CLIENT_ID=<el-mismo-client-id-web>
```

Las tres URLs PostgreSQL se proporcionan en variables de entorno de la terminal de backend como se describe abajo; no emplear el migrador para peticiones HTTP. No poner secretos en `.env.example`. Tras cambiar las variables, reiniciar ambos procesos. Si falta cualquier valor Auth0, el acceso sigue deshabilitado.

## 2. Iniciar el laboratorio desechable

Requisitos: Windows, Node 24, PostgreSQL 17.11, dependencias ya instaladas y los repositorios hermanos. El clúster local existente `_local/temporary/pg-local` utiliza `trust`; usarlo exclusivamente en un equipo confiable, en loopback y con datos sintéticos. No usar Render ni datos reales.

Desde el directorio raíz local de LawWare, en una terminal de PowerShell:

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
& "$pgBin\pg_ctl.exe" -D '_local\temporary\pg-local' -l '_local\temporary\academic-session.log' -o '-h 127.0.0.1 -p 55439' start
Set-Location LawWare-backend
$env:NODE_ENV = 'development'
$env:LAWWARE_INIT_LOCAL = '1'
node scripts/academic-disposable-session.mjs
```

Mantener esta terminal abierta. El proceso comprueba `data_directory`, crea una base y tres logins técnicos de nombre aleatorio, instala los cuatro SQL canónicos y la candidata 03, y crea una cuenta sintética activa, un rol con `ACADEMIC_READ` y `ACADEMIC_PROGRESS`, un módulo y una lección sintéticos publicados. No asigna permisos administrativos ni de privacidad. La candidata comprueba sus precondiciones; **no se aplica el borrador 02**. `--self-test` también crea esos datos, por lo que requiere la misma autorización.

En otra terminal situada en `LawWare-backend`, utilizar el nombre exacto de base impreso por el proceso para construir las tres variables sin mostrar sus valores. El sufijo debe contener 12 caracteres hexadecimales. Estas conexiones son exclusivas del clúster local `trust` y no corresponden a producción:

```powershell
$labDb = '<nombre-exacto-impreso-por-el-laboratorio>'
if ($labDb -notmatch '^lawware_dev_synthetic_([a-f0-9]{12})$') { throw 'Nombre de laboratorio inválido' }
$labSuffix = $Matches[1]
$env:AUTH_DATABASE_URL = "postgresql://lw_lab_auth_$labSuffix@127.0.0.1:55439/$labDb"
$env:APP_DATABASE_URL = "postgresql://lw_lab_app_$labSuffix@127.0.0.1:55439/$labDb"
$env:PROGRESS_DATABASE_URL = "postgresql://lw_lab_progress_$labSuffix@127.0.0.1:55439/$labDb"
```

## 3. Vincular cuentas y arrancar

En otra terminal de backend, usar únicamente la herramienta administrativa local existente:

```powershell
$env:NODE_ENV = 'development'
$env:LAWWARE_DEV_DATABASE = '<nombre-exacto-impreso-por-el-laboratorio>'
node scripts/provision-local-user.mjs
```

Introducir el UUID sintético `90000000-0000-4000-8000-000000000001`, después el sub obtenido de la cuenta Auth0 de desarrollo y confirmar `VINCULAR`. La herramienta comprueba clúster y base, actualiza solo cuentas sintéticas activas elegibles y no asigna roles. El operador debe verificar el sub independientemente: la herramienta no lo verifica criptográficamente. Este laboratorio mínimo prepara una sola cuenta; el aislamiento entre dos cuentas queda pendiente de preparación y autorización específicas.

Con las tres URLs del laboratorio configuradas en la terminal del backend:

```powershell
npm.cmd run dev
```

En una terminal distinta, desde `LawWare-frontend`:

```powershell
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

Abrir el mismo origen configurado en `APP_BASE_URL` (`http://localhost:3000/acceso` en el entorno actual), iniciar sesión con la cuenta de desarrollo y confirmar el regreso al sitio. Las cookies de `localhost` y `127.0.0.1` son distintas; no cambiar de origen durante la prueba. Abrir **Mi aprendizaje**, elegir módulo y lección, iniciar y completar el avance, recargar y comprobar que continúa como completado. La consulta y el guardado pasan por el adaptador de servidor, el backend y PostgreSQL; no utilizar `/demo` como evidencia de esta prueba. Cerrar sesión y comprobar que las consultas protegidas ya no devuelven datos. Registrar los resultados sin capturar tokens, secretos o datos personales.

Para confirmar directamente el avance sintético, desde la terminal administrativa con `LAWWARE_DEV_DATABASE` establecido al nombre impreso por la sesión, ejecutar esta consulta de solo lectura. El migrador se utiliza aquí solo para inspección local, nunca en el servidor HTTP:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -h 127.0.0.1 -p 55439 -U lawware_migrador -d $env:LAWWARE_DEV_DATABASE -c "SELECT id_usuario, id_leccion_version, estado FROM lawware.avance_leccion ORDER BY id_usuario, id_leccion_version"
```

Al terminar, detener backend y frontend y escribir en la terminal del laboratorio `ELIMINAR <nombre-exacto-de-la-base>` con el nombre impreso. Un Enter, EOF o Ctrl+C no ejecuta la limpieza: la base se conserva. La limpieza elimina solo los recursos de esa sesión y no fuerza la desconexión de clientes; si hay conexiones activas, falla y conserva la base. Si se cerró la terminal o falló la limpieza, conservar los nombres impresos y revisar manualmente la procedencia y las conexiones antes de decidir una recuperación; no usar `DROP DATABASE ... FORCE`. Detener después el clúster que se inició para la prueba:

```powershell
& "$pgBin\pg_ctl.exe" -D '..\_local\temporary\pg-local' stop -m fast
```

Para la sesión actual, cuya terminal inicializadora ya terminó conservando los recursos, la limpieza es una operación separada y **no se ha ejecutado**. Si se decide realizarla, detener primero backend y frontend y verificar la ubicación y las conexiones. Con el clúster local activo, desde PowerShell:

```powershell
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
& $psql -X -h 127.0.0.1 -p 55439 -U postgres -d postgres -c 'SHOW data_directory'
& $psql -X -h 127.0.0.1 -p 55439 -U postgres -d postgres -c "SELECT datname, count(*) FROM pg_stat_activity WHERE datname='lawware_dev_synthetic_592521a650e0' GROUP BY datname"
```

Solo si el directorio es `_local/temporary/pg-local`, no hay conexiones y se decide eliminar ese laboratorio exacto, ejecutar los siguientes comandos por separado. El primero falla si todavía hay clientes; no continuar con los roles si falla. No añada `FORCE`:

```powershell
& $psql -X -h 127.0.0.1 -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE lawware_dev_synthetic_592521a650e0'
if ($LASTEXITCODE -ne 0) { throw 'No se eliminó la base; detener la limpieza' }
& $psql -X -h 127.0.0.1 -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'DROP ROLE lw_lab_auth_592521a650e0, lw_lab_app_592521a650e0, lw_lab_progress_592521a650e0'
```

Tras la limpieza, retirar del `.env` local del backend las tres variables de conexión de este laboratorio antes de volver a iniciarlo. No eliminar el clúster, otras bases, respaldos ni evidencias.

## 4. Privacidad y límites

La candidata no crea las vistas de privacidad. El endpoint experimental autenticado devuelve `503 PRIVACY_NOT_AVAILABLE` sin consultar esas vistas; la interfaz indica que la integración y el registro persistente están pendientes. El recorrido visual de `/demo` solo está disponible en desarrollo con `LAWWARE_DEMO=1` y no guarda decisiones, presentaciones o consentimiento.

El usuario informó login, callback, progreso y logout con Auth0 real; la inspección directa del token, las cookies de sesión y su renovación siguen pendientes. Las pruebas con emisor simulado no prueban al proveedor real. `app.user_id` es un GUC manipulable, no identidad fuerte; siguen pendientes la revisión independiente de seguridad, RLS, pool y revocación concurrente. Véanse el [dictamen de migración](../audit/DICTAMEN_MIGRACION_CANDIDATA.md) y el [informe Auth0](../audit/INFORME_AUTH0_DESARROLLO.md).
