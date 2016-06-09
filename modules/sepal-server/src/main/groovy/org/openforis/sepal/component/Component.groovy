package org.openforis.sepal.component

import org.openforis.sepal.command.Command
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.event.Event
import org.openforis.sepal.event.EventHandler
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.query.HandlerRegistryQueryDispatcher
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.ExecutorServiceBasedJobScheduler
import org.openforis.sepal.util.JobScheduler
import org.openforis.sepal.util.NamedThreadFactory
import org.openforis.sepal.util.lifecycle.Lifecycle
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.sql.DataSource
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

interface Component extends Lifecycle {

    def <R> R submit(Command<R> command)

    def <R> R submit(Query<R> query)

    def <E extends Event> Component on(Class<E> eventType, EventHandler<E> handler)

    void start()

    void stop()
}

abstract class AbstractComponent implements Component {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SqlConnectionManager connectionManager
    private final HandlerRegistryEventDispatcher eventDispatcher
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher
    private final List<JobScheduler> schedulers = []

    AbstractComponent(DataSource dataSource, HandlerRegistryEventDispatcher eventDispatcher) {
        connectionManager = new SqlConnectionManager(dataSource)
        this.eventDispatcher = eventDispatcher

        commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
        queryDispatcher = new HandlerRegistryQueryDispatcher()
    }

    final <R> R submit(Command<R> command) {
        commandDispatcher.submit(command)
    }

    final <R> R submit(Query<R> query) {
        queryDispatcher.submit(query)
    }

    final <E extends Event> AbstractComponent on(Class<E> eventType, EventHandler<E> handler) {
        eventDispatcher.register(eventType, handler)
        return this
    }

    final <R, C extends Command<R>> AbstractComponent command(Class<C> commandType, CommandHandler<R, C> handler) {
        commandDispatcher.register(commandType, handler)
        return this
    }

    final <R, Q extends Query<R>> AbstractComponent query(Class<Q> queryType, QueryHandler<R, Q> handler) {
        queryDispatcher.register(queryType, handler)
        return this
    }

    final schedule(long delay, TimeUnit timeUnit, Command... commands) {
        def schedulers = this.schedulers
        commands.each { command ->
            schedulers <<
                    new ExecutorServiceBasedJobScheduler(
                            Executors.newSingleThreadScheduledExecutor(
                                    NamedThreadFactory.singleThreadFactory(command.class.name)
                            )
                    ).schedule(0, delay, timeUnit) {
                        try {
                            submit(command)
                        } catch (Exception e) {
                            LOG.error("Error executing scheduled command: $command", e)
                        }
                    }
        }
    }

    final void start() {
        onStart()
    }

    final void stop() {
        eventDispatcher?.stop()
        schedulers*.stop()
        connectionManager.stop()
        onStop()
    }

    void onStart() {}

    void onStop() {}
}
