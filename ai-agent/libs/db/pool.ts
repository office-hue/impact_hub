import { Pool } from 'pg';
import { logger } from '@libs/logger';

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (pool) {
    return pool;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.warn('DATABASE_URL missing – task repository will use in-memory store');
    return null;
  }
  pool = new Pool({ connectionString });
  pool.on('error', (error: unknown) => {
    logger.error({ error }, 'PostgreSQL pool error');
  });
  return pool;
}
