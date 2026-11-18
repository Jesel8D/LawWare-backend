# Propuesta: aislamiento de dos estudiantes en el laboratorio

**Autorizada por el usuario; ambas asignaciones aplicadas en orden.** Se creó la cuenta sintética B con solo lectura y el operador vinculó la segunda cuenta Auth0 sin compartir su sub. Tras la comprobación de 403 se asignó el rol de avance. Se comprobó que las dos cuentas resuelven a identidades internas activas distintas. No se usan cuentas por correo ni se registran identificadores Auth0 en logs o documentación. El laboratorio existente y su avance deben conservarse.

La prueba local de la aplicación denegó la escritura de B con 403 y rollback. Una lectura simultánea con dos conexiones comprobó que A recupera `COMPLETADA`, B no ve avances y tiene solo lectura. El script reproducible `tests/compatibilidad/aislamiento-lectura-dos-usuarios.mjs` realizó ambas comprobaciones sin cambios persistidos, con contextos de base sintéticos; ya no debe ejecutarse en el estado actual porque B recibió avance. El usuario informó un POST 403 desde la sesión real de B y un evento `security.denied` 403 en backend. PostgreSQL confirmó que B no tenía avance antes de asignar el rol.

## Preparación revisable

La cuenta A del laboratorio ya tiene lectura y avance. Se propone crear una cuenta sintética B activa y dos roles de prueba sin privilegios administrativos: el primero concede solo `ACADEMIC_READ`; el segundo concede `ACADEMIC_PROGRESS` y se asignaría después de comprobar el rechazo de escritura. No se crean códigos de permiso nuevos. El módulo y la lección actuales se mantienen.

La siguiente primera fase ya se ejecutó en el laboratorio indicado; se conserva para trazabilidad y no debe repetirse. La transacción aborta si se apunta a otra base:

```sql
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'lawware_dev_synthetic_592521a650e0' THEN
    RAISE EXCEPTION 'Base de laboratorio incorrecta';
  END IF;
END $$;
INSERT INTO lawware.usuario(id_usuario,auth0_id,nombre,correo,estado) VALUES
 ('90000000-0000-4000-8000-000000000002','auth0|fixture-b','Usuario B ficticio','b@example.invalid','ACTIVO');
INSERT INTO lawware.rol(id_rol,codigo,nombre,descripcion,estado) VALUES
 ('91000000-0000-4000-8000-000000000002','LECTOR_B_PRUEBA','Lector B','Laboratorio sintético','ACTIVO'),
 ('91000000-0000-4000-8000-000000000003','AVANCE_B_PRUEBA','Avance B','Laboratorio sintético','ACTIVO');
INSERT INTO lawware.rol_permiso(id_rol,id_permiso)
 SELECT '91000000-0000-4000-8000-000000000002',id_permiso FROM lawware.permiso WHERE codigo='ACADEMIC_READ';
INSERT INTO lawware.rol_permiso(id_rol,id_permiso)
 SELECT '91000000-0000-4000-8000-000000000003',id_permiso FROM lawware.permiso WHERE codigo='ACADEMIC_PROGRESS';
DO $$ BEGIN
  IF (SELECT count(*) FROM lawware.rol_permiso WHERE id_rol IN
      ('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000003')) <> 2 THEN
    RAISE EXCEPTION 'Permisos académicos de laboratorio incompletos';
  END IF;
END $$;
INSERT INTO lawware.usuario_rol(id_usuario,id_rol) VALUES
 ('90000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002');
COMMIT;
```

El operador usará `scripts/provision-local-user.mjs` para vincular B con su sub verificado y la confirmación interactiva `VINCULAR`. No se debe pegar el sub en el chat. El script solo admite la base local sintética, no activa usuarios ni asigna roles. El sub debe provenir del panel Auth0 y verificarse por el operador; la herramienta no lo autentica.

## Prueba de lectura y rechazo

1. En una sesión separada del navegador, iniciar sesión como B. Verificar lectura del módulo y la lección y que no vea el avance completado de A. La UI no ofrece acciones de progreso a B; además debe verificarse el 403 del POST con una prueba local de integración que utilice la sesión verificada de B, sin revelar tokens. No usar una identidad suministrada por el cliente para determinar el actor.
2. Verificar que el avance completado de A sigue intacto. No interpretar un botón oculto como prueba suficiente del permiso de escritura.

Para la comprobación del POST, el operador puede ejecutar el siguiente código en la consola del navegador **de B**, en el mismo origen de LawWare; solo imprime el estado HTTP. Esperado: 403. No se introduce ni se imprime ningún token o identificador Auth0. El UUID corresponde a la lección sintética del laboratorio:

```javascript
fetch('/api/vertical/lessons/95000000-0000-4000-8000-000000000001/progress', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ estado: 'COMPLETADA' })
}).then(response => console.log('Estado HTTP:', response.status));
```

## Segunda fase: escritura e independencia

Esta fase se ejecutó tras la autorización y el 403 con la sesión real de B; se conserva como registro y no debe repetirse:

```sql
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'lawware_dev_synthetic_592521a650e0' THEN
    RAISE EXCEPTION 'Base de laboratorio incorrecta';
  END IF;
END $$;
INSERT INTO lawware.usuario_rol(id_usuario,id_rol) VALUES
 ('90000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000003');
COMMIT;
```

En sesión B, iniciar la misma lección y comprobar que B ve `EN_PROGRESO` mientras A sigue viendo `COMPLETADA`; completar B y confirmar ambas filas mediante lectura administrativa sin publicar datos de identidad. Repetir lecturas/escrituras autorizadas con varias conexiones del pool en un entorno desechable controlado. No modificar ni borrar el avance de A para obtener una prueba más cómoda. Logout de ambas sesiones y verificación de 401 completan la prueba.

La prueba de [lecturas concurrentes de un usuario](../../tests/compatibilidad/concurrencia-lectura-local.mjs) ya utiliza varias conexiones y no crea cuentas ni cambia filas; **no prueba aislamiento de dos usuarios ni el caso de escritura concurrente**. No se realizará una auditoría ofensiva como parte de esta tarea.
