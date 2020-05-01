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
