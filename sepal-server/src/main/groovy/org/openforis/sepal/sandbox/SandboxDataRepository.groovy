package org.openforis.sepal.sandbox

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import org.openforis.sepal.instance.Instance
import org.openforis.sepal.instance.Instance.Status
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE
import static org.openforis.sepal.sandbox.SandboxStatus.REQUESTED

interface SandboxDataRepository {

    Boolean alive(int sandboxId)

    void terminated(int sandboxId)

    void created(int sandboxId, String containerId, String sandboxURI)

    int requested(String username,long instanceId, Size sandboxSize)

    List<SandboxData> getSandboxes(SandboxStatus status,String username,  Size sandboxSize)

    List<SandboxData> getSandboxes(SandboxStatus status)

    SandboxData getUserSandbox(String username, Size sandboxSize)

    SandboxData getUserSandbox(String username)


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
    int requested(String username, long instanceId, Size sandboxSize) {
        def keys = sql.executeInsert('''
            INSERT INTO sandboxes(username,status,status_refreshed_on,instance_id,size )
            VALUES(?,?,?,?,?)''', [username,REQUESTED.name(), new Date(),instanceId,sandboxSize.value])
        return keys[0][0] as int
    }


    SandboxData getUserSandbox(String username, Size size = null) {
        def sandboxes = getSandboxes(null,username,size)
        return sandboxes ? sandboxes.first() : null
    }


    List<SandboxData> getSandboxes(SandboxStatus status = null,String username = null, Size sandboxSize = null) {
        def result = []
        def query = new StringBuilder(buildSelectFromStatement())
        query.append(' WHERE 1 = 1')
        def bindings =  []
        if (username) {
            query.append(' AND sb.username = ? ')
            bindings.add(username)
        }
        if (status) {
            query.append(' AND sb.status = ? ')
            bindings.add(status.name())
        }
        if (sandboxSize) {
            query.append(' AND sb.size = ? ')
            bindings.add(sandboxSize.getValue())
        }
        query.append(" ORDER BY sb.created_on ASC")
        def rawResults = sql.rows(query.toString(),bindings)
        result.addAll(rawResults.collect { map(it) })
        return result
    }

    private SandboxData map(GroovyRowResult row) {
        new SandboxData(
                uri: row.sbURI, size: Size.byValue(row.sbSize), status: SandboxStatus.valueOf(row.sbStatus),  username: row.sbUser,
                containerId: row.sbContId, createdOn: row.sbCreatedOn, terminatedOn: row.sbTerminatedOn, sandboxId: row.sbId, statusRefreshedOn: row.sbRefreshedOn,
                instance: new Instance(id: row.inId, status: Status.valueOf(row.inStatus), publicIp: row.inPubIP,privateIp: row.inPrvIP, owner: row.inOwner, name: row.inName)
                )
    }

    private static String buildSelectFromStatement(){
        def sb = new StringBuilder('SELECT sb.size AS sbSize, sb.sandbox_id AS sbId, sb.username AS sbUser, sb.status AS sbStatus,sb.container_id AS sbContId, sb.uri AS sbURI,  ')
        sb.append(' sb.created_on AS sbCreatedOn, sb.terminated_on AS sbTerminatedOn,sb.status_refreshed_on AS sbRefreshedOn, ')
        sb.append(' in.id AS inId, in.status AS inStatus, in.public_ip  AS inPubIP, in.private_ip AS inPrvIP, in.owner AS inOwner, in.name AS inName, ')
        sb.append(' in.reserved AS inReserved, in.capacity AS inCapacity ')
        sb.append(' FROM sandboxes sb INNER JOIN instances in ON sb.instance_id = in.id' )
        return sb.toString()
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
