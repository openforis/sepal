package org.openforis.sepal.event

import com.rabbitmq.client.*
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface Topic {
    void publish(Object message)

    void publish(Object message, String type)

    void subscribe(String subscriberName, Closure callback)

    void close()
}

class RabbitMQTopic implements Topic {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String EXCHANGE_NAME = 'sepal.topic'

    private final String topicName
    private final Connection connection
    private final Channel channel

    RabbitMQTopic(String topicName, String host, port) {
        ConnectionFactory factory = new ConnectionFactory(
                host: host,
                port: port,
                automaticRecoveryEnabled: true
        )
        this.topicName = topicName
        this.connection = factory.newConnection()
        this.channel = connection.createChannel()

        channel.exchangeDeclare(EXCHANGE_NAME, 'topic', true)
    }

    void publish(Object message) {
        publish(message, message.class.simpleName)
    }

    void publish(Object message, String type) {
        def routingKey = "$topicName.${type}"
        def body = JsonOutput.toJson(message)
        LOG.debug("Publishing message of type ${type} with routingKey ${routingKey}: ${message}")
        channel.basicPublish(EXCHANGE_NAME, routingKey, null, body.getBytes('UTF-8'))
    }

    void subscribe(String subscriberName, Closure callback) {
        def queueName = "${subscriberName}.${topicName}" as String
        LOG.debug("Subscribing to queue ${queueName}")
        channel.queueDeclare(queueName, true, false, false, null)
        channel.queueBind(queueName, EXCHANGE_NAME, "${topicName}.*")
        def deliverCallback = new DefaultConsumer(channel) {
            void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] bytes) throws IOException {
                def type = envelope.routingKey
                def ack = { channel.basicAck(envelope.deliveryTag, false) }
                def body = new JsonSlurper().parse(bytes, 'UTF-8')
                LOG.debug("Message of type ${type} delivered to queue ${queueName}: ${body}")
                callback(body, type, ack)
            }
        }
        channel.basicConsume(queueName, false, deliverCallback)
    }

    void close() {
        if (connection)
            connection.close()
    }
}