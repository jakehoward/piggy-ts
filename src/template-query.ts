import initDebug from 'debug';
const pgFormat = require('pg-format');

const debug = initDebug('piggy-ts:render');

// TODO: error if key is missing from params but requested from template string
// TODO: allow user to provide % literal (select example from examples where example = '%I:varName';
export function render(queryTemplate: string, params: { [key: string]: string | number | null }): string {
  debug(`Rendering query template: ${queryTemplate} with params ${JSON.stringify(params)}`);

  const templateTokens = queryTemplate.match(/%[ILs]:([a-zA-Z]+)/g);
  if (!templateTokens) {
    return queryTemplate;
  }
  const keys = templateTokens.map((token: string) => token.split(':')[1]);
  const pgFormatTemplate = queryTemplate.replace(/(%[ILs]):[a-zA-Z]+/g, '$1');
  return pgFormat(pgFormatTemplate, ...keys.map(k => params[k]));
}
