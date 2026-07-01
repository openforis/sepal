import {postgratorOptions} from './mysql.js'

const execQuery = () => {}

test('defaults the schema table to schema_version', () => {
    const options = postgratorOptions({path: '/m', database: 'db', execQuery})
    expect(options.schemaTable).toBe('schema_version')
    expect(options.driver).toBe('mysql')
    expect(options.database).toBe('db')
    expect(options.migrationPattern).toBe('/m/*')
})

test('uses a custom schema table when provided', () => {
    const options = postgratorOptions({
        path: '/m', database: 'db', execQuery, schemaTable: 'schema_version_user_node'
    })
    expect(options.schemaTable).toBe('schema_version_user_node')
})
