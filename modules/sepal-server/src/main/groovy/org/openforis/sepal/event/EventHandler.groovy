package org.openforis.sepal.event

interface EventHandler<E extends Event> {
    void handle(E event)
}
