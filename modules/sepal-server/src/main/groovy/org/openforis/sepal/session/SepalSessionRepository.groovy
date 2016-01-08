package org.openforis.sepal.session

import groovy.sql.Sql
import org.openforis.sepal.instance.DataCenter
import org.openforis.sepal.instance.Instance
import org.openforis.sepal.instance.Instance.Status
import org.openforis.sepal.instance.InstanceProvider
import org.openforis.sepal.instance.InstanceType
import org.openforis.sepal.session.model.MonthlySessionStatusReport
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.session.model.SessionStatus
import org.openforis.sepal.transaction.SqlConnectionProvider
import org.openforis.sepal.util.SandboxUtils
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.session.model.SessionStatus.ALIVE
import static org.openforis.sepal.session.model.SessionStatus.REQUESTED

interface SepalSessionRepository {

    Boolean alive(int sessionId)

    void terminated(int sessionId)

    Boolean updateStatus(int sessionId, SessionStatus status)

    void created(int sessionId, String containerId, String sandboxURI)

    int requested(String username, long instanceId)

    SepalSession fetchUserSession(String username, Long sessionId)

    List<SepalSession> getSessions(SessionStatus... statuses)

    List<SepalSession> getSessions(String username, SessionStatus... statuses)

    List<SepalSession> getSessions(String username, Long sessionId, SessionStatus... statuses)

    MonthlySessionStatusReport getMonthlyCostsReport(String username)


}

class JDBCSepalSessionRepository implements SepalSessionRepository {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final SqlConnectionProvider connectionProvider

    JDBCSepalSessionRepository(SqlConnectionProvider connectionProvider) {
        super()
        this.connectionProvider = connectionProvider
    }

    @Override
    Boolean alive(int sessionId) { updateStatus(sessionId, SessionStatus.ALIVE) }


    @Override
    void terminated(int sessionId) {
        def now = new Date()
        sql.executeUpdate('''
            UPDATE sandbox_sessions SET status = ?, status_refreshed_on = ?, terminated_on =?
            WHERE session_id = ?''', [SessionStatus.TERMINATED.name(), now, now, sessionId])
    }

    @java.lang.Override
    Boolean updateStatus(int sessionId, SessionStatus status) {
        def result = sql.executeUpdate('''
          UPDATE  sandbox_sessions SET status = ?, status_refreshed_on = ?
          WHERE session_id = ?''', [status?.name(), new Date(), sessionId])
        return result > 0
    }

    @Override
    void created(int sessionId, String containerId, String sandboxURI) {
        sql.executeUpdate('''
            UPDATE sandbox_sessions SET container_id = ?, status = ?, status_refreshed_on = ?, container_uri = ?
            WHERE session_id = ?''',
                [containerId, ALIVE.name(), new Date(), sandboxURI, sessionId])
    }

    @Override
    int requested(String username, long instanceId) {
        def keys = sql.executeInsert('''
            INSERT INTO sandbox_sessions(username,status,status_refreshed_on,instance_id)
            VALUES(?,?,?,?)''', [username, REQUESTED.name(), new Date(), instanceId])
        return keys[0][0] as int
    }

    @Override
    List<SepalSession> getSessions(String username, SessionStatus... statuses) { getSessions(username, null, statuses) }

    @Override
    List<SepalSession> getSessions(SessionStatus... statuses) { getSessions(null, statuses) }

    @Override
    SepalSession fetchUserSession(String username, Long sessionId) {
        def sessions = getSessions(username, sessionId, REQUESTED, ALIVE)
        if (!sessions) {
            throw new InvalidSession("Unable to fetch session $sessionId for user $username")
        }
        return sessions.first()
    }

    List<SepalSession> getSessions(String username, Long sessionId, SessionStatus[] statuses) {
        def sessions = []
        def sBuilder = new StringBuilder(' SELECT * FROM v_session_status')
        def bindings = []
        sBuilder.append(' WHERE 1 = 1 ')
        if (username) {
            sBuilder.append(' AND username = ? ')
            bindings.add(username)
        }
        if (statuses) {
            sBuilder.append(' AND status IN (')
            int count = 0

            statuses.each {
                sBuilder.append(count++ > 0 ? ',?' : '?')
                bindings.add(it.name())
            }
            sBuilder.append(')')
        }
        if (sessionId) {
            sBuilder.append(" AND id = ?")
            bindings.add(sessionId)
        }
        sBuilder.append(' ORDER BY created_on ASC')
        sql.eachRow(sBuilder.toString(), bindings) {
            sessions.add(map(it))
        }
        return sessions
    }

    @Override
    MonthlySessionStatusReport getMonthlyCostsReport(String username) {
        def monthlyReport = new MonthlySessionStatusReport(username)
        def sqlQuery = '''SELECT * FROM v_session_status where username = ?
                    AND (cnt_inst_end_time IS NULL OR MONTH(cnt_inst_end_time) = MONTH(NOW()))'''
        sql.eachRow(sqlQuery, [username]) {
            monthlyReport.addMonthlySession(map(it))
        }
        return monthlyReport
    }

    private static  SepalSession map(row) {

        def provider = new InstanceProvider(id: row.cnt_inst_prov_id, name: row.cnt_inst_prov_name, description: row.cnt_inst_prov_descr)
        def dataCenter = new DataCenter(
                id: row.cnt_inst_dc_id, name: row.cnt_inst_dc_name, geolocation: row.cnt_inst_dc_location, description: row.cnt_inst_dc_description, provider: provider
        )
        def instanceType = new InstanceType(
                id: row.cnt_inst_type_id, name: row.cnt_inst_type_name, description: row.cnt_inst_type_descr,
                hourlyCosts: row.cnt_inst_type_hourly_costs, cpuCount: row.cnt_inst_type_cpu_count,
                ramMemory: row.cnt_inst_type_ram_count, notes: row.cnt_inst_type_notes, enabled: row.cnt_inst_type_enabled
        )
        def instance = new Instance(
                id: row.cnt_inst_id, status: Status.valueOf(row.cnt_inst_status), publicIp: row.cnt_inst_pub_ip,
                privateIp: row.cnt_inst_priv_ip, owner: row.cnt_inst_owner, name: row.cnt_inst_name,
                launchTime: row.cnt_inst_start_time, terminationTime: row.cnt_inst_end_time, statusUpdateTime: row.cnt_inst_updated_on,
                dataCenter: dataCenter, instanceType: instanceType,
        )

        def session = new SepalSession(
                sessionId: row.id, username: row.username, status: SessionStatus.valueOf(row.status),
                createdOn: row.created_on, statusRefreshedOn: row.updated_on, terminatedOn: row.terminated_on,
                containerId: row.cnt_id, containerURI: row.cnt_uri, instance: instance
        )

        SandboxUtils.calculateCosts(session)

        return session



    }


    private Sql getSql() {
        connectionProvider.sql
    }
}
