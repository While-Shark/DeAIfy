import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import type { Config } from './config.js';

export type Row = RowDataPacket;
export type Connection = PoolConnection;
export type Database = Pool;
export function openDb(config: Config): Database {
  return mysql.createPool({
    ...config.mysql, waitForConnections: true, connectionLimit: 10,
    timezone: 'Z', decimalNumbers: false, supportBigNumbers: true,
    namedPlaceholders: false, multipleStatements: false,
  });
}
export async function tx<T>(db: Database, callback: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}
export async function rows<T extends Row = Row>(conn: Database | Connection, sql: string, values: unknown[] = []): Promise<T[]> {
  const [result] = await conn.execute<T[]>(sql, values);
  return result;
}
export async function execute(conn: Database | Connection, sql: string, values: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await conn.execute<ResultSetHeader>(sql, values);
  return result;
}
