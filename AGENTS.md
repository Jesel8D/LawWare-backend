# Instrucciones de backend

- Este repositorio prepara contratos; no afirmar que Auth0, PostgreSQL o Render están integrados sin pruebas reales.
- Mantener roles técnicos separados del migrador; validar identidad y autorización en backend, parametrizar SQL y usar contexto transaccional por conexión.
- Tratar `app.user_id` y otros GUC como contexto manipulable, no como identidad fuerte; probar reutilización, rollback y aislamiento del pool antes de aprobar la integración.
- Registrar operaciones fallidas fuera de la transacción revertida; excluir tokens, secretos y datos personales innecesarios.
- No usar producción ni Render en pruebas locales y no realizar push ni fusiones sin autorización explícita.
