package org.openforis.sepal.event

import org.openforis.sepal.util.Is

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

class HandlerRegistryEventDispatcher implements EventDispatcher, EventSource {
    private final Map<Class<? extends Event>, List<EventHandler>> handlersByType = new ConcurrentHashMap<>()

    void publish(Event event) {
        Is.notNull(event)
        def handlers = handlersByType.findAll { type, potentialHandlers ->
            type.isAssignableFrom(event.class)
        }.collect { it.value }.flatten()
        handlers.each {
            it.handle(event)
        }
    }

    def <E extends Event> HandlerRegistryEventDispatcher register(Class<E> eventType, EventHandler<E> handler) {
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
}
