package org.openforis.sepal.component.user.adapter

import groovy.sql.GroovyResultSet
import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.security.Roles
import org.openforis.sepal.sql.SqlConnectionProvider
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Clock

import java.sql.Timestamp

class JdbcUserRepository implements UserRepository {
    private final SqlConnectionProvider connectionProvider
    private final Clock clock

    JdbcUserRepository(SqlConnectionProvider connectionProvider, Clock clock) {
        this.connectionProvider = connectionProvider
        this.clock = clock
    }

    User insertUser(User user, String token) {
        def result = sql.executeInsert('''
                INSERT INTO sepal_user (username, name, email, organization, intended_use, email_notifications_enabled, manual_map_rendering_enabled, token, admin, system_user, status, 
                            creation_time, update_time) 
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                [
                    user.username, user.name, user.email, user.organization, user.intendedUse, user.emailNotificationsEnabled, user.manualMapRenderingEnabled,
                    token, user.admin, user.systemUser, User.Status.PENDING.name(), user.creationTime, user.updateTime
                ]
        )
        return user.withId(result[0][0] as long)
    }

    void updateUserDetails(User user) {
        sql.executeUpdate('''
                UPDATE sepal_user SET name = ?, email = ?, organization = ?, intended_use = ?, email_notifications_enabled = ?, manual_map_rendering_enabled = ?, admin = ?, update_time = ? 
                WHERE username = ?''', [user.name, user.email, user.organization, user.intendedUse, user.emailNotificationsEnabled, user.manualMapRenderingEnabled, user.admin, user.updateTime, user.username])
    }

    void deleteUser(String username) {
        sql.execute('DELETE FROM sepal_user WHERE username = ?', [username])
    }

    List<User> listUsers() {
        def users = []
        sql.eachRow('''
                SELECT id, username, name, email, organization, intended_use, email_notifications_enabled, manual_map_rendering_enabled, admin, system_user, status, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, google_project_id, google_legacy_project,
                       creation_time, update_time
                FROM sepal_user 
                ORDER BY creation_time DESC''') {
            users << toUser(it)
        }
        return users
    }

    void setLastLoginTime(String username, Date loginTime) {
        sql.executeUpdate('''
                UPDATE sepal_user 
                SET last_login_time = ?
                WHERE username = ?''', [
                loginTime,
                username
        ])
    }

    User lookupUser(String username) {
        def user = null
        sql.eachRow('''
                SELECT id, username, name, email, organization, intended_use, email_notifications_enabled, manual_map_rendering_enabled, admin, system_user, status, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, google_project_id, google_legacy_project,
                       creation_time, update_time
                FROM sepal_user 
                WHERE username = ?''', [username]) {
            user = toUser(it)
        }
        if (user)
            return user
        else
            throw new IllegalStateException('User not in repository: ' + username)
    }

    User findUserByUsername(String username) {
        def user = null
        sql.eachRow('''
                SELECT id, username, name, email, organization, intended_use, email_notifications_enabled, manual_map_rendering_enabled, admin, system_user, status, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, google_project_id, google_legacy_project,
                       creation_time, update_time
                FROM sepal_user 
                WHERE username = ?''', [username]) {
            user = toUser(it)
        }
        return user
    }

    User findUserByEmail(String email) {
        def user = null
        sql.eachRow('''
                SELECT id, username, name, email, organization, intended_use, email_notifications_enabled, manual_map_rendering_enabled, admin, system_user, status, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, google_project_id, google_legacy_project,
                       creation_time, update_time
                FROM sepal_user 
                WHERE email = ?''', [email]) {
            user = toUser(it)
        }
        return user
    }

    boolean emailNotificationsEnabled(String email) {
        sql.firstRow('''
                SELECT email_notifications_enabled
                FROM sepal_user 
                WHERE email = ?''', [email]
        )?.email_notifications_enabled
    }

    void updateToken(String username, String token, Date tokenGenerationTime) {
        sql.executeUpdate('''
                UPDATE sepal_user SET token = ?, token_generation_time = ?, update_time = ? 
                WHERE username = ?''', [token, tokenGenerationTime, clock.now(), username])
    }

    Map tokenStatus(String token) {
        def status = null
        sql.eachRow('''
                SELECT id, username, name, email, organization, intended_use, email_notifications_enabled, manual_map_rendering_enabled, admin, status, system_user, token_generation_time, 
                       google_refresh_token,  google_access_token, google_access_token_expiration, google_project_id, google_legacy_project,
                       creation_time, update_time 
                FROM sepal_user 
                WHERE token = ?''', [token]) {
            status = [
                generationTime: it.token_generation_time,
                user: toUser(it)
            ]
        }
        return status
    }

    Map tokenStatusByUsername(String username) {
        def status = null
        sql.eachRow('''
                SELECT token, token_generation_time
                FROM sepal_user 
                WHERE username = ?''', [username]) {
            status = it.token ? [
                token: it.token,
                generationTime: it.token_generation_time,
            ] : null
        }
        return status
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
                    google_project_id = ?,
                    google_legacy_project = ?,
                    update_time = ?
                WHERE username = ?''', [
                tokens?.refreshToken,
                tokens?.accessToken,
                tokens ? new Date(tokens.accessTokenExpiryDate) : null,
                tokens?.projectId,
                tokens?.legacyProject ? 1 : 0,
                clock.now(),
                username
        ])
    }

    private User toUser(row) {
        def user = new User(
                id: row.id,
                name: row.name,
                username: row.username?.toLowerCase(),
                email: row.email,
                organization: row.organization,
                intendedUse: row.longText('intended_use'),
                emailNotificationsEnabled: row.email_notifications_enabled,
                manualMapRenderingEnabled: row.manual_map_rendering_enabled,
                roles: (row.admin ? [Roles.ADMIN] : []).toSet(),
                systemUser: row.system_user,
                googleTokens: row.google_refresh_token ? new GoogleTokens(
                        refreshToken: row.google_refresh_token,
                        accessToken: row.google_access_token,
                        accessTokenExpiryDate: row.google_access_token_expiration.time,
                        projectId: row.google_project_id,
                        legacyProject: !!row.google_legacy_project
                ) : null,
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
