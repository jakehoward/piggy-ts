# 🐷 piggy-ts - pre-release alpha

Convenience wrapper around the venerable node-postgres and marv, making it easier to use Postgres effectively.

## What is it and why would I use it?

When you're creating an application and want to use postgres, there are a sea of libraries and options out there. Postgres is a fantastic database, but it's not always easy to get up and running. Finding and using lower level libraries that are good at what they do is fiddly and requires a lot of research, using an ORM leads you away from the powerful SQL interface that allows you to get the most out of postgres and make your data a first class citizen in your application.

Piggy isn't so much a library as a "prebuilt setup" that picks some libraries and offers an opinion on how they could be used.

Under the hood, these libraries do the heavy lifting:
- [node-postgres](https://github.com/brianc/node-postgres)
- [marv](https://github.com/guidesmiths/marv)
- [pg-copy-streams](https://github.com/brianc/node-pg-copy-streams)
- [pg-format](https://github.com/datalanche/node-pg-format)

The aim of Piggy is to provide a simple, useful tool for people who want to interact with Postgres by using raw SQL.

GitHub issues and pull requests are welcome. You're free to fork it, copy ideas from it and repackage it as your own without permission.

## Quickstart

```bash
npm install --save piggy-ts
```

Start a postgres docker container:
```bash
docker run -d -p 54329:5432 \
    --name piggy-postgres \
    -e POSTGRES_PASSWORD=oink \
    -e POSTGRES_USER=piggy \
    -e POSTGRES_DB=piggy_db \
    postgres:latest
```

### Typescript
Create an instance and run a query:
```typescript
import { initPg, Pg, PgConfig } from 'piggy-ts';

const config: PgConfig = {
  postgres: {
    user: 'piggy',
    host: 'localhost',
    port: 54329,
    database: 'piggy_db',
    password: 'oink',
  },
  piggy: {},
};

const pg: Pg = initPg(config);

async function run() {
  // Make a table
  await pg.query('DROP TABLE IF EXISTS farms');
  await pg.query(`CREATE TABLE farms (name TEXT, food_quality_score INTEGER)`);

  // Pop some data in it
  await pg.query(`INSERT INTO farms (name, food_quality_score) VALUES ('Trotters Farm', 10)`);
  await pg.query(`INSERT INTO farms (name, food_quality_score) VALUES ('Sty', 7)`);
  await pg.query(`INSERT INTO farms (name, food_quality_score) VALUES ('Value Meats', 2)`);

  // Get it back out again
  const { rows } = await pg.query('SELECT name FROM farms WHERE food_quality_score > 5');

  // ...and take a look at it
  console.log(JSON.stringify(rows, null, 2));

  // Don't forget to clean up
  return pg.stop();
}

run();
```

### Node

```javascript 1.6
const { initPg } = require('piggy-ts');

const config = {
  postgres: {
    user: 'piggy',
    host: 'localhost',
    port: 54329,
    database: 'piggy_db',
    password: 'oink',
  },
  piggy: {},
};

const pg = initPg(config);

async function run() {
  // Make a table
  await pg.query('DROP TABLE IF EXISTS farms');
  await pg.query(`CREATE TABLE farms (name TEXT, food_quality_score INTEGER)`);

  // Pop some data in it
  await pg.query(`INSERT INTO farms (name, food_quality_score) VALUES ('Trotters Farm', 10)`);
  await pg.query(`INSERT INTO farms (name, food_quality_score) VALUES ('Sty', 7)`);
  await pg.query(`INSERT INTO farms (name, food_quality_score) VALUES ('Value Meats', 2)`);

  // Get it back out again
  const { rows } = await pg.query('SELECT name FROM farms WHERE food_quality_score > 5');

  // ...and take a look at it
  console.log(JSON.stringify(rows, null, 2));

  // Don't forget to clean up
  return pg.stop();
}

run();

```

## Debug

You can see what's going on by setting the `DEBUG` environment variable. For example when running the tests:

```bash
DEBUG='piggy-ts:pg-query' npm test
DEBUG='piggy-ts:render' npm test
DEBUG='*piggy-ts*' npm test
DEBUG='*marv*' npm test
```

This can be exceptionally useful for debugging.

## Documentation

All snippets assume a prelude of the following if none is provided:

```typescript
import { initPg, Pg, PgConfig } from 'piggy-ts';

const config: PgConfig = {
  postgres: {
    user: 'piggy',
    host: 'localhost',
    port: 54329,
    database: 'piggy_db',
    password: 'oink',
  },
  piggy: {},
};

const pg: Pg = initPg(config);
```

They also assume they're running in the context of an async function (so you can use the `await` keyword).

At the time of writing not all these snippets have been run, please raise an issue if you encounter a mistake.

The source code is a few hundred lines, reading it and understanding everything Piggy can do might be more efficient than reading these docs. The tests are pretty close to a runnable version of these snippets. If you prefer short, clear examples, here you go:

### config

The config is passed to the underlying libraries [marv](https://github.com/guidesmiths/marv) and [node-postgres](https://github.com/brianc/node-postgres)

```typescript
import { PgConfig } from 'piggy-ts';

const config: PgConfig = {
  postgres: {                      // connection details passed through to node-postgres
    user: 'piggy',
    host: 'localhost',
    port: 5432,
    database: 'piggy_db',
    password: 'oink',
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  },
  piggy: {                         // piggy config
    sqlPath: 'src/sql',
    migrations: {                  // dictates config that's mainly passed to marv
      path: 'src/migrations',
      table: 'migrations',
    },
  },
};
```

### query

Run a query:

```typescript
const { rows } = await pg.query('SELECT 1 AS result');
// => [{ result: 1 }]
```

### runDatabaseMigrations

Piggy wraps [marv](https://github.com/guidesmiths/marv), an excellent migration library.

You tell Piggy where the migration files are and it does the rest when you call `await pg.runDatabaseMigrations();`

Config:
- Path to migration files, optional in the config, but migrations won't work without it.
- `[optional]` Name for the migration table, (defaults to 'migrations' at the time of writing).
- `[optional]` Separate connection details for the migration runner to use (perhaps it has more powerful credentials than the application). If not provided, the standard connection config is used.

List of sql files that will be run in lexical order in `src/migrations`:
```bash
src/migrations
├── 0001.create-table-a.sql
└── 0002.create-table-b.sql
```

```typescript
import { initPg, Pg, PgConfig } from 'piggy-ts';

const config: PgConfig = {
  postgres: {
    user: 'piggy',
    host: 'localhost',
    port: 54329,
    database: 'piggy_db',
    password: 'oink',
  },
  piggy: {
    sqlPath: 'src/sql',
    migrations: {
      path: 'src/migrations',   // needed to find the migrations
      table: 'migration_table', // optional, marv uses a default if not provided
      connection: {             // optional, uses details in "postgres" if not provided
        user: 'super_pig',
        host: 'localhost',
        port: 54329,
        database: 'piggy_db',
        password: 'snort',
      },
    },
  },
};

const pg: Pg = initPg(config);

await pg.runDatabaseMigrations();
```

### stop

Closes the connection pool. Sometimes your app/script/tests won't exit unless you do this.

```typescript
await pg.stop();
```

### withTransaction

If you're using an RDBMS there's a high chance you'll want to do something inside a transaction:

```typescript
await pg.withTransaction(async (conn) => {
  const { rows } = await conn.query(`SELECT values FROM table`);
  const updatedValues = doSomethingWithValues(rows);

  // Remember to return or await the promise.
  return conn.query('... something with updatedValues ...');
});
```

As long as you keep your `await`'s in order and return the promise, if an error's thrown, the transaction will be rolled back. If everything succeeds, it's committed.

### withConnection

For some things, you have to do multiple things with a single connection. An example is using an advisory lock. Piggy can provide you with a connection from the pool:

```typescript
await pg.withConnection(async (conn) => {
  const { rows } = await conn.query(`SELECT pg_try_advisory_lock(14)`);

  try {

    const gotLock = rows[0].pg_try_advisory_lock;
    if (!gotLock) {
      // ...
    }

    // ...
  } catch (err) {
    // ...
  } finally {
    await conn.query('SELECT pg_advisory_unlock(14)')
  }
});
```

### namedQuery

Named queries allow you to put your sql in a file and pass named parameters as javascript objects. Named query uses `render(...)`, see below.

Assuming you have a file in `sql/test-query.sql`:
```sql
SELECT %I:colName FROM %I:tableName WHERE foo = %L:fooVal;
```

```typescript
import { initPg, Pg, PgConfig } from 'piggy-ts';

const config: PgConfig = {
  postgres: {
    user: 'piggy',
    host: 'localhost',
    port: 54329,
    database: 'piggy_db',
    password: 'oink',
  },
  piggy: {
    // This is how piggy can find the file
    sqlPath: 'src/sql',
  },
};

const pg: Pg = initPg(config);

await pg.query(`DROP TABLE IF EXISTS example_table`);
await pg.query(`CREATE TABLE example_table (foo VARCHAR, bar INTEGER)`);

await pg.query(`INSERT INTO example_table (foo, bar) VALUES ('baz', 100)`);
await pg.query(`INSERT INTO example_table (foo, bar) VALUES ('baz...2?', 55)`);

// piggy looks for the file at 'src/sql/test-query.sql'.
const { rows } = await pg.namedQuery('test-query', { colName: 'bar', tableName: 'example_table', fooVal: 'baz' });
// => [{ bar: 100 }]
```

#### render

The parameters are escaped both for correctness and to prevent sql injection. [node-pg-format](https://github.com/datalanche/node-pg-format) is used to do the escaping under the hood. Here's a quick rundown of the syntax:

- `%L` a value (for example: `WHERE name = %L`)
- `%I` an identifier (for example `WHERE %I = 'hello'`)
- `%s` a literal. Warning: no sql injection protection. (for example: `INSERT INTO table (col, col2) VALUES ( %s )`)

On top of this, Piggy allows you to name a variable, so you can pass a javascript object of values and have Piggy put them in the right place:

```typescript
pg.render('SELECT %I:colName FROM %I:tableName WHERE foo = %L:fooVal;', { colName: 'bar', tableName: 'example_table', fooVal: 'baz' });
// => SELECT "bar" FROM "example_table" WHERE foo = 'baz';
```

One gotcha at the time of writing is that it's unlikely formatting a query that contains text very similar to a template, but isn't supposed to be templated, will work properly. If you need to do this (unlikely), format and escape it yourself.
Example: rendering `SELECT example FROM formatting_examples WHERE example = '%I:varName'` probably won't work properly.
It will be absolutely fine if the values you're subbing in have these characters, so you only have to be careful when writing the query.

### copyToTable

A common requirement is to dump a large amount of data into postgres. For various reasons, doing this with insert statements can be slow and fiddly. Copy allows you to stream data straight into a table.

We can make a NodeJS readable stream and pass it to Piggy's convenience wrapper around node postgres' copy.

At the moment, Piggy's support for copy is very limited:
- It can only copy tsv files (fields separated by tabs, rows separated by newlines)
- Null values are represented by the empty string

```typescript
import stream from 'stream';

await pg.query(`DROP TABLE IF EXISTS nicknames`);
await pg.query(`CREATE TABLE nicknames (name TEXT, nickname TEXT)`);

// Create a tsv string
const tsv = [['James', 'Oinky'],
             ['Harold', 'Piggy'],
             ['_deleted', ''],
             ['Ben', 'Snout Face']].map((ns) => ns.join('\t')).join('\n');

// Create a readable stream of the data
const dataStream = new stream.PassThrough();
dataStream.end(tsv);

// Run the copy command
const schema = 'public';
await pg.copyToTable(schema, 'nicknames', dataStream);

// Satisfy yourself it worked
const { rows } = await pg.query('SELECT * FROM nicknames');
```

### checkConnection

You may wish to check the connection, especially on startup. This does a simple request to see if we can run a query on the postgres server.

```typescript
await pg.checkConnection();
```

### getConnectionPool

If you would like to interact directly with the node-postgres connection pool, it's exposed via this function. It's possible you could do something that breaks Piggy so beware.

```typescript
import { Pool } from 'pg';

const pool: Pool = pg.getConnectionPool();
```

## Development

```bash
npm install
./start-dependencies.sh
npm test
./stop-dependencies.sh
```
