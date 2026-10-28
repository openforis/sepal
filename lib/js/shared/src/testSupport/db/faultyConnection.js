// TEST SUPPORT — never import from production code.
//
// Fails one statement of a real operation against a real database, so a test can prove that the work
// already done in the same transaction is rolled back. Everything else stays real: MySQL persists and
// isolates, and begin/commit/rollback are the production runner's.
//
// `when(sql, params)` selects the statement. It receives both, because a table name is often a `??`
// parameter rather than text in the SQL. Keep those selectors narrow and specific to the operation
// under test; this module deliberately knows nothing about SQL.
//
// The first matching statement of each decorated callback fails, and only the first. A decorated
// repository used for two concurrent operations would fail a statement in each, so decorate for the
// one operation under test.

export const faultyConnection = (connection, {when, error}) => {
    let armed = true
    // Delegated with the real connection as receiver: a bare method reference would lose it.
    return {
        query: (sql, params) => {
            if (armed && when(sql, params)) {
                armed = false
                return Promise.reject(error)
            } else {
                return connection.query(sql, params)
            }
        },
        beginTransaction: () => connection.beginTransaction(),
        commit: () => connection.commit(),
        rollback: () => connection.rollback(),
        release: () => connection.release(),
        destroy: () => connection.destroy()
    }
}

export const failingDb = (db, fault) => ({
    withTransaction: run => db.withTransaction(connection => run(faultyConnection(connection, fault))),
    withConnection: run => db.withConnection(connection => run(faultyConnection(connection, fault)))
})
