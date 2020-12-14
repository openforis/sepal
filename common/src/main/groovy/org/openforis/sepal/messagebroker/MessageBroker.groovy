package org.openforis.sepal.messagebroker


import org.openforis.sepal.util.lifecycle.Lifecycle

interface MessageBroker extends Lifecycle {
    def <M> MessageQueue<M> createMessageQueue(String queueName, Class<M> messageType, Closure consumer)
}



