import assert from 'node:assert/strict'
import {test} from 'node:test'

import {postgratorOptions} from './postgres.js'

const execQuery = () => {}

test('selects the pg driver and defaults the schema table to schema_version', () => {
    const options = postgratorOptions({path: '/m', database: 'db', execQuery})

    assert.deepEqual(options, {
        migrationPattern: '/m/*',
        driver: 'pg',
        database: 'db',
        schemaTable: 'schema_version',
        execQuery
    })
})

test('uses a custom schema table when provided', () => {
    const options = postgratorOptions({
        path: '/m', database: 'db', execQuery, schemaTable: 'schema_version_custom'
    })

    assert.equal(options.schemaTable, 'schema_version_custom')
})
