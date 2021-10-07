package org.openforis.sepal.component.budget

import groovy.transform.Canonical
import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.budget.adapter.JdbcBudgetRepository
import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.budget.command.*
import org.openforis.sepal.component.budget.endpoint.BudgetEndpoint
import org.openforis.sepal.component.budget.internal.InstanceSpendingService
import org.openforis.sepal.component.budget.internal.StorageUseService
import org.openforis.sepal.component.budget.query.*
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.event.RabbitMQTopic
import org.openforis.sepal.event.Topic
import org.openforis.sepal.event.TopicEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.user.RestUserRepository
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.SystemClock

import static java.util.concurrent.TimeUnit.HOURS

class BudgetComponent extends DataSourceBackedComponent implements EndpointRegistry {
    static final COMPONENT_NAME = 'budget'
    private final Topic userTopic
    private final Topic userStorageTopic

    static BudgetComponent create(HostingServiceAdapter hostingServiceAdapter, SqlConnectionManager connectionManager) {
        def config = new BudgetConfig()
        new BudgetComponent(
                connectionManager,
                hostingServiceAdapter.hostingService,
                new RestUserRepository(config.userEndpoint, config.userEndpointUser),
                new TopicEventDispatcher(
                        new RabbitMQTopic(COMPONENT_NAME, config.rabbitMQHost, config.rabbitMQPort)
                ),
                new RabbitMQTopic('user', config.rabbitMQHost, config.rabbitMQPort),
                new RabbitMQTopic('userStorage', config.rabbitMQHost, config.rabbitMQPort),
                new SystemClock()
        )
    }

    BudgetComponent(
            SqlConnectionManager connectionManager,
            HostingService hostingService,
            UserRepository userRepository,
            HandlerRegistryEventDispatcher eventDispatcher,
            Topic userTopic,
            Topic userStorageTopic,
            Clock clock) {
        super(connectionManager, eventDispatcher)
        this.userTopic = userTopic
        this.userStorageTopic = userStorageTopic
        def budgetRepository = new JdbcBudgetRepository(connectionManager, clock)
        def instanceSpendingService = new InstanceSpendingService(budgetRepository, hostingService, clock)
        def storageUseService = new StorageUseService(budgetRepository, hostingService, clock)
        def generateSpendingReportHandler = new GenerateSpendingReportHandler(instanceSpendingService, storageUseService, budgetRepository, userRepository)
        def generateUserSpendingReportHandler = new GenerateUserSpendingReportHandler(instanceSpendingService, storageUseService, budgetRepository)

        def instanceSpendingChecker = new CheckUserInstanceSpendingHandler(instanceSpendingService, budgetRepository, eventDispatcher)
        command(CheckUserInstanceSpending, instanceSpendingChecker)
        def storageUseChecker = new CheckUserStorageUseHandler(storageUseService, budgetRepository, eventDispatcher)
        command(CheckUserStorageUse, storageUseChecker)
        command(UpdateBudget, new UpdateBudgetHandler(budgetRepository))
        command(UpdateUserStorageUsage, new UpdateUserStorageUsageHandler(storageUseService))
        command(UpdateSpendingReport, new UpdateSpendingReportHandler(budgetRepository, generateSpendingReportHandler, connectionManager))
        command(UpdateUserSpendingReport, new UpdateUserSpendingReportHandler(budgetRepository, generateUserSpendingReportHandler))

        query(GenerateSpendingReport,
                generateSpendingReportHandler)
        query(GenerateUserSpendingReport,
                generateUserSpendingReportHandler)
        query(FindUsersExceedingBudget, new FindUsersExceedingBudgetHandler(userRepository, instanceSpendingChecker, storageUseChecker))
        query(LoadSpendingReport, new LoadSpendingReportHandler(budgetRepository))
    }

    void onStart() {
        schedule(1, HOURS, new UpdateSpendingReport())
        subscribe(COMPONENT_NAME, userTopic) { message, type ->
            submit(new UpdateUserSpendingReport(userToUpdate: message.username as String))
        }
        subscribe(COMPONENT_NAME, userStorageTopic) { message, type ->
            submit(new UpdateUserStorageUsage(userToUpdate: message.username as String, gbUsed: message.size/1000/1000/1000))
            submit(new UpdateUserSpendingReport(userToUpdate: message.username as String))
        }
    }

    void onStop() {
        userTopic.close()
        userStorageTopic.close()
    }

    void registerEndpointsWith(Controller controller) {
        new BudgetEndpoint(this).registerWith(controller)
    }

    @Canonical
    private static final class BudgetConfig {
        final String userEndpoint
        final String userEndpointUser
        final String rabbitMQHost
        final int rabbitMQPort

        BudgetConfig() {
            def c = new Config('budget.properties')
            userEndpoint = c.string('userEndpoint')
            userEndpointUser = c.string('userEndpointUser')
            rabbitMQHost = c.string('rabbitMQHost')
            rabbitMQPort = c.integer('rabbitMQPort')
        }
    }
}
