package component.budget

import component.workersession.FakeBudgetManager
import component.workersession.FakeGoogleOAuthGateway
import component.workersession.FakeInstanceManager
import fake.Database
import fake.FakeClock
import fake.FakeTopic
import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.UserInstanceSpending
import org.openforis.sepal.component.budget.api.UserSpendingReport
import org.openforis.sepal.component.budget.api.UserStorageUse
import org.openforis.sepal.component.budget.command.*
import org.openforis.sepal.component.budget.query.FindUsersExceedingBudget
import org.openforis.sepal.component.budget.query.GenerateSpendingReport
import org.openforis.sepal.component.budget.query.GenerateUserSpendingReport
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.component.workersession.command.CloseSession
import org.openforis.sepal.component.workersession.command.RequestSession
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.SynchronousEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.DateTime
import spock.lang.Specification

import java.util.concurrent.TimeUnit

import static org.openforis.sepal.util.DateTime.parseDateString

abstract class AbstractBudgetTest extends Specification {
    final workDir = File.createTempDir()
    final testWorkerType = 'test-worker-type'
    final testInstanceType = 'test-instance-type'
    final testUsername = 'test-username'

    final database = new Database()
    final connectionManager = new SqlConnectionManager(database.dataSource)
    final eventDispatcher = new SynchronousEventDispatcher()
    final hostingService = new FakeHostingService()
    final userRepository = Mock(UserRepository)
    final clock = new FakeClock()

    final defaultBudget = createBudget()

    final component = new BudgetComponent(
            connectionManager,
            hostingService,
            userRepository,
            eventDispatcher,
            new FakeTopic(),
            new FakeTopic(),
            clock
    )
    final sessionComponent = new WorkerSessionComponent(
            connectionManager,
            eventDispatcher,
            new FakeBudgetManager(),
            new FakeInstanceManager(),
            new FakeGoogleOAuthGateway(),
            [new InstanceType(id: testInstanceType, name: testInstanceType, hourlyCost: 123d, idleCount: 1)],
            clock,
            workDir,
            new FakeTopic()
    )

    final events = [] as List<Event>


    def setup() {
        updateDefaultBudget(defaultBudget)
        userRepository.eachUsername(_ as Closure) >> { it[0].call(testUsername) }
        component.on(Event) { events << it }
    }

    def cleanup() {
        workDir.deleteDir()
    }

    final <E extends Event> E published(Class<E> eventType) {
        def receivedEvent = events.find { it.class.isAssignableFrom(eventType) }
        assert receivedEvent, "Expected to event of type $eventType to have been published. Actually published $events"
        receivedEvent as E
    }

    final <E extends Event> void notPublished(Class<E> eventType) {
        def receivedEvent = events.find { it.class.isAssignableFrom(eventType) }
        assert !receivedEvent, "Expected no event of type $eventType to have been published. Found $receivedEvent"
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

    final void requestBudgetUpdate(Map args = [:]) {
        component.submit(new RequestBudgetUpdate(
                username: username(args),
                message: args.message,
                budget: args.budget
        ))
    }

    final Budget updateDefaultBudget(Budget budget, Map args = [:]) {
        component.submit(new UpdateBudget(username: username(args), budget: budget))
        return budget
    }

    final List<String> findUsersExceedingBudget() {
        component.submit(new FindUsersExceedingBudget())
    }

    final void updateStorageUsage(Map args) {
        component.submit(new UpdateUserStorageUsage(
                userToUpdate: username(args),
                gbUsed: args.gbUsed as Double ?: 0d
        ))
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
        updateStorageUsage(gbUsed: gb)
        if (hours) {
            clock.forward((hours * 60d * 60d) as long, TimeUnit.SECONDS)
            updateStorageUsage(gbUsed: gb)
        }
    }

    final Budget createBudget(args = [:]) {
        return new Budget(
            instanceSpending: args.instanceSpending ?: 10, 
            storageSpending: args.storageSpending ?: 10, 
            storageQuota: args.storageQuota ?: 100
        )
    }

    Map<String, UserSpendingReport> generateSpendingReport() {
        component.submit(new GenerateSpendingReport())
    }
}
