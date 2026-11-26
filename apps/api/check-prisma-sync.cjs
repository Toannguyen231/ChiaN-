const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function readSchema(file, provider) {
  const schema = readFileSync(join(__dirname, 'prisma', file), 'utf8').replace(/\r\n/g, '\n');
  const expected = new RegExp('(datasource\\s+db\\s*\\{\\s*provider\\s*=\\s*")' + provider + '"');
  if (!expected.test(schema)) throw new Error(file + ' must use provider ' + provider);
  return schema.replace(expected, '$1PROVIDER"');
}

if (readSchema('schema.prisma', 'sqlite') !== readSchema('schema.postgres.prisma', 'postgresql')) {
  throw new Error('SQLite and PostgreSQL schemas differ outside the datasource provider.');
}
console.log('Prisma schemas match.');
