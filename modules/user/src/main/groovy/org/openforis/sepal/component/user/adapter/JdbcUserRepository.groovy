package org.openforis.sepal.component.user.adapter

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.security.Roles
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.openforis.sepal.user.User

class JdbcUserRepository implements UserRepository {
    private final SqlConnectionProvider connectionProvider

    JdbcUserRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    User insertUser(User user, String token) {
        def result = sql.executeInsert('''
                INSERT INTO sepal_user (username, name, email, organization, token, admin, system_user, status) 
                VALUES(?, ?, ?, ?, ?, ?, ?, ?)''',
                [user.username, user.name, user.email, user.organization, token, user.admin, user.systemUser, User.Status.PENDING.name()])
        return user.withId(result[0][0] as long)
    }

    void updateUserDetails(User user) {
        sql.executeUpdate('''
                UPDATE sepal_user SET name = ?, email = ?, organization = ? 
                WHERE username = ?''', [user.name, user.email, user.organization, user.username])
    }

    List<User> listUsers() {
        sql.rows('SELECT id, username, name, email, organization, admin, system_user, status FROM sepal_user').collect {
            createUser(it)
        }
    }

    User lookupUser(String username) {
        def row = sql.firstRow('''
                SELECT id, username, name, email, organization, admin, system_user, status 
                FROM sepal_user 
                WHERE username = ?''', [username])
        if (!row)
            throw new IllegalStateException('User not in repository: ' + username)
        return createUser(row)
    }

    User findUserByEmail(String email) {
        def row = sql.firstRow('''
                SELECT id, username, name, email, organization, admin, system_user, status 
                FROM sepal_user 
                WHERE email = ?''', [email])
        return row ? createUser(row) : null
    }

    void updateToken(String username, String token, Date tokenGenerationTime) {
        sql.executeUpdate('''
                UPDATE sepal_user SET token = ?, token_generation_time = ? 
                WHERE username = ?''', [token, tokenGenerationTime, username])
    }

    Map tokenStatus(String token) {
        def row = sql.firstRow('''
                SELECT id, username, name, email, organization, admin, status, system_user, token_generation_time 
                FROM sepal_user 
                WHERE token = ?''', [token])

        return row ? [
                generationTime: row.token_generation_time,
                user          : createUser(row)
        ] : null
    }

    void invalidateToken(String token) {
        sql.executeUpdate('UPDATE sepal_user SET token = NULL WHERE token = ?', [token])
    }

    void updateStatus(String username, User.Status status) {
        sql.executeUpdate('UPDATE sepal_user SET status = ? WHERE username = ?', [status.name(), username])
    }

    private User createUser(GroovyRowResult row) {
        new User(
                id: row.id,
                name: row.name,
                username: row.username,
                email: row.email,
                organization: row.organization,
                roles: (row.admin ? [Roles.ADMIN] : []).toSet(),
                systemUser: row.system_user,
                status: row.status as User.Status
        )
    }

    private Sql getSql() {
        connectionProvider.sql
    }

}
