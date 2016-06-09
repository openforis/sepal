package component.budget

import component.workersession.FakeBudgetManager
import component.workersession.FakeInstanceManager
import fake.Database
import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.UserInstanceSpending
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.api.UserStorageUse
import org.openforis.sepal.component.budget.command.CheckUserInstanceSpending
import org.openforis.sepal.component.budget.command.CheckUserStorageUse
import org.openforis.sepal.component.budget.command.DetermineUserStorageUsage
import org.openforis.sepal.component.budget.command.UpdateBudget
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReport
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.DateTime
import sandboxmanager.FakeClock
import spock.lang.Specification

import java.util.concurrent.TimeUnit

import static org.openforis.sepal.util.DateTime.parseDateString

abstract class AbstractBudgetTest extends Specification {
    final database = new Database()
    final eventDispatcher = new SynchronousEventDispatcher()
    final hostingService = new FakeHostingService()
    final userRepository = Mock(UserRepository)
    final clock = new FakeClock()

    final defaultBudget = new Budget(
            instanceSpending: 111,
            storageSpending: 222,
            storageQuota: 333,
    )

    final component = new BudgetComponent(
            database.dataSource,
            hostingService,
            userRepository,
            eventDispatcher,
            clock
    )
    final sessionComponent = new WorkerSessionComponent(
            database.dataSource,
            eventDispatcher,
            new FakeBudgetManager(),
            new FakeInstanceManager(),
            clock)

    final events = [] as List<Event>

    final testWorkerType = 'test-worker-type'
    final testInstanceType = 'test-instance-type'
    final testUsername = 'test-username'


    def setup() {
        userRepository.eachUsername(_ as Closure) >> { it[0].call(testUsername) }
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

    final UserStorageUse checkUserStorageUse(Map args = [:]) {
        component.submit(new CheckUserStorageUse(username: username(args)))
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
        component.submit(new UpdateBudget(username: username(args), budget: budget))
        return budget
    }

    final void determineStorageUsage() {
        component.submit(new DetermineUserStorageUsage())
    }

    private String username(Map args) {
        args.containsKey('username') ? args.username : testUsername
    }

    final void session(Map args) {
        String start = args.start
        double hours = args.hours
        double hourlyCost = args.hourlyCost
        hostingService.instanceTypeCost(testInstanceType, hourlyCost)
        clock.set(start)
        def session = sessionComponent.submit(new RequestSession(
                username: username(args),
                workerType: args.workerType ?: testWorkerType,
                instanceType: args.instanceType ?: testInstanceType))
        clock.forward((hours * 60d * 60d * 1000d) as int, TimeUnit.MILLISECONDS)
        sessionComponent.submit(new CloseSession(sessionId: session.id))
    }

    final void storageCost(double gbMonthCost) {
        hostingService.storageCostPerGbMonth(gbMonthCost)
    }

    final void storage(Map args) {
        double gb = args.gb
        Date start = args.start ? parseDateString(args.start) : clock.now()
        double hours = (args.days ?: 0) * 24d
        if (!hours && args.end)
            hours = DateTime.hoursBetween(start, parseDateString(args.end))

        clock.set(start)
        hostingService.gbStorageUsed(username(args), gb)
        determineStorageUsage()
        if (hours) {
            clock.forward((hours * 60d * 60d) as long, TimeUnit.SECONDS)
            determineStorageUsage()
        }
    }
}
