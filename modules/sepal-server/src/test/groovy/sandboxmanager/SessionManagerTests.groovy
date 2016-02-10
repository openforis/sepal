package sandboxmanager

import fake.Database
import fake.SynchronousJobExecutor
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.PendingSession
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.command.*
import org.openforis.sepal.component.sandboxmanager.query.*
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.QueryFailed
import spock.lang.Specification

import java.util.concurrent.TimeUnit

import static java.util.concurrent.TimeUnit.HOURS
import static org.openforis.sepal.hostingservice.Status.ACTIVE
import static org.openforis.sepal.hostingservice.Status.STARTING

class SessionManagerTests extends Specification {
    def someUserName = 'some-username'
    def anotherUserName = 'another-username'
    def someInstanceType = 'some-instance-type'
    def future = new Date() + 10

    def clock = new FakeClock()
    def instanceProvider = new FakeWorkerInstanceProvider()
    def sessionProvider = new FakeSandboxSessionProvider(clock)
    def component = new SandboxManagerComponent(
            new Database().dataSource,
            new PoolingWorkerInstanceManager(instanceProvider, [:], new SynchronousJobExecutor()),
            sessionProvider, clock
    )

    def cheapType = new WorkerInstanceType(id: 'cheap', hourlyCost: 1)
    def expensiveType = new WorkerInstanceType(id: 'expensive', hourlyCost: 2)

    def 'Given no sandbox sessions have been created, when loading sandbox info, no sessions are included'() {
        when:
        def info = loadSandboxInfo()

        then:
        info.activeSessions.empty
        info.startingSessions.empty
    }

    def 'When loading sandbox info, instance types are included'() {
        when:
        def info = loadSandboxInfo()

        then:
        info.instanceTypes == instanceProvider.instanceTypes
    }


    def 'When loading sandbox info, monthly instance spending is calculated'() {
        clock.set('2016-01-01')
        runSession(cheapType, 2, HOURS)
        runSession(expensiveType, 3, HOURS)
        runSession(expensiveType, 1, HOURS)

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyInstanceSpending == cheapType.hourlyCost * 2 + expensiveType.hourlyCost * 3 + expensiveType.hourlyCost * 1
    }

    def 'When loading sandbox info, instance spending from past months are excluded'() {
        clock.set('2016-01-01')
        runSession(cheapType, 2, HOURS)
        runSession(expensiveType, 3, HOURS)
        clock.set('2016-02-01')

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyInstanceSpending == 0
    }

    def 'When loading sandbox info, instance spending from active sessions are included'() {
        clock.set('2016-01-01')
        createSession(cheapType)
        clock.set('2016-01-02')

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyInstanceSpending == 24 * cheapType.hourlyCost
    }

    def 'When loading sandbox info, monthly instance budget is included'() {
        specifyInstanceBudget(123)
        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyInstanceBudget == 123
    }

    def 'When loading sandbox info, monthly spending from active sessions started in past months are included'() {
        clock.set('2016-01-31')
        createSession(cheapType)
        clock.set('2016-02-02')

        when:
        def info = loadSandboxInfo()

        then:
        info.monthlyInstanceSpending == 24 * cheapType.hourlyCost
    }

    void runSession(WorkerInstanceType instanceType, int time, TimeUnit timeUnit) {
        createSession(instanceType)
        clock.forward(time, timeUnit)
        closeTimedOutSessions(clock.now())
    }

    def 'When creating a session, the returned session is populated'() {
        when:
        def session = createSession(someUserName)

        then:
        session.id
        session.username == someUserName
        session.instanceType == someInstanceType
        session.host
        session.port
        session.status == ACTIVE
        session.creationTime
        session.updateTime
        !session.terminationTime
    }

    def 'Given no idle instances, when creating a session, the returned session is starting'() {
        instanceProvider.noIdle()

        when:
        def session = createSession(someUserName)

        then:
        session.status == STARTING
        hasNoActiveSessions()
        hasOneStartingSession()
    }

    def 'When creating a session, it is added to the active sessions, an instance is allocated, and a sandbox is deployed on that instance'() {
        when:
        createSession()

        then:
        hasOneActiveSessions()
        def instance = instanceProvider.launchedOne()
        sessionProvider.deployedOneTo(instance)
    }

    def 'An session can be loaded'() {
        def session = createSession()

        when:
        def loadedSession = loadSession(session.id)

        then:
        loadedSession
    }

    def 'When loading another users session, an exception is thrown'() {
        def session = createSession(someUserName)

        when:
        loadSession(anotherUserName, session.id)

        then:
        thrown QueryFailed
    }

    def 'When loading sandbox info, only specified user sessions are included'() {
        createSession(anotherUserName)

        expect:
        loadSandboxInfo(someUserName).activeSessions.empty
    }

    def 'When loading sandbox info, host and port of active sessions is specified'() {
        def session = createSession()

        when:
        def activeSessions = loadSandboxInfo(someUserName).activeSessions

        then:
        def activeSession = activeSessions.first()
        activeSession.host == session.host
        activeSession.port == session.port
    }

    def 'Given no sessions pending deployment, when finding pending sessions, none are returned'() {
        createSession()

        expect:
        findSessionsPendingDeployment(future).empty
    }

    def 'Given a session been created but failed while deploying, when finding pending sessions, that session is returned'() {
        createSessionButFailToDeploy()

        expect:
        findSessionsPendingDeployment(future).size() == 1
        hasNoActiveSessions()
    }

    def 'Given an active session, when joining that session, update timestamp is updated and the session is returned'() {
        def session = createSession()
        Thread.sleep(10)

        when:
        def joinedSession = joinSession(session.id, session.username)

        then:
        joinedSession.updateTime > session.updateTime
        joinedSession.id == session.id
    }

    def 'When joining a non-existing session, an exception is thrown'() {
        def nonExistingSessionId = 123

        when:
        joinSession(nonExistingSessionId, someUserName)

        then:
        thrown ExecutionFailed
    }

    def 'When joining another users session, an exception is thrown'() {
        def session = createSession(anotherUserName)

        when:
        joinSession(session.id, someUserName)

        then:
        thrown ExecutionFailed
    }

    def 'When joining a non-active session, an exception is thrown'() {
        def session = createStartingSession()

        when:
        joinSession(session.id)

        then:
        thrown ExecutionFailed
    }

    def 'Given a timed out session, when closing timed out sessions, session is undeployed and is no longer active'() {
        createSession()

        when:
        closeTimedOutSessions(future)

        then:
        sessionProvider.noneDeployed()
        hasNoActiveSessions()
    }


    def 'Given a starting, timed out session, when closing timed out sessions, session is undeployed and is no longer active'() {
        createStartingSession()

        when:
        closeTimedOutSessions(future)

        then:
        sessionProvider.noneDeployed()
        hasNoActiveSessions()
    }

    def 'Given an instance with only a stopped session, when terminating redundant instances, the instance is offered for termination'() {
        createSession()
        closeTimedOutSessions(future)

        when:
        terminateRedundantInstances()

        then:
        instanceProvider.has(terminated: 1)
    }

    def 'Given an instance with a stopped and active sessions, when terminating redundant instances, the instance is not offered for termination'() {
        instanceProvider.useId('some id')
        createSession()
        closeTimedOutSessions(future)
        createSession()

        when:
        terminateRedundantInstances()

        then:
        instanceProvider.has(reserved: 1)
    }

    def 'Given an instance with a terminated session, when terminating redundant instances, the instance is not offered for termination'() {
        createSession()
        closeTimedOutSessions(future)
        terminateRedundantInstances()

        when:
        terminateRedundantInstances()

        then:
        instanceProvider.terminationRequests == 1
    }

    def 'Given a non-available session, when joining that session, an exception is thrown and session can be offered for termination'() {
        def session = createSession()
        sessionProvider.notAvailable()

        when:
        joinSession(session.id)

        then:
        thrown ExecutionFailed
        hasNoActiveSessions()
        terminateRedundantInstances()
        instanceProvider.has(terminated: 1)
    }

    def 'Given an active session, when session heartbeat is received, update timestamp is updated'() {
        def session = createSession()
        Thread.sleep(10)

        when:
        sendHeartbeat(session.id)

        then:
        def updatedSession = firstActiveSession()
        updatedSession.updateTime > session.updateTime
    }

    def 'When finding instance types, the instance types from the instance provider are returned'() {
        when:
        def instanceTypes = findInstanceTypes()

        then:
        instanceTypes == instanceProvider.instanceTypes
    }

    def 'When closing a session, it is undeployed and is no longer active'() {
        def session = createSession()

        when:
        closeSession(session)

        then:
        sessionProvider.noneDeployed()
        hasNoActiveSessions()
    }

    SandboxSession createSession(String username = someUserName, String instanceType = someInstanceType) {
        instanceProvider.launchIdle(instanceType)
        component.submit(new CreateSession(username: username, instanceType: instanceType))
    }

    SandboxSession createStartingSession(String username = someUserName, String instanceType = someInstanceType) {
        instanceProvider.noIdle()
        component.submit(new CreateSession(username: username, instanceType: instanceType))
    }

    SandboxSession createSession(String username = someUserName, WorkerInstanceType instanceType) {
        instanceProvider.addType(instanceType)
        component.submit(new CreateSession(username: username, instanceType: instanceType.id))
    }


    void createSessionButFailToDeploy(String username = someUserName) {
        sessionProvider.failing()
        try {
            createSession(username)
        } catch (ExecutionFailed ignore) {}
    }

    SandboxSession joinSession(long sessionId, String username = someUserName) {
        component.submit(new JoinSession(username: username, sessionId: sessionId))
    }

    void sendHeartbeat(long sessionId, String username = someUserName) {
        component.submit(new SessionHeartbeatReceived(username: username, sessionId: sessionId))
    }

    SandboxInfo loadSandboxInfo(String username = someUserName) {
        component.submit(new LoadSandboxInfo(username: username))
    }

    void closeTimedOutSessions(Date updatedBefore) {
        component.submit(new CloseTimedOutSessions(updatedBefore: updatedBefore))
    }

    def closeSession(SandboxSession session) {
        component.submit(new CloseSession(username: session.username, sessionId: session.id))
    }

    void terminateRedundantInstances() {
        component.submit(new TerminateRedundantInstances())
    }

    List<PendingSession> findSessionsPendingDeployment(Date createdBefore, String username = someUserName) {
        component.submit(new FindSessionsPendingDeployment(username: username, createdBefore: createdBefore))
    }

    List<WorkerInstanceType> findInstanceTypes() {
        component.submit(new FindInstanceTypes())
    }

    SandboxSession loadSession(String username = someUserName, long sessionId) {
        component.submit(new LoadSession(username: username, sessionId: sessionId))
    }


    void specifyInstanceBudget(String username = someUserName, int budget) {
        component.submit(new UpdateUserBudget(username: username, monthlyInstanceBudget: budget))
    }

    SandboxSession firstActiveSession(String username = someUserName) {
        def activeSessions = loadSandboxInfo(username).activeSessions
        assert !activeSessions.empty
        return activeSessions.first()
    }

    void hasNoActiveSessions(String username = someUserName) {
        def activeSessions = loadSandboxInfo(username).activeSessions
        assert activeSessions.empty
    }

    void hasOneActiveSessions(String username = someUserName) {
        def activeSessions = loadSandboxInfo(username).activeSessions
        assert activeSessions.size() == 1
    }


    void hasOneStartingSession(String username = someUserName) {
        def startingSessions = loadSandboxInfo(username).startingSessions
        assert startingSessions.size() == 1
    }
}

