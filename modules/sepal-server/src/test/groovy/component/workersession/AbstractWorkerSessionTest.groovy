package component.workersession

import fake.Database
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.component.workersession.api.Spending
import org.openforis.sepal.component.workersession.api.Timeout
import org.openforis.sepal.component.workersession.api.UserSessionReport
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSession.State
import org.openforis.sepal.component.workersession.command.*
import org.openforis.sepal.component.workersession.query.FindPendingOrActiveSession
import org.openforis.sepal.component.workersession.query.FindSessionById
import org.openforis.sepal.component.workersession.query.GenerateUserSessionReport
import org.openforis.sepal.component.workersession.query.UserWorkerSessions
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.SynchronousEventDispatcher
import sandboxmanager.FakeClock
import spock.lang.Specification

import java.util.concurrent.TimeUnit

abstract class AbstractWorkerSessionTest extends Specification {
    final database = new Database()
    final eventDispatcher = new SynchronousEventDispatcher()
    final instanceManager = new FakeInstanceManager()
    final budgetManager = new FakeBudgetManager()
    final clock = new FakeClock()
    final component = new WorkerSessionComponent(
            database.dataSource,
            eventDispatcher,
            budgetManager,
            instanceManager,
            clock)

    final events = [] as List<Event>

    final testWorkerType = 'test-worker-type'
    final testInstanceType = 'test-instance-type'
    final testUsername = 'test-user'

    def setup() {
        component.on(Event) { events << it }
    }

    final WorkerSession requestSession(Map args = [:]) {
        component.submit(new RequestSession(
                username: username(args),
                workerType: args.workerType ?: testWorkerType,
                instanceType: testInstanceType))
    }

    final WorkerSession pendingSession(Map args = [:]) {
        requestSession(args)
    }

    final WorkerSession activeSession(Map args = [:]) {
        def session = requestSession(args)
        instanceManager.activate(session.instance.id)
        return findSessionById(session.id)
    }

    final WorkerSession timedOutSession(Map args = [:]) {
        clock.set()
        def session = pendingSession(args)
        clock.set(Timeout.PENDING.willTimeout(clock.now()))
        return findSessionById(session.id)
    }


    final WorkerSession closedSession(Map args = [:]) {
        def session = pendingSession(args)
        closeSession(session, args)
        return findSessionById(session.id)
    }

    final void closeSession(WorkerSession session, Map args = [:]) {
        component.submit(new CloseSession(
                username: username(args),
                sessionId: session.id))
    }

    final void closeTimedOutSessions() {
        component.submit(new CloseTimedOutSessions())
    }

    final void closeUserSessions(Map args = [:]) {
        component.submit(new CloseUserSessions(username: username(args)))
    }

    final void sendHeartbeat(WorkerSession session, Map args = [:]) {
        component.submit(new Heartbeat(username: username(args), sessionId: session.id))
    }

    final WorkerSession findSessionById(String sessionId) {
        component.submit(new FindSessionById(sessionId))
    }

    final WorkerSession findActiveOrPendingSession(Map args = [:]) {
        component.submit(new FindPendingOrActiveSession(
                username: username(args),
                instanceType: args.instanceType ?: testInstanceType))
    }

    final List<WorkerSession> userWorkerSessions(Map args = [:]) {
        component.submit(new UserWorkerSessions(
                username: username(args),
                states: args.states ?: []))
    }

    final UserSessionReport generateUserSessionReport(Map args = [:]) {
        component.submit(new GenerateUserSessionReport(
                username: username(args),
                workerType: args.workerType ?: testWorkerType
        ))
    }

    final releaseUnusedInstances(int minAge, TimeUnit timeUnit) {
        component.submit(new ReleaseUnusedInstances(minAge, timeUnit))
    }

    final Spending specifyUserSpending(Spending spending, Map args = [:]) {
        budgetManager.specifyUserSpending(username(args), spending)
    }


    final <E extends Event> E published(Class<E> eventType) {
        def recievedEvent = events.find { it.class.isAssignableFrom(eventType) }
        assert recievedEvent, "Expected to event of type $eventType to have been published. Actually published $events"
        recievedEvent as E
    }

    final void noSessions(Map args = [:]) {
        def sessions = userWorkerSessions(args)
        assert sessions.empty,
                "Expected no session for ${username(args)}. User actually has ${sessions.size()}: $sessions"
    }

    final void noSessionIs(State state, Map args = [:]) {
        def sessions = userWorkerSessions(args)
        def sessionsInState = sessions.findAll { it.state == state }
        assert sessionsInState.empty,
                "Expected no session for ${username(args)} to be $state. Actually is ${sessionsInState.size()}. All sessions: $sessions"
    }

    final WorkerSession oneSessionIs(State state, Map args = [:]) {
        def sessions = userWorkerSessions(args)
        def sessionsInState = sessions.findAll { it.state == state }
        assert sessionsInState.size() == 1,
                "Expected one session for ${username(args)} to be $state. Actually is ${sessionsInState.size()}. All sessions: $sessions"
        return sessionsInState.first()
    }

    private String username(Map args) {
        args.containsKey('username') ? args.username : testUsername
    }

    final <T> T ago(int time, TimeUnit timeUnit, Closure<T> callback) {
        def result = callback.call()
        clock.forward(time, timeUnit)
        return result
    }
}
