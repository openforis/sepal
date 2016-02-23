package sandboxmanager

import fake.Database
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionFailed
import org.openforis.sepal.component.sandboxmanager.command.*
import org.openforis.sepal.component.sandboxmanager.event.SessionAlive
import org.openforis.sepal.component.sandboxmanager.event.SessionClosed
import org.openforis.sepal.component.sandboxmanager.event.SessionCreated
import org.openforis.sepal.component.sandboxmanager.event.SessionDeployed
import org.openforis.sepal.component.sandboxmanager.query.FindInstanceTypes
import org.openforis.sepal.component.sandboxmanager.query.LoadSandboxInfo
import org.openforis.sepal.component.sandboxmanager.query.LoadSession
import org.openforis.sepal.component.sandboxmanager.query.SandboxInfo
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.EventHandler
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.QueryFailed
import spock.lang.Specification

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

import static java.util.concurrent.TimeUnit.HOURS
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.ACTIVE
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.STARTING

class SessionManagerTests extends Specification {
    def someUserName = 'some-username'
    def anotherUserName = 'another-username'
    def someInstanceType = 'some-instance-type'
    def future = new Date() + 10

    def clock = new FakeClock()
    def instanceProvider = new FakeWorkerInstanceProvider(clock: clock)
    def sessionProvider = new FakeSandboxSessionProvider(clock)
    def component = new SandboxManagerComponent(
            new Database().dataSource,
            new PoolingWorkerInstanceManager(instanceProvider, [:], clock),
            sessionProvider, clock
    )

    def cheapType = new WorkerInstanceType(id: 'cheap', hourlyCost: 1)
    def expensiveType = new WorkerInstanceType(id: 'expensive', hourlyCost: 2)
    def eventHandler = new CollectingEventHandler()

    def setup() {
        component.register(Event, eventHandler)
    }

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
        info.instanceTypes == instanceProvider.instanceTypes()
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

    def 'When creating a session, the returned session is populated'() {
        runningIdle()

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
    }

    def 'When creating a session, it is added to the active sessions, an instance is allocated, and a sandbox is deployed on that instance'() {
        runningIdle()

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
        runningIdle()
        def session = createSession()

        when:
        def activeSessions = loadSandboxInfo(someUserName).activeSessions

        then:
        def activeSession = activeSessions.first()
        activeSession.host == session.host
        activeSession.port == session.port
    }

    // TODO: Test failing to reserve, deploy

    def 'Given an active session, when joining that session, update timestamp is updated and the session is returned'() {
        runningIdle()
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
        eventHandler.eventTypes == []
    }

    def 'When joining another users session, an exception is thrown, but session is not closed'() {
        runningIdle()
        def session = createSession(anotherUserName)
        eventHandler.clear()

        when:
        joinSession(session.id, someUserName)

        then:
        thrown ExecutionFailed
        instanceProvider.has(reserved: 1)
        eventHandler.eventTypes == []
    }

    def 'When joining a closed session, an exception is thrown'() {
        runningIdle()
        def session = createSession()
        closeTimedOutSessions(future)
        eventHandler.clear()

        when:
        joinSession(session.id)

        then:
        thrown ExecutionFailed
        eventHandler.eventTypes == []
    }

    def 'When joining an active session without an available instance, an exception is thrown and session is closed'() {
        runningIdle()
        def session = createSession()
        instanceProvider.terminate(session.instanceId)
        eventHandler.clear()

        when:
        joinSession(session.id)

        then:
        thrown ExecutionFailed
        hasNoActiveSessions(anotherUserName)
        eventHandler.eventTypes == [SessionClosed]
    }

    def 'When joining an active session without an available sandbox, an exception is thrown and session is closed'() {
        runningIdle()
        def session = createSession()
        sessionProvider.undeploy(session)

        when:
        joinSession(session.id)

        then:
        thrown ExecutionFailed
        hasNoActiveSessions(anotherUserName)
    }

    def 'When joining a starting session, session status is STARTING'() {
        def session = createSession()

        when:
        def joinedSession = joinSession(session.id)

        then:
        joinedSession.status == STARTING
    }

    def 'Given a timed out session, when closing timed out sessions, session is undeployed and is no longer active'() {
        runningIdle()
        createSession()

        when:
        closeTimedOutSessions(future)

        then:
        sessionProvider.noneDeployed()
        hasNoActiveSessions()
    }

    def 'Given a timed out session, when sending heartbeat, session is no longer timed out'() {
        clock.set('2016-01-01', '00:00:00')
        runningIdle()
        def session = createSession()
        clock.set('2016-01-01', '01:00:00')

        when:
        joinSession(session.id)

        then:
        closeTimedOutSessions(clock.now())
        hasOneActiveSessions()
    }


    def 'Given a starting, timed out session, when closing timed out sessions, session is undeployed and is no longer active'() {
        createStartingSession()

        when:
        closeTimedOutSessions(future)

        then:
        sessionProvider.noneDeployed()
        hasNoActiveSessions()
    }

    def 'Given an instance with a stopped session and 5 minutes is left until instance is charged, when updating instances, the instance is terminated'() {
        clock.set('2016-01-01', '00:00:00')
        runningIdle()
        createSession()
        closeTimedOutSessions(future)
        clock.set('2016-01-01', '00:55:00')

        when:
        updateInstances()

        then:
        instanceProvider.has(terminated: 1)
    }

    def 'Given an instance with a stopped session and 5 minutes is left until instance is charged, when updating instances, the instance is idle'() {
        clock.set('2016-01-01', '00:00:00')
        runningIdle()
        createSession()
        closeTimedOutSessions(future)
        clock.set('2016-01-01', '00:54:59')

        when:
        updateInstances()

        then:
        instanceProvider.has(idle: 1)
    }

    def 'Given an instance that already been terminated, when updating instances, a second attempt to terminate is not made'() {
        clock.set('2016-01-01', '00:00:00')
        runningIdle()
        createSession()
        closeTimedOutSessions(future)
        clock.set('2016-01-01', '00:55:00')
        updateInstances()

        when:
        updateInstances()

        then:
        instanceProvider.terminationRequests == 1
    }

    def 'Given a non-available session, when joining that session, an exception is thrown and instance is terminated'() {
        clock.set('2016-01-01', '00:00:00')
        runningIdle()
        def session = createSession()
        sessionProvider.notAvailable()
        clock.set('2016-01-01', '00:55:00')

        when:
        joinSession(session.id)

        then:
        thrown ExecutionFailed
        hasNoActiveSessions()

        when:
        updateInstances()

        then:
        instanceProvider.has(terminated: 1)
    }


    def 'When finding instance types, the instance types from the instance provider are returned'() {
        when:
        def instanceTypes = findInstanceTypes()

        then:
        instanceTypes == instanceProvider.instanceTypes()
    }

    def 'When closing a session, it is undeployed, instance is returned to idle, and is no longer active'() {
        runningIdle()
        def session = createSession()

        when:
        closeSession(session)

        then:
        sessionProvider.noneDeployed()
        instanceProvider.has(idle: 1)
        hasNoActiveSessions()
    }

    def 'Given no idle instances, when creating a session, the returned session has a host, no port and is starting'() {
        when:
        def session = createSession(someUserName)

        then:
        session.host
        !session.port
        session.status == STARTING
        hasNoActiveSessions()
        hasOneStartingSession()
    }

    def 'Given no idle instances, when creating session, instance is reserved, but sandbox is not deployed'() {
        when:
        createSession()

        then:
        sessionProvider.noneDeployed()
        instanceProvider.has(reserved: 1)
    }

    def 'Given a starting session with a running instance, when deploying starting sessions, session is deployed and activated'() {
        def session = createSession()
        def instance = instanceProvider.started(session.instanceId)

        when:
        deployStartingSessions()

        then:
        sessionProvider.deployedOneTo(instance)
        def info = loadSandboxInfo()
        info.activeSessions.size() == 1
    }

    def 'Given a starting session without a running instance, when deploying starting sessions, session is not deployed'() {
        createSession()

        when:
        component.submit(new DeployStartingSessions())

        then:
        sessionProvider.noneDeployed()
    }

    def 'Given a session on a terminated instance, when joining, SandboxSessionProvider.NotAvailable is thrown and session is not available anymore'() {
        runningIdle()
        def session = createSession()
        instanceProvider.terminate(session.instanceId)

        when:
        joinSession(session.id)

        then:
        def e = thrown ExecutionFailed
        e.cause instanceof SessionFailed
        def info = loadSandboxInfo()
        info.activeSessions.size() == 0
    }

    def 'Given a session on a terminated instance, when closing, session is not available anymore'() {
        runningIdle()
        def session = createSession()
        instanceProvider.terminate(session.instanceId)

        when:
        closeSession(session)

        then:
        def info = loadSandboxInfo()
        info.activeSessions.size() == 0
    }

    def 'Given a session on a terminated instance, when closing timed out sessions, session is not available anymore'() {
        runningIdle()
        def session = createSession()
        instanceProvider.terminate(session.instanceId)

        when:
        closeTimedOutSessions(future)

        then:
        def info = loadSandboxInfo()
        info.activeSessions.size() == 0
    }

    def 'Given no idle instances, when session is created, create event is published'() {
        when:
        createSession()

        then:
        eventHandler.eventTypes == [SessionCreated]
    }

    def 'Given an idle instance, when session is created, create and deploy event is published'() {
        runningIdle()

        when:
        createSession()

        then:
        eventHandler.eventTypes == [SessionCreated, SessionDeployed]
    }

    def 'When starting session is deployed, event is published'() {
        def session = createSession()
        eventHandler.clear()
        instanceProvider.started(session.instanceId)

        when:
        deployStartingSessions()

        then:
        eventHandler.eventTypes == [SessionDeployed]
    }

    def 'When sending heartbeat, event is published'() {
        def session = createSession()
        eventHandler.clear()

        when:
        joinSession(session.id)

        then:
        eventHandler.eventTypes == [SessionAlive]
    }

    def 'When session is closed, event is published'() {
        def session = createSession()
        eventHandler.clear()

        when:
        closeSession(session)

        then:
        eventHandler.eventTypes == [SessionClosed]
    }

    def 'When timed out session is closed, event is published'() {
        createSession()
        createSession()
        eventHandler.clear()

        when:
        closeTimedOutSessions(future)

        then:
        eventHandler.eventTypes == [SessionClosed, SessionClosed]
    }

    void runSession(WorkerInstanceType instanceType, int time, TimeUnit timeUnit) {
        createSession(instanceType)
        clock.forward(time, timeUnit)
        closeTimedOutSessions(clock.now())
    }

    SandboxSession createSession(String username = someUserName, String instanceType = someInstanceType) {
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

    private void deployStartingSessions() {
        component.submit(new DeployStartingSessions())
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

    SandboxInfo loadSandboxInfo(String username = someUserName) {
        component.submit(new LoadSandboxInfo(username: username))
    }

    void closeTimedOutSessions(Date updatedBefore) {
        component.submit(new CloseTimedOutSessions(updatedBefore: updatedBefore))
    }

    def closeSession(SandboxSession session) {
        component.submit(new CloseSession(username: session.username, sessionId: session.id))
    }

    void updateInstances() {
        component.submit(new UpdateInstanceStates())
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

    WorkerInstance runningIdle(String instanceType = someInstanceType) {
        instanceProvider.runningIdle(instanceType)
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

    static class CollectingEventHandler implements EventHandler<Event> {
        List<Event> events = new CopyOnWriteArrayList<>()

        void handle(Event event) {
            events << event
        }

        List<Class<Event>> getEventTypes() {
            events.collect { it.class }
        }

        void clear() {
            events.clear()
        }
    }
}

