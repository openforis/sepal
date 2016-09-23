package org.openforis.sepal.user

import groovy.sql.Sql
import groovymvc.security.UserProvider
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface UserRepository {

    User getUserByUsername(String username)

    User lookup(String username)

    boolean contains(String username)

    void eachUsername(Closure closure)
}

class JdbcUserRepository implements UserRepository, UserProvider<User> {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SqlConnectionProvider connectionProvider

    JdbcUserRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    User getUserByUsername(String username) {
        def row = sql.firstRow('SELECT * FROM users WHERE username = ?', [username])
        if (!row)
            throw new NonExistingUser(username)

        return new User(
                id: row.id,
                username: row.username,
                name: row.full_name,
                email: row.email,
                roles: loadRoles(row.id)
        )
    }

    private Set<String> loadRoles(long userId) {
        sql.rows('''
                SELECT role_name
                FROM users_roles
                JOIN roles ON role_id = roles.id
                WHERE user_id = ? ''', [userId])
                .collect { it.role_name }.toSet()
    }

    User lookup(String username) {
        def user = null
        try {
            user = getUserByUsername(username)
        } catch (NonExistingUser neu) {
            LOG.warn("User $neu.username does not exist")
        }
        return user
    }

    boolean contains(String username) {
        return lookup(username) != null
    }

    void eachUsername(Closure closure) {
        sql.eachRow('SELECT username FROM users WHERE is_system_user IS NULL') {
            closure.call(it.username)
        }
    }


    private Sql getSql() {
        connectionProvider.sql
    }
}