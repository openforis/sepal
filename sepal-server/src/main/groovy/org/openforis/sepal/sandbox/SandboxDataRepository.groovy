package org.openforis.sepal.sandbox

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE

/**
 * Created by ottavio on 02/11/15.
 */
interface SandboxDataRepository {

    Boolean alive(int sandboxId)

    void terminated(int sandboxId)

    int created(String username, String containerId)

    void started(int sandboxId, String sandboxURI)

    List<SandboxData> getSandboxes(SandboxStatus status)

    SandboxData getUserRunningSandbox( String username)

}

class JDBCSandboxDataRepository implements SandboxDataRepository{

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SqlConnectionProvider connectionProvider

    JDBCSandboxDataRepository(SqlConnectionProvider connectionProvider){
        super()
        this.connectionProvider = connectionProvider
    }

    @Override
    Boolean alive(int sandboxId) {
        def result = sql.executeUpdate('''
          UPDATE  sandboxes SET status = ?, status_refreshed_on = ?
          WHERE sandbox_id = ?''',[ALIVE.name(), new Date(), sandboxId])
        return result > 0
    }


    @Override
    void terminated(int sandboxId) {
        def now = new Date()
        sql.executeUpdate('''
            UPDATE sandboxes SET status = ?, status_refreshed_on = ?, terminated_on =?
            WHERE sandbox_id = ?''',[SandboxStatus.TERMINATED.name(),now,now,sandboxId])
    }

    @Override
    void started(int sandboxId, String sandboxURI) {
        sql.executeUpdate(' UPDATE sandboxes SET status = ?,  status_refreshed_on = ?, uri = ? WHERE sandbox_id = ?',[SandboxStatus.RUNNING.name(), new Date(), sandboxURI, sandboxId])
    }

    @Override
    int created(String username, String containerId) {
        def keys = sql.executeInsert('INSERT INTO sandboxes(username,container_id) VALUES(?,?)',[username,containerId])
        return keys[0][0] as int
    }

    @Override
    SandboxData getUserRunningSandbox(String username) {
        def returnData = null
        def rows = sql.rows(' SELECT * FROM sandboxes WHERE username = ? AND status = ? ',[username, ALIVE.name()])
        if (rows){
            if (rows.size() > 1){
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
        if (status){
            query.append(' WHERE status = ? ')
        }
        query.append(" ORDER BY created_on ASC")
        def rawResults = status ? sql.rows(query.toString(),[status?.name()]) : sql.rows(query.toString())
        result.addAll (rawResults.collect { map(it)  })
        return result
    }

    private SandboxData map( GroovyRowResult row){
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
