package org.openforis.sepal.user

import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionProvider

interface UserRepository {

    String getSandboxId(String username)

    void update(String username, String sandboxId, String sandboxURI)

    String getSandboxURI(String username)

    int getUserUid(String username)
}


class JDBCUserRepository implements UserRepository {

    private final SqlConnectionProvider connectionProvider

    JDBCUserRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    @Override
    int getUserUid(String username) {
        def row = sql.firstRow('SELECT user_uid FROM users WHERE username = ?',[username])
        row?.user_uid
    }

    @Override
    String getSandboxId(String username) {
        def row = sql.firstRow('SELECT sandbox_id FROM users WHERE username = ?',[username])
        row?.sandbox_id
    }

    @Override
    String getSandboxURI(String username) {
        def row = sql.firstRow('SELECT sandbox_uri FROM users WHERE username = ?',[username])
        row?.sandbox_uri
    }

    @Override
    void update(String username, String sandboxId, String sandboxURI) {
        sql.executeUpdate('UPDATE users SET sandbox_id = ?, sandbox_uri = ? WHERE username = ?',[sandboxId,sandboxURI,username])
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}