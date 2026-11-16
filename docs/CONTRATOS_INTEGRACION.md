# Contratos para la futura integración

Estos contratos son requisitos propuestos; ninguno está implementado ni validado mediante una aplicación real.

1. **Identidad:** verificar firma, emisor, audiencia y vigencia de los tokens Auth0 conforme a la configuración acordada. Resolver el `sub` verificado al UUID interno; no aceptar un UUID de titular del cuerpo como identidad.
2. **Pool y RLS:** usar logins técnicos separados de propietario/migrador; adquirir una conexión por transacción, establecer con parámetros `set_config(..., true)` únicamente tras verificar la identidad, confirmar o revertir y liberar la conexión. Probar con identidades A y B y una conexión reutilizada, incluyendo error y rollback. `app.user_id` puede falsificarse con SQL arbitrario; los GUC no sustituyen autenticación ni defensas contra inyección.
3. **Prerregistro:** generar token aleatorio en backend, guardar solo el hash, conservar el secreto únicamente en un canal de sesión apropiado y llamar a la función de vinculación con identidad validada. No registrar el token. El plazo de 24 horas sigue siendo provisional.
4. **Consentimiento:** registrar presentación, decisión y elecciones en una transacción; sellar solo si es completo. Una revocación debe señalar la decisión original y las finalidades previamente autorizadas.
5. **Auditoría:** generar actor, servicio y correlación desde contexto confiable. La auditoría SQL confirma cambios en la misma transacción; capturar fallos de autorización, operaciones revertidas y lecturas sensibles en un logger externo independiente. Excluir secretos y datos personales innecesarios; la lista de claves de la BD no garantiza valores libres de secretos.
6. **Pruebas previas a aprobación:** comprobar Auth0 real, concurrencia, reutilización del pool y ausencia de fuga de contexto; revisar logs, acceso, backups y configuración de infraestructura. No se han ejecutado todavía.
