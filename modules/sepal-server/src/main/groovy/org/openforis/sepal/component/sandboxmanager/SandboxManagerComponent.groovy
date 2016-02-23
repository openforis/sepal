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
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.user.JDBCUserRepository
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import javax.sql.DataSource

final class SandboxManagerComponent implements EndpointRegistry, EventSource {
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher
    private final SqlConnectionManager connectionManager
    private final SandboxWorkScheduler sandboxCleanup
    private final WorkerInstanceManager instanceManager
    private final Clock clock
    private final HandlerRegistryEventDispatcher eventDispatcher

    SandboxManagerComponent(SepalConfiguration config) {
        this(
                config.dataSource,
                instantiateHostingService(config).workerInstanceManager,
                new DockerSandboxSessionProvider(config, new SystemClock()),
                new SystemClock()
        )
    }

    SandboxManagerComponent(DataSource dataSource,
                            WorkerInstanceManager instanceManager,
                            SandboxSessionProvider sessionProvider,
                            Clock clock) {
        this.instanceManager = instanceManager
        connectionManager = new SqlConnectionManager(dataSource)
        eventDispatcher = new HandlerRegistryEventDispatcher()
        def sessionRepository = new JdbcSessionRepository(connectionManager, clock)
        def userBudgetRepository = new JdbcUserBudgetRepository(connectionManager)
        this.clock = clock
        def sessionManager = new SessionManager(sessionRepository, instanceManager, sessionProvider, eventDispatcher, clock)

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(CreateSession, new CreateSessionHandler(sessionManager))
                .register(JoinSession, new JoinSessionHandler(sessionManager))
                .register(CloseSession, new CloseSessionHandler(sessionManager))
                .register(CloseTimedOutSessions, new CloseTimedOutSessionsHandler(sessionManager))
                .register(UpdateInstanceStates, new UpdateInstanceStatesHandler(sessionManager))
                .register(UpdateUserBudget, new UpdateUserBudgetHandler(userBudgetRepository))
                .register(DeployStartingSessions, new DeployStartingSessionsHandler(sessionManager))

        queryDispatcher = new HandlerRegistryQueryDispatcher()
                .register(FindInstanceTypes, new FindInstanceTypesHandler(instanceManager))
                .register(LoadSandboxInfo, new LoadSandboxInfoHandler(sessionRepository, instanceManager, userBudgetRepository, clock))
                .register(LoadSession, new LoadSessionHandler(sessionRepository))

        sandboxCleanup = new SandboxWorkScheduler(commandDispatcher)
    }

    void registerEndpointsWith(Controller controller) {
        new SepalSessionEndpoint(queryDispatcher, commandDispatcher, new JDBCUserRepository(connectionManager), clock)
                .registerWith(controller)
    }

    SandboxManagerComponent start() {
        sandboxCleanup.start()
        return this
    }

    void stop() {
        sandboxCleanup?.stop()
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
