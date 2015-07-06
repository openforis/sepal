package org.openforis.sepal.repository

import groovy.sql.Sql
import org.openforis.sepal.model.User
import org.openforis.sepal.transaction.SqlConnectionProvider

class UserRepository {
    private final SqlConnectionProvider connectionProvider

    UserRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    User getUserById(int id) {
        def user = findById(id)
        if (user == null)
            throw new IllegalStateException("No user with id $id exists")
        return user
    }

    boolean containsUserWithId(int id) {
        findById(id) != null
    }

    private User findById(int id) {
        def row = sql.firstRow('SELECT id, username, email, full_name FROM users WHERE id = ?', [id])
        if (row == null)
            return null
        return new User(
                id: row.id,
                username: row.username,
                email: row.email,
                fullName: row.full_name
        )
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
