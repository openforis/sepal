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

import javax.sql.DataSource

interface Component {

    def <R> R submit(Command<R> command)

    def <R> R submit(Query<R> query)

    def <E extends Event> AbstractComponent on(Class<E> eventType, EventHandler<E> handler)
}

abstract class AbstractComponent implements Component {
    private final SqlConnectionManager connectionManager
    private final HandlerRegistryEventDispatcher eventDispatcher
    private final HandlerRegistryCommandDispatcher commandDispatcher
    private final HandlerRegistryQueryDispatcher queryDispatcher

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

    final void stop() {
        connectionManager.close()
    }
}
