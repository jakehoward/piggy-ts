import { render } from './template-query';

describe('Formatted query', () => {
  it('correctly renders a templated query', () => {
    const queryTemplate = 'SELECT %I:colname FROM %I:schema.%I:tableName WHERE my_v = %L:myVal AND %s:literal';
    const params = {
      colname: 'things',
      schema: 'all',
      tableName: 'the_things',
      myVal: 10,
      literal: '1=1; Little bobby drop tables;',
    };

    expect(render(queryTemplate, params)).toBe(
      `SELECT things FROM "all".the_things WHERE my_v = '10' AND 1=1; Little bobby drop tables;`,
    );
  });

  it('throws an error if the params are missing keys in the template', () => {
    const queryTemplate = 'SELECT %I:one FROM %I:two';
    const params = { one: 'one' };
    expect(() => render(queryTemplate, params)).toThrowErrorMatchingInlineSnapshot(
      `"SQL identifier cannot be null or undefined"`,
    );
  });

  it('works fine if you pass extra params', () => {
    const queryTemplate = 'SELECT %I:one FROM %I:two';
    const params = { one: 'first', two: 'second', free: 'param' };
    expect(render(queryTemplate, params)).toBe('SELECT first FROM second');
  });

  it('allows params to be repeated', () => {
    const queryTemplate = 'SELECT %I:one FROM %I:one';
    const params = { one: 'first' };
    expect(render(queryTemplate, params)).toBe('SELECT first FROM first');
  });

  it('works when there are no substitutions', () => {
    expect(render('SELECT 1', {})).toBe('SELECT 1');
  });

  it('allows you to use null as a value', () => {
    const queryTemplate = 'SELECT 1 FROM sth WHERE or_other IS %L:myVal';
    const params = { myVal: null };
    expect(render(queryTemplate, params)).toBe('SELECT 1 FROM sth WHERE or_other IS NULL');
  });
});
