package fake

import org.openforis.sepal.event.Topic

class FakeTopic implements Topic {
    List<Closure> listeners = []


    void publish(Object message) {
        publish(message, message.class.simpleName)
    }

    void publish(Object message, String type) {
        listeners.forEach {
            it(message, type, {})
        }
    }

    void subscribe(String subscriberName, Closure callback) {
        listeners << callback
    }

    void close() {}
}
