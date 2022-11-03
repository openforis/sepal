const Kafka = require('node-rdkafka')

const producer = new Kafka.Producer({
    'metadata.broker.list': 'localhost:9092',
    'dr_cb': true // Specifies that we want a delivery-report event to be generated
})

const consumer = new Kafka.KafkaConsumer({
    'group.id': 'test-group',
    'group.instance.id': 'test-group-01',
    'metadata.broker.list': 'localhost:9092',
}, {})

const sendMessage = message => {
    console.log('producer:', message)
    try {
        producer.produce(
            // Topic to send the message to
            'test-topic',
            // optionally we can manually specify a partition for the message
            // this defaults to -1 - which will use librdkafka's default partitioner (consistent random for keyed messages, random for unkeyed messages)
            null,
            // Message to send. Must be a buffer
            Buffer.from(message),
            // for keyed messages, we also specify the key - note that this field is optional
            'somekey',
            // you can send a timestamp here. If your broker version supports it,
            // it will get added. Otherwise, we default to 0
            Date.now(),
            // you can send an opaque token here, which gets passed along
            // to your delivery reports
        )
    } catch (err) {
        console.error('A problem occurred when sending our message')
        console.error(err)
    }    
}

const interval = setInterval(() => {
    Math.random() < .1 && sendMessage('Awesome message: ' + Date.now())
}, 100)

producer
    .on('ready', () => {
        producer.on('event.error', err => {
            console.error('Error from producer:', err)
        })

        producer.on('delivery-report', (err, report) => {
            // Report of delivery statistics here:
            // console.log(report)
        })
        
        producer.setPollInterval(100)
    })

consumer
    .on('ready', () => {
        consumer.subscribe(['test-topic']);
        consumer.consume();
    })
    .on('data', function(data) {
        console.log('consumer:', data.value.toString());
    })

producer.connect()
consumer.connect()

process.on('SIGINT', () => {
    clearInterval(interval)
    producer.disconnect()
    consumer.disconnect()  
})
