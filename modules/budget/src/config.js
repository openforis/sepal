import {program} from 'commander'

program.exitOverride()
program
    .option('--port <number>', 'HTTP port', v => parseInt(v, 10), 80)
    .option('--rabbitmq-host <string>', 'RabbitMQ host', 'rabbitmq')
    .option('--rabbitmq-port <number>', 'RabbitMQ port', v => parseInt(v, 10), 5672)
    .option('--user-url <string>', 'user-module base URL', 'http://user/')
    .option('--sepal-user <string>', 'admin username for internal calls', 'sepalAdmin')
    .option('--worker-url <string>', 'worker base URL (reconciliation/seed)', 'http://worker')
    .allowUnknownOption()
    .parse()

const opts = program.opts()
export const config = {
    port: opts.port,
    rabbitmqHost: process.env.RABBITMQ_HOST || opts.rabbitmqHost,
    rabbitmqPort: process.env.RABBITMQ_PORT || opts.rabbitmqPort,
    userUrl: process.env.USER_URL || opts.userUrl,
    sepalUser: process.env.SEPAL_USER || opts.sepalUser,
    workerUrl: process.env.WORKER_URL || opts.workerUrl
}
export const amqpUri = `amqp://${config.rabbitmqHost}:${config.rabbitmqPort}`
