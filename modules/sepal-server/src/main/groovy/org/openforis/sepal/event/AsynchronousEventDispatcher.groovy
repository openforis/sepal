package org.openforis.sepal.event

import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.JobExecutor
import org.openforis.sepal.util.NamedThreadFactory
import org.openforis.sepal.util.lifecycle.Stoppable
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

interface HandlerRegistryEventDispatcher extends EventDispatcher, EventSource, Stoppable {
}

class SynchronousEventDispatcher implements HandlerRegistryEventDispatcher {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final Map<Class<? extends Event>, List<EventHandler>> handlersByType = new ConcurrentHashMap<>()

    void publish(Event event) {
        Is.notNull(event)
        def handlers = handlersByType.findAll { type, potentialHandlers ->
            type.isAssignableFrom(event.class)
        }.collect { it.value }.flatten() as Collection<EventHandler>
        LOG.debug("Publishing $event to $handlers")
        handlers.each {
            invokeHandler(it, event)
        }
    }

    def <E extends Event> SynchronousEventDispatcher register(Class<E> eventType, EventHandler<E> handler) {
        Is.notNull(eventType)
        Is.notNull(handler)
        def handlers = handlersByType[eventType]
        if (!handlers) {
            handlers = new CopyOnWriteArrayList<EventHandler>()
            handlersByType[eventType] = handlers
        }
        handlers.add(handler)
        return this
    }

    void invokeHandler(EventHandler handler, Event event) {
        handler.handle(event)
    }

    void stop() {}
}

class AsynchronousEventDispatcher extends SynchronousEventDispatcher {
    private final JobExecutor handlerExecutor = new ExecutorServiceBasedJobExecutor(
            Executors.newFixedThreadPool(10, NamedThreadFactory.multipleThreadFactory('EventHandlerExecutor'))
    )

    void invokeHandler(EventHandler handler, Event event) {
        handlerExecutor.execute {
            handler.handle(event)
        }
    }

    void stop() {
        handlerExecutor.stop()
    }
}
