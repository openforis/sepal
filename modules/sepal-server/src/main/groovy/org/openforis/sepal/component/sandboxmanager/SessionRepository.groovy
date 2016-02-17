package org.openforis.sepal.component.sandboxmanager

import groovy.sql.Sql
import groovy.transform.ToString
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock

import java.time.Duration

import static org.openforis.sepal.component.sandboxmanager.SessionStatus.*

interface SessionRepository {
    List<SandboxSession> findWithStatus(String username, Collection<SessionStatus> statuses)

    List<SandboxSession> findAllWithStatus(Collection<SessionStatus> statuses)

    List<SandboxSession> findStartingSessions()

    void closeAllTimedOut(Date updatedBefore, Closure callback)

    SandboxSession getById(long sessionId)

    SandboxSession create(String username, String instanceType)

    void update(SandboxSession sandboxSession)

    void close(SandboxSession sandboxSession)

    void alive(long sessionId, Date lastUpdated)

    Map<String, Double> hoursByInstanceType(String username, Date since)
}

/**
 * JDBC backed repository managing sandbox sessions.
 * All operations happens in separate transactions, since this is used in conjunction with non-transactional resources.
 */
@ToString
class JdbcSessionRepository implements SessionRepository {
    private final SqlConnectionManager connectionManager
    private final Clock clock

    JdbcSessionRepository(SqlConnectionManager connectionManager, Clock clock) {
        this.connectionManager = connectionManager
        this.clock = clock
    }

    List<SandboxSession> findWithStatus(String username, Collection<SessionStatus> statuses) {
        def statusesPlaceHolders = (['?'] * statuses.size()).join(', ')
        def args = [username] + statuses.collect { it.name() }
        sql.rows("""
                SELECT id, username, instance_id, instance_type, host, port, status, creation_time, update_time
                FROM sandbox_session
                WHERE username = ?
                AND status in ($statusesPlaceHolders)
                """ as String, args).collect { row ->
            toSession(row)
        }
    }

    List<SandboxSession> findAllWithStatus(Collection<SessionStatus> statuses) {
        def statusesPlaceHolders = (['?'] * statuses.size()).join(', ')
        def args = statuses.collect { it.name() }
        sql.rows("""
                SELECT id, username, instance_id, instance_type, host, port, status, creation_time, update_time
                FROM sandbox_session
                WHERE status in ($statusesPlaceHolders)
                """ as String, args).collect { row ->
            toSession(row)
        }
    }

    void closeAllTimedOut(Date updatedBefore, Closure callback) {
        sql.eachRow('''
                SELECT id, username, instance_id, instance_type, host, port, status, creation_time, update_time
                FROM sandbox_session
                WHERE status IN (?, ?, ?)
                AND update_time < ?
                ''', [PENDING.name(), STARTING.name(), ACTIVE.name(), updatedBefore]) { row ->
            callback.call(toSession(row))
            updateStatus(row.id, CLOSED, sql)
        }
    }

    void update(SandboxSession session) {
        session.with {
            sql.executeUpdate('''
                    UPDATE sandbox_session
                    SET instance_id = ?, instance_type = ?, host = ?, port = ?, status = ?,
                        creation_time = ?, update_time = ?
                    WHERE id = ?''',
                    [instanceId, instanceType, host, port, status.name(), creationTime, updateTime, id])
        }
    }

    void close(SandboxSession session) {
        updateStatus(session.id, CLOSED, sql)
    }

    private void updateStatus(long id, SessionStatus status, Sql sql) {
        sql.executeUpdate('''
                    UPDATE sandbox_session
                    SET status = ?, update_time = ?
                    WHERE id = ?''', [status.name(), clock.now(), id])
    }

    List<SandboxSession> findStartingSessions() {
        sql.rows('''
                SELECT id, username, instance_id, instance_type, host, port, status, creation_time, update_time
                FROM sandbox_session
                WHERE status = ?
                ''', [STARTING.name()]).collect {
            toSession(it)
        }
    }

    SandboxSession getById(long sessionId) {
        def row = sql.firstRow('''
                SELECT id, username, instance_id, instance_type, instance_type, host, port, status, creation_time, update_time
                FROM sandbox_session
                WHERE id = ?''', [sessionId])
        if (row == null)
            throw new NotFound("$sessionId: session not found")
        return toSession(row)
    }

    SandboxSession create(String username, String instanceType) {
        def session = null
        def sql = new Sql(connectionManager.dataSource)
        sql.withTransaction {
            def now = clock.now()
            def status = PENDING
            def generated = sql.executeInsert('''
                INSERT INTO sandbox_session(username, instance_type, status, creation_time, update_time)
                VALUES(?, ?, ?, ?, ?)''', [username, instanceType, status.name(), now, now])
            def id = generated[0][0] as long
            session = SandboxSession.pending(id, username, instanceType, now)
        }
        return session
    }

    void alive(long sessionId, Date lastUpdated) {
        sql.executeUpdate('UPDATE sandbox_session SET update_time = ? WHERE id = ?', [lastUpdated, sessionId])
    }

    Map<String, Double> hoursByInstanceType(String username, Date since) {
        def hoursByInstanceType = [:]
        def rows = sql.rows('''
                SELECT creation_time, update_time, instance_type, status
                FROM sandbox_session
                WHERE username = ? AND (status IN (?, ?, ?) OR creation_time >= ?)''',
                [username, PENDING.name(), STARTING.name(), ACTIVE.name(), since])
        rows.each { row ->
            def from = [since, row.creation_time].max()
            def to = row.status in [STARTING.name(), ACTIVE.name(), STARTING.name()] ? clock.now() : row.update_time
            def duration = Duration.between(from.toInstant(), to.toInstant())
            if (!hoursByInstanceType.containsKey(row.instance_type))
                hoursByInstanceType[row.instance_type] = 0
            hoursByInstanceType[row.instance_type] += Math.ceil(duration.toMinutes() / 60d)
        }
        return hoursByInstanceType
    }

    private SandboxSession toSession(row) {
        new SandboxSession(
                id: row.id,
                username: row.username,
                instanceId: row.instance_id,
                instanceType: row.instance_type,
                host: row.host,
                port: row.port,
                status: row.status,
                creationTime: row.creation_time,
                updateTime: row.update_time
        )
    }

    private Sql getSql() {
        new Sql(connectionManager.dataSource)
    }

    class NotFound extends RuntimeException {
        NotFound(String message) {
            super(message)
        }
    }
}
