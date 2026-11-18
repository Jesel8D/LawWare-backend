import type pg from 'pg';
import { requireCapability } from '../../authorization/application/capabilities.js';
import { HttpError } from '../../../shared/errors/http-error.js';
export async function currentNotice(client: pg.PoolClient, type: string) {
  await requireCapability(client, 'PRIVACY_NOTICE_READ');
  const result = await client.query('SELECT id_aviso,tipo_aviso,version,contenido,fecha_vigencia FROM lawware.v_avisos_vigentes WHERE tipo_aviso=$1', [type]);
  if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND');
  const notice = result.rows[0] as { id_aviso: string };
  const purposes = await client.query('SELECT id_finalidad,nombre,descripcion,es_necesaria_servicio,requiere_consentimiento,orden FROM lawware.v_finalidades_aviso_vigente WHERE id_aviso=$1 ORDER BY orden', [notice.id_aviso]);
  return { ...notice, finalidades: purposes.rows };
}
