package org.openforis.sepal.sandbox

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE
import static org.openforis.sepal.sandbox.SandboxStatus.REQUESTED

interface SandboxDataRepository {

    Boolean alive(int sandboxId)

    void terminated(int sandboxId)

    void created(int sandboxId, String containerId, String sandboxURI)

    int requested(String username)

    List<SandboxData> getSandboxes(SandboxStatus status)

    SandboxData getUserRunningSandbox(String username)

}

class JDBCSandboxDataRepository implements SandboxDataRepository {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SqlConnectionProvider connectionProvider

    JDBCSandboxDataRepository(SqlConnectionProvider connectionProvider) {
        super()
        this.connectionProvider = connectionProvider
    }

    @Override
    Boolean alive(int sandboxId) {
        def result = sql.executeUpdate('''
          UPDATE  sandboxes SET status = ?, status_refreshed_on = ?
          WHERE sandbox_id = ?''', [ALIVE.name(), new Date(), sandboxId])
        return result > 0
    }


    @Override
    void terminated(int sandboxId) {
        def now = new Date()
        sql.executeUpdate('''
            UPDATE sandboxes SET status = ?, status_refreshed_on = ?, terminated_on =?
            WHERE sandbox_id = ?''', [SandboxStatus.TERMINATED.name(), now, now, sandboxId])
    }

    @Override
    void created(int sandboxId, String containerId, String sandboxURI) {
        sql.executeUpdate('''
            UPDATE sandboxes SET container_id = ?, status = ?, status_refreshed_on = ?, uri = ?
            WHERE sandbox_id = ?
            ''',[containerId,ALIVE.name(), new Date(), sandboxURI,sandboxId])
    }

    @Override
    int requested(String username) {
        def keys = sql.executeInsert('''
            INSERT INTO sandboxes(username,status,status_refreshed_on)
            VALUES(?,?,?)''', [username,REQUESTED.name(), new Date()])
        return keys[0][0] as int
    }

    @Override
    SandboxData getUserRunningSandbox(String username) {
        def returnData = null
        def rows = sql.rows(' SELECT * FROM sandboxes WHERE username = ? AND status = ? ', [username, ALIVE.name()])
        if (rows) {
            if (rows.size() > 1) {
                LOG.warn("Found more than 1 running container for user $username. This may cause problems")
            }
            returnData = map(rows.first())
        }

        return returnData

    }

    @Override
    List<SandboxData> getSandboxes(SandboxStatus status) {
        def result = []
        def query = new StringBuilder('SELECT * FROM sandboxes ')
        if (status) {
            query.append(' WHERE status = ? ')
        }
        query.append(" ORDER BY created_on ASC")
        def rawResults = status ? sql.rows(query.toString(), [status?.name()]) : sql.rows(query.toString())
        result.addAll(rawResults.collect { map(it) })
        return result
    }

    private SandboxData map(GroovyRowResult row) {
        SandboxData data = new SandboxData()
        data.username = row.username
        data.containerId = row.container_id
        data.createdOn = row.created_on
        data.terminatedOn = row.terminated_on
        data.sandboxId = row.sandbox_id
        data.status = SandboxStatus.valueOf(row.status)
        data.statusRefreshedOn = row.status_refreshed_on
        data.terminatedOn = row.terminated_on
        data.uri = row.uri
        return data
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
