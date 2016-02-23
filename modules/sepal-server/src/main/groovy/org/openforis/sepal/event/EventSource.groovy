package org.openforis.sepal.event

interface EventSource {
    public <E extends Event> EventSource register(Class<E> eventType, EventHandler<E> handler)
}
