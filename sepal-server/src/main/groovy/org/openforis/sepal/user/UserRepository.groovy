package org.openforis.sepal.user

import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface UserRepository {


    User fetchUser(String username)

    User getUser(String username)
}


class JDBCUserRepository implements UserRepository {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SqlConnectionProvider connectionProvider

    JDBCUserRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    User fetchUser(String username) {
        def user
        def row = sql.firstRow('SELECT * FROM users WHERE username = ?', [username])
        if (row) {
            user = mapUser(row)
        } else {
            throw new NonExistingUser(username)
        }
        return user
    }

    User getUser(String username) {
        def user = null
        try {
            user = fetchUser(username)
        } catch (NonExistingUser neu) {
            LOG.warn("User $neu.username does not exist")
        }
        return user
    }


    private static User mapUser(row) {
        new User(id: row.id, username: row.username, monthlyQuota: row.monthly_quota, userUid: row.user_uid)
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}