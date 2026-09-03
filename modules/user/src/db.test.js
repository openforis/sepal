// Contract test for the schema migration (migrations/001.do.schema.sql). It creates the module's
// own `user` schema and copies from the legacy `sepal_user`, which must be left untouched.
import {readFileSync} from 'fs'
import {join} from 'path'

import {dirName} from '#sepal/path'

const __dirname = dirName(import.meta.url)
const raw = readFileSync(join(__dirname, '../migrations/001.do.schema.sql'), 'utf8')
// Assert against the SQL itself, not the explanatory header comments.
const ddl = raw
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')

test('creates the schema and table guarded, so a rerun is a no-op', () => {
    expect(ddl).toMatch(/CREATE SCHEMA IF NOT EXISTS user;/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS user\.`sepal_user`/)
})

test('includes the credential/POSIX columns, so there is no follow-up column migration', () => {
    for (const column of ['`password_hash`', '`ssh_public_key`', '`uid`', '`gid`']) {
        expect(ddl).toContain(column)
    }
})

test('copies only when the source exists and the target is still empty', () => {
    expect(ddl).toMatch(/EXISTS\(SELECT 1 FROM information_schema\.TABLES WHERE TABLE_SCHEMA='sepal_user'/)
    expect(ddl).toMatch(/\(SELECT COUNT\(\*\) FROM user\.`sepal_user`\)=0/)
})

test('lowercases usernames on the way in', () => {
    expect(ddl).toMatch(/SELECT id, LOWER\(username\)/)
})

test('never writes to the legacy schema', () => {
    const writes = ddl.match(/(INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE)\s+sepal_user\./g)
    expect(writes).toBeNull()
})

test('does not pin AUTO_INCREMENT (fresh installs start from 1)', () => {
    expect(ddl).not.toMatch(/AUTO_INCREMENT=\d+/)
})

test('does not create the Java reliable-message-bus relics or Postgrator history table', () => {
    for (const table of ['rmb_message', 'schema_version']) {
        expect(ddl).not.toContain(table)
    }
})
