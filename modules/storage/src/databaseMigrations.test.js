// Contract test for the legacy import (migrations/legacy-import/001.do.import.sql). Its conditions and
// transformations are asserted against the SQL because running it needs the legacy `user_storage`
// schema, and a test that created or dropped that database would destroy the very data the import
// exists to carry over; what the schema stream produces is covered by
// databaseMigrations.integration.test.js against MySQL.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {dirName} from '#sepal/path'

test('copies only when the source exists and the target is still empty', () => {
    assert.match(
        sql,
        /EXISTS\(SELECT 1 FROM information_schema\.TABLES WHERE TABLE_SCHEMA='user_storage' AND TABLE_NAME='history'\)/
    )
    assert.match(sql, /\(SELECT COUNT\(\*\) FROM `history`\)=0/)
})

test('preserves the identities the event ordering is read by', () => {
    assert.match(sql, /INSERT INTO `history` \(id, username, event, timestamp\)/)
    assert.match(sql, /SELECT id, LOWER\(username\), event, timestamp/)
})

test('reads the legacy schema by name, and writes only to the selected database', () => {
    assert.match(sql, /FROM user_storage\.`history`/)
    const writes = sql.match(/(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE|CREATE TABLE)\s+user_storage\./g)
    assert.equal(writes, null)
})

const raw = readFileSync(join(dirName(import.meta.url), '../migrations/legacy-import/001.do.import.sql'), 'utf8')

// Assert against the SQL itself, not the explanatory header comments.
const sql = raw
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
