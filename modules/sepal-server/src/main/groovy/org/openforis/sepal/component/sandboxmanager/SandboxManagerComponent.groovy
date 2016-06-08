package org.openforis.sepal.component.sandboxmanager

import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.command.Command
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.component.sandboxmanager.command.*
import org.openforis.sepal.component.sandboxmanager.endpoint.SepalSessionEndpoint
import org.openforis.sepal.component.sandboxmanager.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.EventHandler
import org.openforis.sepal.event.EventSource
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.user.JdbcUserRepository
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import javax.sql.DataSource

final class SandboxManagerComponent implements EndpointRegistry, EventSource {
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher
    private final SqlConnectionManager connectionManager
    private final SandboxWorkScheduler sandboxWorkScheduler
    private final WorkerInstanceManager instanceManager
    private final Clock clock
    private final HandlerRegistryEventDispatcher eventDispatcher
    private BudgetCheckScheduler storageUsageCheckScheduler

    SandboxManagerComponent(SepalConfiguration config) {
        this(
                config.dataSource,
                instantiateHostingService(config),
                new DockerSandboxSessionProvider(config, new SystemClock()),
                new StorageUsageFileChecker(config.userHomeDirTemplate()),
                new AsynchronousEventDispatcher(),
                new SystemClock()
        )
    }

    SandboxManagerComponent(
            DataSource dataSource,
            HostingService hostingService,
            SandboxSessionProvider sessionProvider,
            StorageUsageChecker storageUsageChecker,
            HandlerRegistryEventDispatcher eventDispatcher,
            Clock clock) {
        connectionManager = new SqlConnectionManager(dataSource)
        instanceManager = hostingService.workerInstanceManager
        def sessionRepository = new JdbcSessionRepository(connectionManager, clock)
        def userBudgetRepository = new JdbcUserBudgetRepository(connectionManager)
        this.eventDispatcher = eventDispatcher
        this.clock = clock
        def sessionManager = new SessionManager(sessionRepository, instanceManager, sessionProvider, eventDispatcher, clock)
        def storageUsageRepository = new JdbcStorageUsageRepository(connectionManager, clock)
        def resourceUsageService = new ResourceUsageService(storageUsageChecker, sessionRepository, storageUsageRepository, clock, hostingService.storageCostPerGbMonth)
        def userRepository = new JdbcUserRepository(connectionManager)
        def budgetCheck = new BudgetCheck(resourceUsageService, userBudgetRepository, instanceManager, sessionManager)

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(CreateSession, new CreateSessionHandler(sessionManager, budgetCheck))
                .register(JoinSession, new JoinSessionHandler(sessionManager))
                .register(CloseSession, new CloseSessionHandler(sessionManager))
                .register(CloseTimedOutSessions, new CloseTimedOutSessionsHandler(sessionManager))
                .register(UpdateInstanceStates, new UpdateInstanceStatesHandler(sessionManager))
                .register(UpdateUserBudget, new UpdateUserBudgetHandler(userBudgetRepository))
                .register(DeployStartingSessions, new DeployStartingSessionsHandler(sessionManager))
                .register(UpdateStorageUsage, new UpdateStorageUsageHandler(userRepository, resourceUsageService))
                .register(CheckBudget, new CheckBudgetHandler(userRepository, budgetCheck))

        queryDispatcher = new HandlerRegistryQueryDispatcher()
                .register(FindInstanceTypes, new FindInstanceTypesHandler(instanceManager))
                .register(LoadSandboxInfo, new LoadSandboxInfoHandler(sessionRepository, instanceManager, userBudgetRepository, resourceUsageService))
                .register(LoadSession, new LoadSessionHandler(sessionRepository))

        sandboxWorkScheduler = new SandboxWorkScheduler(commandDispatcher)
        storageUsageCheckScheduler = new BudgetCheckScheduler(commandDispatcher)
    }

    void registerEndpointsWith(Controller controller) {
        new SepalSessionEndpoint(queryDispatcher, commandDispatcher, new JdbcUserRepository(connectionManager), clock)
                .registerWith(controller)
    }

    SandboxManagerComponent start() {
        sandboxWorkScheduler.start()
        storageUsageCheckScheduler.start()
        return this
    }

    void stop() {
        sandboxWorkScheduler?.stop()
        storageUsageCheckScheduler?.stop()
        eventDispatcher?.stop()

    }

    def <R> R submit(Command<R> command) {
        commandDispatcher.submit(command)
    }

    def <R> R submit(Query<R> query) {
        queryDispatcher.submit(query)
    }

    def <E extends Event> SandboxManagerComponent register(Class<E> eventType, EventHandler<E> handler) {
        eventDispatcher.register(eventType, handler)
        return this
    }

    private static HostingService instantiateHostingService(SepalConfiguration config) {
        HostingService.Factory.create(config.hostingService)
    }
}
