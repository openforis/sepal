package sandboxmanager

import fake.Database
import fake.FakeStorageUsageChecker
import groovy.sql.Sql
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.Budget
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.command.*
import org.openforis.sepal.component.sandboxmanager.query.FindInstanceTypes
import org.openforis.sepal.component.sandboxmanager.query.LoadSandboxInfo
import org.openforis.sepal.component.sandboxmanager.query.LoadSession
import org.openforis.sepal.component.sandboxmanager.query.SandboxInfo
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.EventHandler
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType
import spock.lang.Specification

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

abstract class AbstractSandboxManagerTest extends Specification {
    def someUserName = 'some-username'
    def anotherUserName = 'another-username'
    def someInstanceType = 'some-instance-type'
    def future = new Date() + 10

    def clock = new FakeClock()
    def instanceProvider = new FakeWorkerInstanceProvider(clock: clock)
    def sessionProvider = new FakeSandboxSessionProvider(clock)
    def storageUsageChecker = new FakeStorageUsageChecker()
    def hostingService = new FakeHostingService(instanceProvider, clock, 0.3)
    def database = new Database()
    def component = new SandboxManagerComponent(
            database.dataSource,
            hostingService,
            sessionProvider,
            storageUsageChecker,
            clock
    )

    def cheapType = new WorkerInstanceType(id: 'cheap', hourlyCost: 1)
    def expensiveType = new WorkerInstanceType(id: 'expensive', hourlyCost: 2)
    def eventHandler = new CollectingEventHandler()

    def setup() {
        insertUser(1, someUserName)
        insertUser(1, anotherUserName)
        component.register(Event, eventHandler)
    }

    private void insertUser(long userId, String username) {
        // TODO: Ugly setup of users
        def sql = new Sql(database.dataSource)
        sql.executeInsert('INSERT INTO users(username, created_at, user_uid) VALUES(?, ?, ?)',
                [username, new Date(), userId])
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

    void deployStartingSessions() {
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

    void updateStorageUsage(double usage) {
        storageUsageChecker.usage = usage
        component.submit(new UpdateStorageUsage())
    }

    void checkBudget() {
        component.submit(new CheckBudget())
    }

    List<WorkerInstanceType> findInstanceTypes() {
        component.submit(new FindInstanceTypes())
    }

    SandboxSession loadSession(String username = someUserName, long sessionId) {
        component.submit(new LoadSession(username: username, sessionId: sessionId))
    }


    void specifyBudget(String username = someUserName, Budget budget) {
        component.submit(new UpdateUserBudget(
                username: username,
                budget: budget
        ))
    }


    void specifyInstanceBudget(String username = someUserName, int budget) {
        component.submit(new UpdateUserBudget(
                username: username,
                budget: new Budget(monthlyInstance: budget)
        ))
    }

    void specifyStorageQuota(String username = someUserName, int quota) {
        component.submit(new UpdateUserBudget(
                username: username,
                budget: new Budget(storageQuota: quota)
        ))
    }

    void specifyStorageBudget(String username = someUserName, int budget) {
        component.submit(new UpdateUserBudget(
                username: username,
                budget: new Budget(monthlyStorage: budget)
        ))
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

    void hasNoSessions(String username = someUserName) {
        def sandboxInfo = loadSandboxInfo(username)
        def activeSessions = sandboxInfo.activeSessions
        def startingSessions = sandboxInfo.startingSessions
        assert activeSessions.empty && startingSessions.empty
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
