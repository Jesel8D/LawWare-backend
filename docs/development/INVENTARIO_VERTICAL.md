# Inventario de cambios locales

M = modificado; ?? = sin seguimiento. No hay staging.

## LawWare-backend

Rama: `feat/backend-foundation-auth`; HEAD: `7a57a6c5b39700c8466771a051699c6581e98ed7`.

| Estado | Ruta |
|---|---|
| M | `.env.example` |
| M | `AGENTS.md` |
| M | `README.md` |
| M | `docs/CONTRATOS_INTEGRACION.md` |
| ?? | `.github/workflows/ci.yml` |
| ?? | `docs/api/CONTRATO_FULL_STACK_PROPUESTO.md` |
| ?? | `docs/api/ENDPOINTS.md` |
| ?? | `docs/architecture/ARQUITECTURA.md` |
| ?? | `docs/architecture/PROPUESTAS_CRUZADAS.md` |
| ?? | `docs/audit/CONSOLIDACION_FULL_STACK.md` |
| ?? | `docs/audit/INVENTARIO_CAMBIOS.md` |
| ?? | `docs/development/GUIA_DEMOSTRACION_FUNCIONAL.md` |
| ?? | `docs/development/INVENTARIO_VERTICAL.md` |
| ?? | `docs/development/PRUEBAS.md` |
| ?? | `docs/development/RESULTADOS_LOCALES.md` |
| ?? | `docs/development/RESULTADOS_VERTICAL.md` |
| ?? | `docs/proposals/02_vertical_academico_BORRADOR.sql` |
| ?? | `docs/security/SEGURIDAD.md` |
| ?? | `eslint.config.js` |
| ?? | `package-lock.json` |
| ?? | `package.json` |
| ?? | `scripts/init-local-lab.mjs` |
| ?? | `scripts/provision-local-user.mjs` |
| ?? | `scripts/smoke-server.mjs` |
| ?? | `scripts/test-local-db.mjs` |
| ?? | `scripts/test-local-provision.mjs` |
| ?? | `src/app.ts` |
| ?? | `src/config/env.ts` |
| ?? | `src/infrastructure/database/pool.ts` |
| ?? | `src/infrastructure/database/transaction.ts` |
| ?? | `src/infrastructure/shutdown.ts` |
| ?? | `src/middleware/authentication.ts` |
| ?? | `src/middleware/error-handler.ts` |
| ?? | `src/middleware/request-context.ts` |
| ?? | `src/modules/academic/README.md` |
| ?? | `src/modules/academic/infrastructure/academic-repository.ts` |
| ?? | `src/modules/audit/README.md` |
| ?? | `src/modules/auth/README.md` |
| ?? | `src/modules/auth/application/resolve-identity.ts` |
| ?? | `src/modules/auth/infrastructure/user-repository.ts` |
| ?? | `src/modules/authorization/README.md` |
| ?? | `src/modules/authorization/application/capabilities.ts` |
| ?? | `src/modules/dilemmas/README.md` |
| ?? | `src/modules/evaluations/README.md` |
| ?? | `src/modules/privacy/README.md` |
| ?? | `src/modules/privacy/infrastructure/notices.ts` |
| ?? | `src/modules/users/README.md` |
| ?? | `src/server.ts` |
| ?? | `src/shared/errors/http-error.ts` |
| ?? | `tests/fixtures/vertical.sql` |
| ?? | `tests/integration/database.test.ts` |
| ?? | `tests/integration/vertical.test.ts` |
| ?? | `tests/security/auth.test.ts` |
| ?? | `tests/unit/config.test.ts` |
| ?? | `tests/unit/shutdown.test.ts` |
| ?? | `tests/unit/transaction.test.ts` |
| ?? | `tsconfig.build.json` |
| ?? | `tsconfig.json` |
| ?? | `vitest.config.ts` |

## LawWare-frontend

Rama: `feat/frontend-foundation-onboarding`; HEAD: `552e21a485eabf65aec311a9e95e0031a865acf3`.

| Estado | Ruta |
|---|---|
| M | `.env.example` |
| M | `.gitignore` |
| M | `AGENTS.md` |
| M | `README.md` |
| M | `docs/FLUJO_PRIVACIDAD.md` |
| ?? | `docs/api/CONTRATOS.md` |
| ?? | `docs/api/CONTRATO_FULL_STACK_PROPUESTO.md` |
| ?? | `docs/architecture/ARQUITECTURA.md` |
| ?? | `docs/design/SISTEMA_VISUAL.md` |
| ?? | `docs/testing/PRUEBAS.md` |
| ?? | `eslint.config.mjs` |
| ?? | `next.config.ts` |
| ?? | `package-lock.json` |
| ?? | `package.json` |
| ?? | `playwright.config.ts` |
| ?? | `scripts/test-backend.mjs` |
| ?? | `scripts/test-production-guard.mjs` |
| ?? | `src/app/[section]/page.tsx` |
| ?? | `src/app/acceso/page.tsx` |
| ?? | `src/app/api/health/route.ts` |
| ?? | `src/app/api/identity/route.ts` |
| ?? | `src/app/api/vertical/bootstrap/route.ts` |
| ?? | `src/app/api/vertical/lessons/[id]/progress/route.ts` |
| ?? | `src/app/api/vertical/lessons/[id]/route.ts` |
| ?? | `src/app/api/vertical/modules/[id]/route.ts` |
| ?? | `src/app/api/vertical/notice/route.ts` |
| ?? | `src/app/aprendizaje/[id]/page.tsx` |
| ?? | `src/app/aprendizaje/leccion/[id]/page.tsx` |
| ?? | `src/app/aprendizaje/page.tsx` |
| ?? | `src/app/cuenta/aviso/page.tsx` |
| ?? | `src/app/cuenta/page.tsx` |
| ?? | `src/app/demo/[scenario]/[section]/page.tsx` |
| ?? | `src/app/demo/registro/[step]/page.tsx` |
| ?? | `src/app/error.tsx` |
| ?? | `src/app/globals.css` |
| ?? | `src/app/icon.svg` |
| ?? | `src/app/layout.tsx` |
| ?? | `src/app/loading.tsx` |
| ?? | `src/app/not-found.tsx` |
| ?? | `src/app/page.tsx` |
| ?? | `src/app/privacidad/aviso/page.tsx` |
| ?? | `src/app/registro/page.tsx` |
| ?? | `src/components/feedback/demo-banner.tsx` |
| ?? | `src/components/layout/site-header.tsx` |
| ?? | `src/features/academic/real-workspace.tsx` |
| ?? | `src/features/dashboard/demo-workspace.tsx` |
| ?? | `src/features/privacy/real-notice.tsx` |
| ?? | `src/features/privacy/registration-flow.tsx` |
| ?? | `src/lib/api/backend.ts` |
| ?? | `src/lib/api/vertical.ts` |
| ?? | `src/lib/auth/auth0.ts` |
| ?? | `src/lib/demo.ts` |
| ?? | `src/proxy.ts` |
| ?? | `tests/e2e/experience.spec.ts` |
| ?? | `tests/setup.ts` |
| ?? | `tests/unit/auth-config.test.ts` |
| ?? | `tests/unit/backend.test.ts` |
| ?? | `tests/unit/demo.test.ts` |
| ?? | `tests/unit/identity-route.test.ts` |
| ?? | `tests/unit/registration.test.tsx` |
| ?? | `tests/unit/vertical-security.test.ts` |
| ?? | `tsconfig.json` |
| ?? | `vitest.config.ts` |
