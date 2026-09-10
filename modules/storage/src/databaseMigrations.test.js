// Contract test for the legacy import (migrations/legacy-import/001.do.import.sql). Its conditions and
// transformations are asserted against the SQL because running it needs the legacy `user_storage`
// schema, and a test that created or dropped that database would destroy the very data the import
// exists to carry over; what the schema stream produces is covered by
// databaseMigrations.integration.test.js against MySQL.
import {readFileSync} from 'fs'
import {join} from 'path'

import {dirName} from '#sepal/path'

test('copies only when the source exists and the target is still empty', () => {
    expect(sql).toMatch(/EXISTS\(SELECT 1 FROM information_schema\.TABLES WHERE TABLE_SCHEMA='user_storage' AND TABLE_NAME='history'\)/)
    expect(sql).toMatch(/\(SELECT COUNT\(\*\) FROM `history`\)=0/)
})

test('preserves the identities the event ordering is read by', () => {
    expect(sql).toMatch(/INSERT INTO `history` \(id, username, event, timestamp\)/)
    expect(sql).toMatch(/SELECT id, LOWER\(username\), event, timestamp/)
})

test('reads the legacy schema by name, and writes only to the selected database', () => {
    expect(sql).toMatch(/FROM user_storage\.`history`/)
    const writes = sql.match(/(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE|CREATE TABLE)\s+user_storage\./g)
    expect(writes).toBeNull()
})

const raw = readFileSync(join(dirName(import.meta.url), '../migrations/legacy-import/001.do.import.sql'), 'utf8')

// Assert against the SQL itself, not the explanatory header comments.
const sql = raw
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
