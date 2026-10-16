import assert from 'node:assert/strict'
import {test} from 'node:test'

import {postgratorOptions} from './mysql.js'

const execQuery = () => {}

test('defaults the schema table to schema_version', () => {
    const options = postgratorOptions({path: '/m', database: 'db', execQuery})
    assert.equal(options.schemaTable, 'schema_version')
    assert.equal(options.driver, 'mysql')
    assert.equal(options.database, 'db')
    assert.equal(options.migrationPattern, '/m/*')
})

test('uses a custom schema table when provided', () => {
    const options = postgratorOptions({
        path: '/m', database: 'db', execQuery, schemaTable: 'schema_version_custom'
    })
    assert.equal(options.schemaTable, 'schema_version_custom')
})
