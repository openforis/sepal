package component.budget

import component.workersession.FakeBudgetChecker
import component.workersession.FakeInstanceManager
import fake.Database
import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.InstanceTypes
import org.openforis.sepal.component.budget.api.UserInstanceSpending
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.command.CheckUserInstanceSpending
import org.openforis.sepal.component.budget.command.UpdateBudget
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReport
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import sandboxmanager.FakeClock
import spock.lang.Specification

import java.util.concurrent.TimeUnit

abstract class AbstractBudgetTest extends Specification {
    final database = new Database()
    final eventDispatcher = new HandlerRegistryEventDispatcher()
    final instanceTypes = Mock(InstanceTypes)
    final clock = new FakeClock()

    final defaultBudget = new Budget(
            instanceSpending: 111,
            storageSpending: 222,
            storageQuota: 333,
    )

    final component = new BudgetComponent(
            database.dataSource,
            instanceTypes,
            eventDispatcher,
            clock
    )
    final sessionComponent = new WorkerSessionComponent(
            database.dataSource,
            eventDispatcher,
            new FakeBudgetChecker(),
            new FakeInstanceManager(),
            instanceTypes,
            clock)

    final events = [] as List<Event>

    final testWorkerType = 'test-worker-type'
    final testInstanceType = 'test-instance-type'
    final testUsername = 'test-username'


    def setup() {
        component.on(Event) { events << it }
    }

    final <E extends Event> E published(Class<E> eventType) {
        def recievedEvent = events.find { it.class.isAssignableFrom(eventType) }
        assert recievedEvent, "Expected to event of type $eventType to have been published. Actually published $events"
        recievedEvent as E
    }

    final UserInstanceSpending checkUserInstanceSpending(Map args = [:]) {
        component.submit(new CheckUserInstanceSpending(username: username(args)))
    }

    final void updateUserInstanceBudget(Budget budget, Map args = [:]) {
        component.submit(new UpdateBudget(username: username(args), budget: budget))
    }

    final UserSpendingReport userSpendingReport(Map args = [:]) {
        component.submit(new GenerateUserSpendingReport(username: username(args)))
    }

    final Budget updateUserBudget(Budget budget, Map args = [:]) {
        component.submit(new UpdateBudget(username: username(args), budget: budget))
        return budget
    }

    final Budget updateDefaultBudget(Budget budget, Map args = [:]) {
        component.submit(new UpdateBudget(budget: budget))
        return budget
    }

    private String username(Map args) {
        args.containsKey('username') ? args.username : testUsername
    }

    final session(Map args) {
        String start = args.start
        double hours = args.hours
        double hourlyCost = args.hourlyCost
        instanceTypes.hourCostByInstanceType() >> [(testInstanceType): hourlyCost]
        clock.set(start)
        def session = sessionComponent.submit(new RequestSession(
                username: username(args),
                workerType: args.workerType ?: testWorkerType,
                instanceType: args.instanceType ?: testInstanceType))
        clock.forward((hours * 60d * 60d * 1000d) as int, TimeUnit.MILLISECONDS)
        sessionComponent.submit(new CloseSession(sessionId: session.id))
    }
}
