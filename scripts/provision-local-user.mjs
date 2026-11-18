import { createInterface } from 'node:readline/promises';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import process from 'node:process';
import console from 'node:console';

// Herramienta administrativa explícita; nunca forma parte del servidor HTTP.
if (process.env.NODE_ENV !== 'development') throw new Error('Solo disponible con NODE_ENV=development');
const database = process.env.LAWWARE_DEV_DATABASE ?? '';
if (!/^lawware_dev_synthetic_[a-f0-9]{12}$/.test(database)) throw new Error('Base local sintética no permitida');
const client = new pg.Client({ host:'127.0.0.1', port:55439, user:'lawware_migrador', database });
const probe = new pg.Client({ host:'127.0.0.1', port:55439, user:'postgres', database:'postgres' });
const rl = createInterface({ input:process.stdin, output:process.stderr });
try {
  await probe.connect();
  const location = (await probe.query('SHOW data_directory')).rows[0]?.data_directory;
  if (!location || await realpath(location) !== await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster de laboratorio inesperado');
  await probe.end();
  await client.connect();
  const userId = (await rl.question('UUID del usuario sintético existente: ')).trim();
  const subject = (await rl.question('Sub verificado de la cuenta Auth0 de desarrollo: ')).trim();
  const confirmation = (await rl.question('Escriba VINCULAR para confirmar: ')).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || !subject || subject.length > 255 || Array.from(subject).some(c => c.charCodeAt(0)<32 || c.charCodeAt(0)===127) || confirmation !== 'VINCULAR') throw new Error('Entrada o confirmación inválida');
  const result = await client.query(`UPDATE lawware.usuario SET auth0_id=$1
    WHERE id_usuario=$2 AND estado='ACTIVO' AND correo LIKE '%@example.invalid'
      AND (auth0_id IS NULL OR auth0_id LIKE 'auth0|fixture-%') RETURNING id_usuario`, [subject,userId]);
  if (result.rowCount !== 1) throw new Error('Usuario sintético no elegible o ya vinculado');
  console.log('Vinculación local completada. No se ha cambiado el estado ni asignado roles.');
} catch { console.error('No se pudo completar la vinculación local; no se muestran identificadores ni detalles.'); process.exitCode=1; }
finally { rl.close(); await probe.end().catch(()=>{}); await client.end().catch(()=>{}); }
