package org.openforis.sepal.component.workersession

import groovymvc.Controller
import org.openforis.sepal.component.budget.BudgetComponent
import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.WorkerInstanceComponent
import org.openforis.sepal.component.workersession.adapter.BudgetComponentAdapter
import org.openforis.sepal.component.workersession.adapter.InstanceComponentAdapter
import org.openforis.sepal.component.workersession.adapter.JdbcWorkerSessionRepository
import org.openforis.sepal.component.workersession.adapter.RestGoogleOAuthGateway
import org.openforis.sepal.component.workersession.api.BudgetManager
import org.openforis.sepal.component.workersession.api.GoogleOAuthGateway
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.command.*
import org.openforis.sepal.component.workersession.endpoint.SandboxSessionEndpoint
import org.openforis.sepal.component.workersession.query.*
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.event.RabbitMQTopic
import org.openforis.sepal.event.Topic
import org.openforis.sepal.event.TopicEventDispatcher
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.SystemClock
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static java.util.concurrent.TimeUnit.MINUTES

class WorkerSessionComponent extends DataSourceBackedComponent implements EndpointRegistry {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final COMPONENT_NAME = 'workersession'
    private final Topic userTopic
    private final Clock clock
    private final List<InstanceType> instanceTypes

    static WorkerSessionComponent create(
            BudgetComponent budgetComponent,
            WorkerInstanceComponent workerInstanceComponent,
            HostingServiceAdapter hostingServiceAdapter,
            SqlConnectionManager connectionManager
    ) {
        def config = new WorkerSessionConfig()
        new WorkerSessionComponent(
                connectionManager,
                new TopicEventDispatcher(
                    new RabbitMQTopic('workerSession', config.rabbitMQHost, config.rabbitMQPort)
                ),
                new BudgetComponentAdapter(budgetComponent),
                new InstanceComponentAdapter(hostingServiceAdapter.instanceTypes, workerInstanceComponent),
                new RestGoogleOAuthGateway(config.googleOAuthEndpoint),
                hostingServiceAdapter.instanceTypes,
                new SystemClock(),
                new File('/data/home'),
                new RabbitMQTopic('user', config.rabbitMQHost, config.rabbitMQPort)
        )
    }

    WorkerSessionComponent(
            SqlConnectionManager connectionManager,
            HandlerRegistryEventDispatcher eventDispatcher,
            BudgetManager budgetManager,
            InstanceManager instanceManager,
            GoogleOAuthGateway googleOAuthGateway,
            List<InstanceType> instanceTypes,
            Clock clock,
            File homeDir,
            Topic userTopic
        ) {
        super(connectionManager, eventDispatcher)
        this.instanceTypes = instanceTypes
        this.clock = clock
        this.userTopic = userTopic
        def sessionRepository = new JdbcWorkerSessionRepository(connectionManager, clock)

        command(RequestSession, new RequestSessionHandler(sessionRepository, budgetManager, instanceManager, clock))
        def closeSessionHandler = new CloseSessionHandler(sessionRepository, instanceManager, connectionManager, eventDispatcher)
        command(CloseSession, closeSessionHandler)
        command(CloseTimedOutSessions, new CloseTimedOutSessionsHandler(sessionRepository, closeSessionHandler, connectionManager))
        command(ActivatePendingSessionOnInstance, new ActivatePendingSessionOnInstanceHandler(sessionRepository, eventDispatcher))
        def closeUserSessionsHandler = new CloseUserSessionsHandler(sessionRepository, instanceManager, connectionManager, eventDispatcher)
        command(CloseUserSessions, closeUserSessionsHandler)
        command(CloseSessionOnInstance, new CloseSessionOnInstanceHandler(sessionRepository, closeSessionHandler))
        command(CloseSessionsWithoutInstance, new CloseSessionsWithoutInstanceHandler(sessionRepository, instanceManager, connectionManager, eventDispatcher))
        command(ReleaseUnusedInstances, new ReleaseUnusedInstancesHandler(sessionRepository, instanceManager))
        command(Heartbeat, new HeartbeatHandler(sessionRepository))
        command(SetEarliestTimeoutTime, new SetEarliestTimeoutTimeHandler(sessionRepository))
        command(CloseSessionsForUsersExceedingBudget,
                new CloseSessionsForUsersExceedingBudgetHandler(budgetManager, closeUserSessionsHandler))
        command(RemoveOrphanedTmpDirs, new RemoveOrphanedTmpDirsHandler(homeDir, sessionRepository))
        command(RefreshGoogleTokens, new RefreshGoogleTokensHandler(sessionRepository, googleOAuthGateway))

        query(UserWorkerSessions, new UserWorkerSessionsHandler(sessionRepository))
        query(FindSessionById, new FindSessionByIdHandler(sessionRepository))
        query(FindPendingOrActiveSession, new FindPendingOrActiveSessionHandler(sessionRepository))
        query(GenerateUserSessionReport, new GenerateUserSessionReportHandler(sessionRepository, instanceManager, budgetManager))

        instanceManager.onInstanceActivated { submit(new ActivatePendingSessionOnInstance(instance: it)) }
        instanceManager.onFailedToProvisionInstance {
            submit(new CloseSessionOnInstance(it.id))
        }
    }

    void registerEndpointsWith(Controller controller) {
        new SandboxSessionEndpoint(this, clock).registerWith(controller)
    }

    void onStart() {
        schedule(1, MINUTES,
                new CloseTimedOutSessions(),
                new CloseSessionsWithoutInstance(),
                new ReleaseUnusedInstances(5, MINUTES)
        )
        schedule(11, MINUTES,
                new CloseSessionsForUsersExceedingBudget()
        )
        schedule(12, MINUTES,
                new RemoveOrphanedTmpDirs()
        )
        schedule(5, MINUTES,
                new RefreshGoogleTokens()
        )
        subscribe(COMPONENT_NAME, userTopic) { message, type ->
            if (type == 'user.UserLocked') {
                submit(new CloseUserSessions(username: message.username as String))
            }
        }
    }

    void onStop() {
        userTopic.close()
    }

    List<InstanceType> getInstanceTypes() {
        return instanceTypes
    }

    InstanceType getDefaultInstanceType() {
        return instanceTypes.findAll { it.tag }.first()
    }

    private static class WorkerSessionConfig {
        final String googleOAuthEndpoint
        final String rabbitMQHost
        final int rabbitMQPort

        WorkerSessionConfig() {
            def c = new Config('workerSession.properties')
            googleOAuthEndpoint = c.string('googleOAuthEndpoint')
            rabbitMQHost = c.string('rabbitMQHost')
            rabbitMQPort = c.integer('rabbitMQPort')
        }
    }
}
