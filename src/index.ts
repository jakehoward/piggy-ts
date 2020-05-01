import initDebug from 'debug';
import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { from } from 'pg-copy-streams';
import { render } from './template-query';

const marv = require('marv/api/promise');
const driver = require('marv-pg-driver');
const pgFormat = require('pg-format');

const debug = initDebug('piggy-ts:pg-query');

export type TransactionLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

// Split out the interfaces so that they can be type unioned
// depending on which are available in a given context
interface WithConnection {
  withConnection: (fn: (conn: PgQuery) => Promise<any>) => Promise<any>;
}

interface CopyToTable {
  copyToTable: (
    schemaName: string,
    tableName: string,
    fromStream: NodeJS.ReadableStream,
    client?: PoolClient,
  ) => Promise<void>;
}

interface WithTransaction {
  withTransaction: (fn: (connection: PgQuery) => Promise<any>, level?: TransactionLevel) => Promise<QueryResult>;
}

interface PgConvenience {
  runDatabaseMigrations: () => Promise<any>;
  checkConnection: () => Promise<any>;
  render: (queryTemplate: string, params: { [key: string]: string | number | null }) => string;
  stop: () => Promise<any>;
  getConnectionPool: () => Pool;
}

export interface PgQuery {
  query: (queryText: string) => Promise<QueryResult>;
  namedQuery: (queryName: string, params?: { [key: string]: number | string | null }) => Promise<QueryResult>;
}

export type Pg = PgQuery & CopyToTable & WithTransaction & WithConnection & PgConvenience;
export type PgWithConnectionQuery = PgQuery & CopyToTable;

export type PgConfig = {
  postgres: PoolConfig;
  piggy: {
    sqlPath?: string;
    migrations?: {
      path: string;
      table?: string;
      connection?: PoolConfig;
    };
  };
};

export function initPg(config: PgConfig): Pg {
  const pool = new Pool(config.postgres);

  pool.on('error', (err) => {
    debug(`Error on PostgreSQL connection pool: ${err}`);
  });

  function checkConnection() {
    return pool.query('SELECT 1');
  }

  function query(queryText: string, client?: PoolClient): Promise<QueryResult> {
    debug(queryText);

    if (client) {
      return client.query(queryText);
    }
    return pool.query(queryText);
  }

  function namedQuery(
    queryName: string,
    params: { [key: string]: string | number | null } = {},
    client?: PoolClient,
  ): Promise<QueryResult> {
    if (!config.piggy.sqlPath) {
      const errorMessage =
        'Error running namedQuery(...), No SQL path provided: ' +
        "You can't run named queries without providing the path to the queries when you initialize the module.";
      debug(errorMessage);
      throw new Error(errorMessage);
    }

    const pathSegments = [config.piggy.sqlPath, queryName + '.sql'];
    const queryTemplate = fs.readFileSync(path.join(process.cwd(), ...pathSegments)).toString('UTF-8');
    const queryText = render(queryTemplate, params);
    return query(queryText, client);
  }

  async function copyToTable(
    schemaName: string,
    tableName: string,
    fromStream: NodeJS.ReadableStream,
    client?: PoolClient,
  ): Promise<void> {
    const conn = client || (await pool.connect());
    const copyQuery = pgFormat("COPY %I.%I FROM STDIN WITH NULL AS ''", schemaName, tableName);

    debug(copyQuery);
    const stream = conn.query(from(copyQuery));

    await new Promise((resolve, reject) => {
      fromStream.on('error', (err) => reject(err));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => {
        debug('DB stream is done.');
        resolve();
      });
      fromStream.on('end', () => debug('Source stream is done.'));
      fromStream.pipe(stream).on('error', (err) => reject(err));
    });

    if (!client) {
      // We created it, we release it
      await conn.release();
    }
  }

  async function withTransaction(
    fn: (conn: PgQuery) => Promise<any>,
    level: TransactionLevel = 'READ COMMITTED',
  ): Promise<QueryResult> {
    const client = await pool.connect();

    try {
      const beginQueryText = `BEGIN TRANSACTION ISOLATION LEVEL ${level}`;
      debug(beginQueryText);
      await client.query(beginQueryText);
      const res = await fn({
        namedQuery: (queryName: string, params?: { [key: string]: string | number | null }) =>
          namedQuery(queryName, params, client),
        query: (queryText: string) => query(queryText, client),
      });
      const commitText = 'COMMIT';
      debug(commitText);
      await client.query(commitText);
      return res;
    } catch (err) {
      const rbText = 'ROLLBACK';
      debug(rbText);
      await client.query(rbText);
      throw err;
    } finally {
      await client.release();
    }
  }

  async function withConnection(fn: (conn: PgWithConnectionQuery) => Promise<any>): Promise<any> {
    const client = await pool.connect();

    try {
      return await fn({
        namedQuery: (queryName: string, params?: { [key: string]: string | number | null }) =>
          namedQuery(queryName, params, client),
        query: (queryText: string) => query(queryText, client),
        copyToTable: (schemaName: string, tableName: string, fromStream: NodeJS.ReadableStream) =>
          copyToTable(schemaName, tableName, fromStream, client),
      });
    } finally {
      await client.release();
    }
  }

  async function runDatabaseMigrations() {
    if (!config.piggy.migrations) {
      throw new Error("Migration error: Can't run migrations without migrations configuration, please see README.");
    }
    const migrationsPath = config.piggy.migrations.path;

    if (!migrationsPath) {
      const errorMessage =
        'Error running databaseMigrations, no path provided: ' +
        "You can't run migrations without providing the path to the migrations files when you initialize the module.";
      debug(errorMessage);
      throw new Error();
    }

    const marvConfig = {
      ...config.piggy.migrations,
      table: config.piggy.migrations.table || 'migrations',
      connection: config.piggy.migrations.connection || config.postgres, // default to same connection details
      path: undefined, // wipe out the path just in case it gets used by marv
    };

    const directory = path.resolve(path.join(process.cwd(), migrationsPath));
    debug(`Running db migrations from ${directory}...`);
    const migrations = await marv.scan(directory);
    await marv.migrate(migrations, driver(marvConfig));
    debug(`Migrations completed.`);
  }

  async function stop() {
    await pool.end();
  }

  function getConnectionPool() {
    return pool;
  }

  return {
    checkConnection,
    copyToTable,
    getConnectionPool,
    namedQuery,
    query,
    runDatabaseMigrations,
    render,
    stop,
    withConnection,
    withTransaction,
  };
}
