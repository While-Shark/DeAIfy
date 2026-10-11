import { readFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { readConfig } from '../config.js';

// Non-destructive schema bootstrap for managed and existing MySQL.
// Only our trusted bundled SQL may contain multiple statements.
const config = readConfig();
const maxAttempts = 15;
let connection: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;

try {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      connection = await mysql.createConnection({
        ...config.mysql,
        multipleStatements: true,
        connectTimeout: 8000,
        charset: 'utf8mb4',
      });
      break;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      console.log(`Waiting for MySQL (${attempt}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  if (!connection) throw new Error('Cannot connect to MySQL');

  const schema = await readFile(new URL('../../sql/schema.sql', import.meta.url), 'utf8');
  await connection.query(schema);
  // v0.6.0 did not have an OTP attempt counter. Handle both fresh and old databases.
  const [columns] = await connection.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='email_codes' AND COLUMN_NAME='attempts'`,
  );
  if (columns.length === 0) {
    try {
      await connection.query(
        'ALTER TABLE email_codes ADD COLUMN attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0',
      );
      console.log('Applied registration OTP attempt-limit migration.');
    } catch (error) {
      // A parallel administrator may have completed this additive migration.
      if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  const [requiredTables] = await connection.query<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME IN ('users','wallets','email_codes','password_reset_codes','orders','plans','processing_jobs')`,
  );
  if (requiredTables.length !== 7) throw new Error('Database initialization is incomplete');
  console.log('Database schema ready (existing user data preserved).');
} catch (error) {
  console.error('Schema check failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
} finally {
  await connection?.end();
}
