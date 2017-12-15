package org.openforis.sepal.component.budget

import groovymvc.Controller
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.budget.adapter.FilesComponentBackedUserFiles
import org.openforis.sepal.component.budget.adapter.JdbcBudgetRepository
import org.openforis.sepal.component.budget.adapter.UserFiles
import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.budget.command.*
import org.openforis.sepal.component.budget.endpoint.BudgetEndpoint
import org.openforis.sepal.component.budget.internal.InstanceSpendingService
import org.openforis.sepal.component.budget.internal.StorageUseService
import org.openforis.sepal.component.budget.query.*
import org.openforis.sepal.component.files.FilesComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.user.RestUserRepository
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.SystemClock
import org.openforis.sepal.util.annotation.Data

import static java.util.concurrent.TimeUnit.MINUTES

class BudgetComponent extends DataSourceBackedComponent implements EndpointRegistry {

    static BudgetComponent create(HostingServiceAdapter hostingServiceAdapter, FilesComponent filesComponent,
                                  SqlConnectionManager connectionManager) {
        def config = new BudgetConfig()
        new BudgetComponent(
                connectionManager,
                hostingServiceAdapter.hostingService,
                new RestUserRepository(config.userEndpoint, config.userEndpointUser),
                new FilesComponentBackedUserFiles(filesComponent),
                new AsynchronousEventDispatcher(),
                new SystemClock()
        )
    }

    BudgetComponent(
            SqlConnectionManager connectionManager,
            HostingService hostingService,
            UserRepository userRepository,
            UserFiles userFiles,
            HandlerRegistryEventDispatcher eventDispatcher,
            Clock clock) {
        super(connectionManager, eventDispatcher)
        def budgetRepository = new JdbcBudgetRepository(connectionManager, clock)
        def instanceSpendingService = new InstanceSpendingService(budgetRepository, hostingService, clock)
        def storageUseService = new StorageUseService(budgetRepository, userFiles, hostingService, clock)

        def instanceSpendingChecker = new CheckUserInstanceSpendingHandler(instanceSpendingService, budgetRepository, eventDispatcher)
        command(CheckUserInstanceSpending, instanceSpendingChecker)
        def storageUseChecker = new CheckUserStorageUseHandler(storageUseService, budgetRepository, eventDispatcher)
        command(CheckUserStorageUse, storageUseChecker)
        command(UpdateBudget, new UpdateBudgetHandler(budgetRepository))
        command(DetermineUserStorageUsage, new DetermineUserStorageUsageHandler(storageUseService, userRepository))

        query(GenerateSpendingReport,
                new GenerateSpendingReportHandler(instanceSpendingService, storageUseService, budgetRepository, userRepository))
        query(GenerateUserSpendingReport,
                new GenerateUserSpendingReportHandler(instanceSpendingService, storageUseService, budgetRepository))
        query(FindUsersExceedingBudget, new FindUsersExceedingBudgetHandler(userRepository, instanceSpendingChecker, storageUseChecker))
    }

    void onStart() {
        schedule(1, MINUTES, new DetermineUserStorageUsage())
    }

    void registerEndpointsWith(Controller controller) {
        new BudgetEndpoint(this).registerWith(controller)
    }

    @Data
    private static final class BudgetConfig {
        final String userEndpoint
        final String userEndpointUser

        BudgetConfig() {
            def c = new Config('budget.properties')
            userEndpoint = c.userEndpoint
            userEndpointUser = c.userEndpointUser
        }
    }
}