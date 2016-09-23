package org.openforis.sepal.query

import org.openforis.sepal.util.Is
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface QueryDispatcher {
    public <R> R submit(Query<R> query)
}

class HandlerRegistryQueryDispatcher implements QueryDispatcher {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final Map<Class<? extends Query>, QueryHandler> handlers = [:]

    public <R, Q extends Query<R>> HandlerRegistryQueryDispatcher register(Class<Q> queryType, QueryHandler<R, Q> handler) {
        handlers[queryType] = handler
        return this
    }

    def <R> R submit(Query<R> query) {
        Is.notNull(query, 'Query is null')
        def handler = handlers[query.class]
        if (handler == null)
            throw new IllegalStateException("No handler registered for queries of type ${query.class.name}")
        LOG.debug("Executing query $query with handler $handler")
        try {
            handler.execute(query)
        } catch (Exception e) {
            def queryFailed = new QueryFailed(handler, query, e)
            LOG.error(queryFailed.message, e)
            throw queryFailed
        }
    }
}

