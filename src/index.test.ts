import { initPg, Pg, PgConfig } from '.';
import * as stream from 'stream';

const migrationsTableName = 'test_migrations';

const config: PgConfig = {
  postgres: {
    user: 'piggy',
    host: 'localhost',
    port: 5432,
    database: 'piggy_db',
    password: 'oink',
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  },
  piggy: {
    sqlPath: 'src/sql',
    migrations: {
      path: 'src/migrations',
      table: migrationsTableName,
    },
  },
};

describe('Piggy', () => {
  const tableName = 'example_table';
  let pg: Pg | null = null;

  beforeAll(() => {
    pg = initPg(config);
  });

  afterAll(async () => {
    if (pg) {
      await pg.stop();
      pg = null;
    }
  });

  async function withCleanExampleTable(fn: (pg: Pg) => Promise<any>): Promise<any> {
    if (!pg) {
      throw new Error('Error: pg needs to initialised...');
    }

    await pg.query(`DROP TABLE IF EXISTS ${tableName}`);
    await pg.query(`CREATE TABLE ${tableName} (foo VARCHAR, bar INTEGER)`);

    const entries = [
      ['oink', 100],
      ['snort', -10],
    ];
    for (const entry of entries) {
      await pg.query(`INSERT INTO ${tableName} (foo, bar) VALUES ('${entry[0]}', ${entry[1]})`);
    }

    return fn(pg);
  }

  it('can run a simple query', async () =>
    withCleanExampleTable(async (pg) => {
      const { rows } = await pg.query('SELECT foo, bar FROM example_table LIMIT 2');

      expect(rows).toStrictEqual([
        { foo: 'oink', bar: 100 },
        { foo: 'snort', bar: -10 },
      ]);
    }));

  it('can run a simple namedQuery', async () =>
    withCleanExampleTable(async (pg) => {
      const { rows } = await pg.namedQuery('test-query', { colName: 'bar', tableName, fooVal: 'oink' });
      expect(rows).toStrictEqual([{ bar: 100 }]);
    }));

  it('executes queries inside a transaction', async () =>
    withCleanExampleTable(async (pg) => {
      await pg.withTransaction(async (conn) => {
        await conn.query(`INSERT INTO ${tableName} (foo, bar) VALUES ('trough', 1000)`);
        await conn.namedQuery('test-query', { colName: 'bar', tableName, fooVal: 'trough' });
        // Read your own writes
        const { rows } = await conn.query(`SELECT bar FROM ${tableName} WHERE foo = 'trough'`);
        expect(rows).toStrictEqual([{ bar: 1000 }]);
      });

      // Check transaction has committed
      const { rows } = await pg.query(`SELECT bar FROM ${tableName} WHERE foo = 'trough'`);
      expect(rows).toStrictEqual([{ bar: 1000 }]);
    }));

  it('the transaction rolls back if there is an error', () =>
    withCleanExampleTable(async (pg) => {
      expect(async () => {
        await pg.withTransaction(async (conn) => {
          await conn.query(`INSERT INTO ${tableName} (foo, bar) VALUES ('trough', 1000)`);
          await conn.namedQuery('test-query', { colName: 'bar', tableName, fooVal: 'trough' });
          // Read your own writes here...
          const { rows } = await conn.query(`SELECT bar FROM ${tableName} WHERE foo = 'trough'`);
          expect(rows).toStrictEqual([{ bar: 1000 }]);

          // The important line: trigger a rollback
          throw new Error('Get out of here, piggy!');
        });
        // Beautiful async throw assertion: https://github.com/facebook/jest/issues/1700
      }).rejects.toEqual(new Error('Get out of here, piggy!'));

      // But here the rollback should prevent us seeing the new value
      const { rows } = await pg.query(`SELECT bar FROM ${tableName} WHERE foo = 'trough'`);
      expect(rows).toStrictEqual([]);
    }));

  it('provides the user with a connection from the pool', () =>
    withCleanExampleTable(async (pg) => {
      return pg.withConnection(async (conn) => {
        const { rows } = await conn.query('SELECT foo, bar FROM example_table LIMIT 2');

        expect(rows).toStrictEqual([
          { foo: 'oink', bar: 100 },
          { foo: 'snort', bar: -10 },
        ]);

        const { rows: nqRows } = await pg.namedQuery('test-query', { colName: 'bar', tableName, fooVal: 'snort' });
        expect(nqRows).toStrictEqual([{ bar: -10 }]);
      });
    }));

  it('can stream data into postgres', async () => {
    if (!pg) {
      throw new Error('Error: pg not initialised');
    }

    const copyTableName = 'copy_to_me';
    await pg.query(`DROP TABLE IF EXISTS ${copyTableName}`);
    await pg.query(`CREATE TABLE ${copyTableName} (name TEXT, nickname TEXT)`);

    const tsv = [
      ['James', 'Oinky'],
      ['Harold', 'Piggy'],
      ['Ben', 'Snout Face'],
      ['_deleted', '']
    ]
      .map((ns) => ns.join('\t'))
      .join('\n');

    const dataStream = new stream.PassThrough();
    dataStream.end(tsv);
    await pg.copyToTable('public', copyTableName, dataStream);

    const { rows } = await pg.query(`SELECT * FROM ${copyTableName}`);
    expect(rows).toStrictEqual([
      { name: 'James', nickname: 'Oinky' },
      { name: 'Harold', nickname: 'Piggy' },
      { name: 'Ben', nickname: 'Snout Face' },
      { name: '_deleted', nickname: null },
    ]);
  });

  it('runs migrations', async () => {
    if (!pg) {
      throw new Error('Error: pg not initialised');
    }

    // Attempt to clean up any previous runs (good enough, definitely not infallible)
    await pg.query(`DROP TABLE IF EXISTS ${migrationsTableName}`);
    await pg.query(`DROP TABLE IF EXISTS ${migrationsTableName}`);
    await pg.query(`DROP TABLE IF EXISTS table_a`);
    await pg.query(`DROP TABLE IF EXISTS table_b`);
    const { rows } = await pg.query(`SELECT EXISTS (
                                       SELECT FROM information_schema.tables
                                       WHERE  table_schema = 'public'
                                       AND    table_name   IN ('table_a', 'table_b'))`);
    expect(rows).toStrictEqual([{ exists: false }]);

    // Run the migrations and check the outcome;
    await pg.runDatabaseMigrations();
    const { rows: afterMigrationRows } = await pg.query('SELECT * FROM table_a UNION ALL SELECT * FROM table_b');
    expect(afterMigrationRows).toStrictEqual([{ id: 1 }, { id: 2 }]);
  });
});
