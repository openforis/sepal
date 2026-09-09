// Contract test for the legacy import (migrations/legacy-import/001.do.import.sql). Its conditions and
// transformations are asserted against the SQL because running it needs the legacy `sepal_user` schema;
// what the schema stream produces is covered by databaseMigrations.integration.test.js against MySQL.
import {readFileSync} from 'fs'
import {join} from 'path'

import {dirName} from '#sepal/path'

const __dirname = dirName(import.meta.url)
const raw = readFileSync(join(__dirname, '../migrations/legacy-import/001.do.import.sql'), 'utf8')
// Assert against the SQL itself, not the explanatory header comments.
const sql = raw
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')

test('copies only when the source exists and the target is still empty', () => {
    expect(sql).toMatch(/EXISTS\(SELECT 1 FROM information_schema\.TABLES WHERE TABLE_SCHEMA='sepal_user'/)
    expect(sql).toMatch(/\(SELECT COUNT\(\*\) FROM `sepal_user`\)=0/)
})

test('lowercases usernames on the way in', () => {
    expect(sql).toMatch(/SELECT id, LOWER\(username\)/)
})

test('reads the legacy schema by name, and writes only to the selected database', () => {
    expect(sql).toMatch(/FROM sepal_user\.`sepal_user`/)
    const writes = sql.match(/(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE)\s+sepal_user\./g)
    expect(writes).toBeNull()
})
