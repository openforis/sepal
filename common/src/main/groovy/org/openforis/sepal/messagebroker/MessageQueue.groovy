package org.openforis.sepal.messagebroker

interface MessageQueue<M> {
    void publish(M message)
}
