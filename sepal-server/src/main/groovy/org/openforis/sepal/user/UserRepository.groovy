package org.openforis.sepal.user

import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionProvider

interface UserRepository {

    int getUserUid(String username)

    Boolean userExist(String username)
}


class JDBCUserRepository implements UserRepository {

    private final SqlConnectionProvider connectionProvider

    JDBCUserRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    @Override
    Boolean userExist(String username) {
        def row = sql.firstRow('SELECT count(*) as exist FROM users WHERE username = ?', [username])
        return row?.exist > 0
    }

    @Override
    int getUserUid(String username) {
        def row = sql.firstRow('SELECT user_uid FROM users WHERE username = ?', [username])
        row?.user_uid
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}