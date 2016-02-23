package org.openforis.sepal.event

interface EventSource {
    public <E extends Event> void register(Class<E> eventType, EventHandler<E> handler)
}
