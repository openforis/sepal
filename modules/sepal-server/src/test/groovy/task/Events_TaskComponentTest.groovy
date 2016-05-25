package task

import org.openforis.sepal.component.task.Timeout
import org.openforis.sepal.component.task.event.TasksTimedOut
import org.openforis.sepal.event.Event

class Events_TaskComponentTest extends AbstractTaskComponentTest {
    def events = [] as List<? extends Event>

    def setup() {
        component.register(Event) { events << it }
    }

    def 'Given a timed out submission, when locating timed out task, TasksTimedOut event is recieved'() {
        clock.set()
        def task = submit operation()
        wait(Timeout.INSTANCE_STARTING)

        when:
        handleTimedOutTasks()

        then:
        def event = gotOneEventOfType(TasksTimedOut)
        event.tasks == [task]
    }

    def <E extends Event> E gotOneEventOfType(Class<E> type) {
        assert events.size() == 1, "Expected one event, got ${events.size()}: $events"
        def event = events.first()
        assert event.class == type, "Expected event of type $type.simpleName, got ${event.class.simpleName}: $event"
        return event as E
    }
}