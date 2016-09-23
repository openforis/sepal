package fake

import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageConsumer
import org.openforis.sepal.messagebroker.MessageQueue

class FakeMessageBroker implements MessageBroker {
    void start() {}

    void stop() {}

    def <M> MessageQueue<M> createMessageQueue(String queueName, Class<M> messageType, MessageConsumer<M> consumer) {
        new FakeMessageQueue(consumer)
    }
}

class FakeMessageQueue<M> implements MessageQueue<M> {
    private final MessageConsumer<M> consumer

    FakeMessageQueue(MessageConsumer<M> consumer) {
        this.consumer = consumer
    }

    void publish(M message) {
        consumer.consume(message)
    }
}
