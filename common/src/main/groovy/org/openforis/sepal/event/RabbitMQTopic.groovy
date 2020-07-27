package org.openforis.sepal.event

import com.rabbitmq.client.*
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

interface Topic {
    void publish(Object message)

    void publish(Object message, String type)

    void subscribe(String subscriberName, Closure callback)

    void close()
}

class RabbitMQTopic implements Topic {
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
        channel.basicPublish(EXCHANGE_NAME, routingKey, null, body.getBytes('UTF-8'))
    }

    void subscribe(String subscriberName, Closure callback) {
        def queueName = "${subscriberName}.${topicName}" as String
        channel.queueDeclare(queueName, true, false, false, null)
        channel.queueBind(queueName, EXCHANGE_NAME, "${topicName}.*")
        def deliverCallback = new DefaultConsumer(channel) {
            void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
                def type = envelope.routingKey
                def ack = { channel.basicAck(envelope.deliveryTag, false) }
                callback(new JsonSlurper().parse(body, 'UTF-8'), type, ack)
            }
        }
        channel.basicConsume(queueName, false, deliverCallback)
    }

    void close() {
        if (connection)
            connection.close()
    }
}