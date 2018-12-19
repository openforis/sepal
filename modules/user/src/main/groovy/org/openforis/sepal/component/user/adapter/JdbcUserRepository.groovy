package org.openforis.sepal.component.user.adapter

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.security.Roles
import org.openforis.sepal.sql.SqlConnectionProvider
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User

import java.sql.Timestamp

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
                UPDATE sepal_user SET name = ?, email = ?, organization = ?, update_time = ? 
                WHERE username = ?''', [user.name, user.email, user.organization, new Date(), user.username])
    }

    void deleteUser(String username) {
        sql.execute('DELETE FROM sepal_user WHERE username = ?', [username])
    }

    List<User> listUsers() {
        sql.rows('''
                SELECT id, username, name, email, organization, admin, system_user, status, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, 
                       creation_time, update_time
                FROM sepal_user 
                ORDER BY creation_time DESC''').collect {
            createUser(it)
        }
    }

    User lookupUser(String username) {
        def row = sql.firstRow('''
                SELECT id, username, name, email, organization, admin, system_user, status, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, 
                       creation_time, update_time
                FROM sepal_user 
                WHERE username = ?''', [username])
        if (!row)
            throw new IllegalStateException('User not in repository: ' + username)
        return createUser(row)
    }

    User findUserByEmail(String email) {
        def row = sql.firstRow('''
                SELECT id, username, name, email, organization, admin, system_user, status, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, 
                       creation_time, update_time
                FROM sepal_user 
                WHERE email = ?''', [email])
        return row ? createUser(row) : null
    }

    void updateToken(String username, String token, Date tokenGenerationTime) {
        sql.executeUpdate('''
                UPDATE sepal_user SET token = ?, token_generation_time = ?, update_time = ? 
                WHERE username = ?''', [token, tokenGenerationTime, new Date(), username])
    }

    Map tokenStatus(String token) {
        def row = sql.firstRow('''
                SELECT id, username, name, email, organization, admin, status, system_user, token_generation_time, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, 
                       creation_time, update_time 
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

    void updateGoogleTokens(String username, GoogleTokens tokens) {
        sql.executeUpdate('''
                UPDATE sepal_user 
                SET google_refresh_token = ?,  
                    google_access_token = ?, 
                    google_access_token_expiration = ?,
                 update_time = ?
                WHERE username = ?''', [
                tokens?.refreshToken,
                tokens?.accessToken,
                tokens ? new Date(tokens.accessTokenExpiryDate) : null,
                new Date(),
                username
        ])
    }

    private User createUser(GroovyRowResult row) {
        def user = new User(
                id: row.id,
                name: row.name,
                username: row.username,
                email: row.email,
                organization: row.organization,
                roles: (row.admin ? [Roles.ADMIN] : []).toSet(),
                systemUser: row.system_user,
                googleTokens: row.google_refresh_token ? new GoogleTokens(
                        refreshToken: row.google_refresh_token,
                        accessToken: row.google_access_token,
                        accessTokenExpiryDate: row.google_access_token_expiration.time) : null,
                status: row.status as User.Status,
            creationTime: toDate(row.creation_time),
            updateTime: toDate(row.update_time),
        )
        return user
    }

    private Date toDate(date) {
        return date ? new Date((date as Timestamp).time) : null
    }

    private Sql getSql() {
        connectionProvider.sql
    }

}
