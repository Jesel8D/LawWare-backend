import pg from 'pg';

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
}

export type RuntimeRole = 'lawware_auth_service' | 'lawware_app' | 'lawware_progress_service';

// A pool credential must never own the schema or inherit an owner role.
export async function assertRuntimeRole(client: pg.PoolClient, required: RuntimeRole): Promise<void> {
  const result = await client.query<{
    privileged: boolean; expected_role: boolean; owner_member: boolean; cross_role: boolean;
  }>(`SELECT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication) AS privileged,
      pg_has_role(current_user, $1, 'USAGE') AS expected_role,
      EXISTS (SELECT 1 FROM pg_catalog.pg_roles other WHERE other.rolname = ANY($2::text[])
              AND other.rolname <> $1 AND pg_has_role(current_user, other.oid, 'MEMBER')) AS cross_role,
      EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='lawware'
                AND pg_has_role(current_user, n.nspowner, 'MEMBER'))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='lawware' AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS owner_member
      FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`,
    [required, ['lawware_app', 'lawware_auth_service', 'lawware_editor_service', 'lawware_grading_service',
      'lawware_progress_service', 'lawware_privacy_service', 'lawware_admin_service', 'lawware_audit_writer',
      'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program', 'pg_read_server_files', 'pg_write_server_files']]);
  const role = result.rows[0];
  if (!role || role.privileged || !role.expected_role || role.owner_member || role.cross_role) {
    throw new Error('Identidad PostgreSQL no autorizada');
  }
}
