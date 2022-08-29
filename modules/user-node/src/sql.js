const mysql = require('mysql')
const _ = require('lodash')

const toPromise = async func =>
    new Promise((resolve, reject) => {
        try {
            func((error, ...result) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(result)
                }
            })
        } catch (error) {
            reject(error)
        }
    })

const query = async (connection, sqlClauses, values, {ignoreErrors}) => {
    const sql = _.compact(
        _.castArray(sqlClauses)
    ).join(' ')
    try {
        const [results, fields] = await toPromise(
            callback => connection.query(sql, values, callback)
        )
        return {results, fields}
    } catch (error) {
        if (ignoreErrors) {
            return {error}
        } else {
            throw error
        }
    }
}

const whereClause = where => {
    if (where) {
        if (_.isString(where)) {
            return `WHERE ${where}`
        }
        if (_.isObject(where)) {
            return whereClause(
                _.transform(where, (conditions, value, key) => {
                    conditions.push(`${mysql.escapeId(key)} = ${mysql.escape(value)}`)
                }, []).join(' AND ')
            )
        }
    }
    return ''
}

const orderClause = order => {
    const orderDirection = value => {
        if ([1, 'ASC'].includes(value)) {
            return 'ASC'
        }
        if ([-1, 'DESC'].includes(value)) {
            return 'DESC'
        }
        throw Error('Unsupported SQL ORDER BY direction:', value)
    }
    if (order) {
        if (_.isString(order)) {
            return `ORDER BY ${order}`
        }
        if (_.isObject(order)) {
            return orderClause(
                _.transform(order, (conditions, value, key) => {
                    conditions.push(`${mysql.escapeId(key)} ${orderDirection(value)}`)
                }, []).join(', ')
            )
        }
    }
    return ''
}

const limitClause = limit =>
    limit ? `LIMIT ${limit}` : ''

const extraClause = extra =>
    extra ? extra : ''

const mapResult = (result, fields) =>
    _.transform(result, (result, value, column) => {
        if (column) {
            if (_.isString(fields[column])) {
                // rename column
                result[fields[column]] = value
            } else {
                // keep column name
                result[column] = value
            }
        }
    }, {})

const select = async (connection, {fields, table, where, order, limit, extra, ignoreErrors}) => {
    const columns = _(fields)
        .pickBy(_.identity)
        .keys()
        .value()
    const sql = [
        'SELECT ?? FROM ??',
        whereClause(where),
        orderClause(order),
        limitClause(limit),
        extraClause(extra)
    ]
    const {results} = await query(connection, sql, [columns, table], {ignoreErrors})
    return results.map(result => mapResult(result, fields))
}

const insert = async (connection, {fields, table, ignoreErrors}) => {
    const sql = 'INSERT INTO ?? SET ?'
    const {results} = await query(connection, sql, [table, fields], {ignoreErrors})
    return results?.insertId
}

const update = async (connection, {fields, table, where, ignoreErrors}) => {
    const sql = [
        'UPDATE ?? SET ?',
        whereClause(where)
    ]
    const {results} = await query(connection, sql, [table, fields], {ignoreErrors})
    return results?.changedRows
}

const remove = async (connection, {table, where, ignoreErrors}) => {
    const sql = [
        'DELETE FROM ??',
        whereClause(where)
    ]
    const {results} = await query(connection, sql, [table], {ignoreErrors})
    return results?.affectedRows
}
    
const Sql = options => {
    const pool = mysql.createPool(options)
    return {
        escape: value => mysql.escape(value),
        select: async args => await select(pool, args),
        insert: async args => await insert(pool, args),
        update: async args => await update(pool, args),
        remove: async args => await remove(pool, args)
    }
}

module.exports = {Sql}
