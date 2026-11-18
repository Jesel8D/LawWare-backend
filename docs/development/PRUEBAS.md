# Pruebas y entorno local

En PowerShell, `npm.cmd` evita la política local que bloquea `npm.ps1`. Con Node 24 LTS:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:smoke
```

`npm test` ejecuta unitarias y HTTP con un emisor/JWKS simulado; los casos PostgreSQL aparecen como omitidos si no se invoca la preparación local. `test:smoke` requiere la compilación previa y arranca un proceso local sin credenciales, comprueba `/health` y 401 de la ruta protegida. El cierre ordenado del listener y pools tiene prueba unitaria independiente. El workflow de GitHub prepara estas mismas comprobaciones sin secretos; aún no se ha ejecutado allí y no incluye PostgreSQL.

Para la integración real con **PostgreSQL local**, conserve `LawWare-database/` como repositorio hermano y el clúster aislado en `../_local/temporary/pg-local`. El clúster de pruebas usa `trust`: mientras esté activo, cualquier usuario local puede suplantar un rol. Solo usar datos ficticios y un equipo de desarrollo confiable. Desde la raíz compartida `LawWare/`:

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
& "$pgBin\pg_ctl.exe" -D '_local\temporary\pg-local' -l '_local\temporary\postgres.log' -o '-h 127.0.0.1 -p 55439' start
Set-Location LawWare-backend
npm.cmd run test:db
Set-Location ..
& "$pgBin\pg_ctl.exe" -D '_local\temporary\pg-local' stop -m fast
```

El script comprueba `data_directory` antes de crear recursos, aplica los cuatro SQL del repositorio de base con `psql -X -v ON_ERROR_STOP=1`, crea una base y logins sintéticos con nombres aleatorios, ejecuta Vitest y elimina la base y logins de prueba. Conserva los roles globales definidos por el baseline y, si faltaba, `lawware_migrador` como rol del clúster de laboratorio. `PSQL` puede indicar otra ruta local al ejecutable. No usar este script con una base que contenga información real.

Los casos comprueban resolución por `auth0_id`, dos peticiones HTTP simultáneas con emisor simulado y PostgreSQL real, RLS, reuso de la misma conexión, limpieza del contexto incluso tras contaminación, rollback, prohibición de acceso ajeno y rechazo de owner o roles mezclados. No prueban un pool con todas las intercalaciones posibles ni la integración con Auth0 real.
