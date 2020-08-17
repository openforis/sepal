package org.openforis.sepal.event

class TopicEventDispatcher implements HandlerRegistryEventDispatcher {
    private final HandlerRegistryEventDispatcher localDispatcher = new AsynchronousEventDispatcher()
    private Topic topic

    TopicEventDispatcher(Topic topic) {
        this.topic = topic
    }

    void publish(Event event) {
        topic.publish(event)
        localDispatcher.publish(event)
    }

    def <E extends Event> EventSource register(Class<E> eventType, EventHandler<E> handler) {
        localDispatcher.register(eventType, handler)
        return null
    }

    void stop() {
        topic.close()
        localDispatcher.stop()
    }
}
