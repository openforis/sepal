package org.openforis.sepal.event

import groovy.json.JsonOutput
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.Producer
import org.apache.kafka.clients.producer.ProducerRecord
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.Is
import org.openforis.sepal.util.JobExecutor
import org.openforis.sepal.util.NamedThreadFactory
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

class KafkaEventDispatcher implements HandlerRegistryEventDispatcher {
    private static final Logger LOG = LoggerFactory.getLogger(HandlerRegistryEventDispatcher.class)

    private final handlersByType = new ConcurrentHashMap<Class<? extends Event>, List<EventHandler>>()
    private final String consumerGroup
    private final JobExecutor consumerPoller
    private final Producer<String, String> producer
    private final KafkaConsumer<String, String> consumer

    private boolean stopped

    KafkaEventDispatcher(String consumerGroup) {
        this.consumerGroup = consumerGroup
        consumerPoller = new ExecutorServiceBasedJobExecutor(
                Executors.newSingleThreadExecutor(NamedThreadFactory.singleThreadFactory("KafkaConsumer($consumerGroup)"))
        )
        producer = new KafkaProducer<>([
                'bootstrap.servers': '10.202.56.64:9092',
                'acks'             : 'all',
                'retries'          : 0,
                'batch.size'       : 16384,
                'linger.ms'        : 1,
                'buffer.memory'    : 33554432,
                'key.serializer'   : 'org.apache.kafka.common.serialization.StringSerializer',
                'value.serializer' : 'org.apache.kafka.common.serialization.StringSerializer',
        ])

        consumer = new KafkaConsumer<>([
                'bootstrap.servers'      : '10.202.56.64:9092',
                'group.id'               : consumerGroup,
                'enable.auto.commit'     : 'true',
                'auto.commit.interval.ms': '1000',
                'key.deserializer'       : 'org.apache.kafka.common.serialization.StringDeserializer',
                'value.deserializer'     : 'org.apache.kafka.common.serialization.StringDeserializer'
        ])
        start()
    }

    private start() {
        consumerPoller.execute {
            // TODO: Should not use classes for events - class loader issues...
            // TODO: Keep track of offset somehow
            consumer.subscribe([consumerGroup])
            while (!stopped && !Thread.currentThread().interrupted)
                pollForEvents()
        }
    }

    private pollForEvents() {
        consumer.poll(100)
                .forEach { notifyHandlers(it) }
    }

    private notifyHandlers(record) {
        LOG.warn("Got record: ${record}")

//        def handlers = handlersByType.findAll { type, potentialHandlers ->
//            type.isAssignableFrom(event.class)
//        }.collect { it.value }.flatten() as Collection<EventHandler>
//        LOG.debug("Publishing $event to $handlers")
//        handlers.each {
//            invokeHandler(it, event)
//        }
    }

    void publish(Event event) {
        def key = UUID.randomUUID().toString()
        def value = JsonOutput.toJson(event)
        def record = new ProducerRecord("my-topic", key, value)
        producer.send(record);
    }

    def <E extends Event> KafkaEventDispatcher register(Class<E> eventType, EventHandler<E> handler) {
        Is.notNull(eventType)
        Is.notNull(handler)
        def handlers = handlersByType[eventType]
        if (!handlers) {
            handlers = new CopyOnWriteArrayList<EventHandler>()
            handlersByType[eventType] = handlers
        }
        handlers.add(handler)
        return this
    }

    void stop() {
        stopped = true
        consumerPoller.stop()
        consumer.close()
        producer.close()
    }

}
