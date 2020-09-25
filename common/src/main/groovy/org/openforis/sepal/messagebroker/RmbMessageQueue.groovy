package org.openforis.sepal.messagebroker

class RmbMessageQueue<M> implements MessageQueue<M> {
    private org.openforis.rmb.MessageQueue<M> messageQueue

    RmbMessageQueue(org.openforis.rmb.MessageQueue<M> messageQueue) {
        this.messageQueue = messageQueue
    }

    void publish(M message) {
        messageQueue.publish(message)
    }
}
