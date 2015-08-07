package org.openforis.sepal.user

import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionProvider

interface UserRepository {

    String getSandboxId(String username)

    void update(String username, String sandboxId, Integer portId)
}


class JDBCUserRepository implements UserRepository {

    private final SqlConnectionProvider connectionProvider

    JDBCUserRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    @Override
    String getSandboxId(String username) {
        def row = sql.firstRow('SELECT sandbox_id FROM users WHERE username = ?',[username])
        row?.sandbox_id
    }

    @Override
    void update(String username, String sandboxId, Integer portId) {
        sql.executeUpdate('UPDATE users SET sandbox_id = ?, sandbox_ssh_port = ? WHERE username = ?',[sandboxId,portId,username])
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}