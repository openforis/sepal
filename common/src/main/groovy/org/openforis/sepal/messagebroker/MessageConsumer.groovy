package org.openforis.sepal.messagebroker

interface MessageConsumer<M> {
    void consume(M message)
}
