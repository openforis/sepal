// Contract test for the fresh-install base schema (src/sql/base-schema.sql). db.js applies this
// DDL when the base table is missing, BEFORE running the Postgrator migrations. Existing installs
// must be untouched and migration 001 must no-op.
import {readFileSync} from 'fs'
import {join} from 'path'

import {dirName} from '#sepal/path'

const __dirname = dirName(import.meta.url)
const raw = readFileSync(join(__dirname, 'sql/base-schema.sql'), 'utf8')
// Assert against the SQL itself, not the explanatory header comments.
const ddl = raw
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')

test('is guarded so it is a no-op on existing installs', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS `sepal_user`\.`sepal_user`/)
})

test('contains only the guarded CREATE TABLE (no other statements)', () => {
    // db.js runs the file as a single query; anything else here would run unguarded on every boot.
    const statements = ddl.split(';').map(s => s.trim()).filter(s => s.length > 0)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS/)
})

test('includes the migration-001 credential/POSIX columns so 001 no-ops on a fresh install', () => {
    // 001's AddColumnIfNotExists procedure skips existing columns; if any of these were missing
    // from the base DDL, 001 would still work — but the schema would depend on migration order.
    // Keeping the base DDL at the full current shape keeps fresh installs deterministic.
    for (const column of ['`password_hash`', '`ssh_public_key`', '`uid`', '`gid`']) {
        expect(ddl).toContain(column)
    }
})

test('does not pin AUTO_INCREMENT (fresh installs start from 1)', () => {
    expect(ddl).not.toMatch(/AUTO_INCREMENT=\d+/)
})

test('does not create the Java reliable-message-bus relics or Postgrator history table', () => {
    for (const table of ['rmb_message', 'schema_version']) {
        expect(ddl).not.toContain(table)
    }
})
