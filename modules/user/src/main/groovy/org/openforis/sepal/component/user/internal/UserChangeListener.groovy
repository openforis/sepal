package org.openforis.sepal.component.user.internal

import groovy.json.JsonOutput
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerRecord

interface UserChangeListener {
    void changed(String username, Map user)
}

class KafkaPublishingUserChangeListener implements UserChangeListener {
    private final producer = new KafkaProducer<>([
            'bootstrap.servers': '10.202.56.64:9092',
            'acks'             : 'all',
            'retries'          : 0,
            'batch.size'       : 16384,
            'linger.ms'        : 1,
            'buffer.memory'    : 33554432,
            'key.serializer'   : 'org.apache.kafka.common.serialization.StringSerializer',
            'value.serializer' : 'org.apache.kafka.common.serialization.StringSerializer',
    ])

    void changed(String username, Map user) {
        def userJson = user == null ? null : JsonOutput.toJson(user)
        producer.send(
                new ProducerRecord("users", username, userJson)
        )
    }
}