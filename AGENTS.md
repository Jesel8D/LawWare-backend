# Instrucciones de backend

- Este repositorio prepara contratos; no afirmar que Auth0, PostgreSQL o Render están integrados sin pruebas reales.
- Mantener roles técnicos separados del migrador; validar identidad y autorización en backend, parametrizar SQL y usar contexto transaccional por conexión.
- Tratar `app.user_id` y otros GUC como contexto manipulable, no como identidad fuerte; probar reutilización, rollback y aislamiento del pool antes de aprobar la integración.
- Registrar operaciones fallidas fuera de la transacción revertida; excluir tokens, secretos y datos personales innecesarios.
- No usar producción ni Render en pruebas locales y no realizar push ni fusiones sin autorización explícita.
- Mantener el monolito modular: transporte HTTP, casos de uso, dominio y adaptadores solo cuando aporten una responsabilidad real. No añadir módulos ficticios o dependencias circulares.
- El SDK oficial valida access tokens; no sustituirlo por criptografía artesanal ni aceptar identidad de body, query o headers. No asociar cuentas por correo ni activar usuarios automáticamente.
- Mantener separados los pools de Auth y aplicación; usar `withTransaction` con una sola conexión y contexto por transacción. Nunca exponer SQL arbitrario ni usar el owner/migrador para peticiones.
- No cambiar el esquema v2.1 para adaptar el backend; registrar propuestas en documentación del backend. No alterar los otros tres repositorios en esta fase.
- El usuario informó un recorrido funcional con Auth0 real y PostgreSQL confirmó el avance; distinguir esa evidencia de la validación directa del token, de pruebas de aislamiento completo del pool y de cualquier aprobación de producción.
