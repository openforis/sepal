package workersession

import fake.Database
import org.openforis.sepal.component.workersession.command.CloseUserSessions
import org.openforis.sepal.component.workersession.command.ReleaseUnusedInstances
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.component.workersession.api.Timeout
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.component.workersession.api.WorkerSession.State
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.CloseTimedOutSessions
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.component.workersession.query.UserWorkerSessions
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import sandboxmanager.FakeClock
import spock.lang.Specification

abstract class AbstractWorkerSessionTest extends Specification {
    final database = new Database()
    final eventDispatcher = new HandlerRegistryEventDispatcher()
    final instanceManager = new FakeInstanceManager()
    final budgetChecker = new FakeBudgetChecker()
    final clock = new FakeClock()
    final component = new WorkerSessionComponent(
            database.dataSource,
            eventDispatcher,
            budgetChecker,
            instanceManager,
            clock)

    final events = [] as List<Event>

    final testWorkerType = 'test-worker-type'
    final testInstanceType = 'test-instance-type'
    final testUsername = 'test-user'

    def setup() {
        component.event(Event) { events << it }
    }

    final WorkerSession requestSession(Map args = [:]) {
        component.submit(new RequestSession(
                username: args.username ?: testUsername,
                workerType: args.workerType ?: testWorkerType,
                instanceType: testInstanceType))
    }

    final WorkerSession pendingSession(Map args = [:]) {
        requestSession(args)
    }

    final WorkerSession activeSession(Map args = [:]) {
        def session = requestSession(args)
        instanceManager.activate(session.instance.id)
        return session.activate()
    }

    final WorkerSession timedOutSession(Map args = [:]) {
        clock.set()
        def session = pendingSession(args)
        clock.set(Timeout.PENDING.willTimeout(clock.now()))
        return session
    }


    final WorkerSession closedSession(Map args = [:]) {
        def session = pendingSession(args)
        closeSession(session, args)
        return session
    }

    final void closeSession(WorkerSession session, Map args = [:]) {
        component.submit(new CloseSession(
                username: args.username ?: testUsername,
                sessionId: session.id))
    }

    final void closeTimedOutSessions() {
        component.submit(new CloseTimedOutSessions())
    }

    final void closeUserSessions(Map args = [:]) {
        component.submit(new CloseUserSessions(username: args.username ?: testUsername))
    }

    final List<WorkerSession> userWorkerSessions(Map args = [:]) {
        component.submit(new UserWorkerSessions(
                username: args.username ?: testUsername,
                states: args.states ?: []))
    }

    final releaseUnusedInstances() {
        component.submit(new ReleaseUnusedInstances())
    }

    final <E extends Event> E published(Class<E> eventType) {
        def recievedEvent = events.find { it.class.isAssignableFrom(eventType) }
        assert recievedEvent, "Expected to event of type $eventType to have been published. Actually published $events"
        recievedEvent as E
    }

    final void noSessions(Map args = [:]) {
        def sessions = userWorkerSessions(args)
        assert sessions.empty,
                "Expected no session for ${args.username ?: testUsername}. User actually has ${sessions.size()}: $sessions"
    }

    final void noSessionIs(State state, Map args = [:]) {
        def sessions = userWorkerSessions(args)
        def sessionsInState = sessions.findAll { it.state == state }
        assert sessionsInState.empty,
                "Expected no session for ${args.username ?: testUsername} to be $state. Actually is ${sessionsInState.size()}. All sessions: $sessions"
    }

    final WorkerSession oneSessionIs(State state, Map args = [:]) {
        def sessions = userWorkerSessions(args)
        def sessionsInState = sessions.findAll { it.state == state }
        assert sessionsInState.size() == 1,
                "Expected one session for ${args.username ?: testUsername} to be $state. Actually is ${sessionsInState.size()}. All sessions: $sessions"
        return sessionsInState.first()
    }
}
