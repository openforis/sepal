import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const positiveNumber = name => value => {
    const number = Number(value)
    if (!(number > 0)) {
        throw new Error(`${name} must be a positive number, got: ${value}`)
    }
    return number
}

// Compose passes an unset variable as an empty string, which would defeat the option's default.
const ignoreEmptyEnv = command => {
    command.options
        .filter(({envVar}) => envVar && process.env[envVar] === '')
        .forEach(({envVar}) => delete process.env[envVar])
    return command
}

const program = new Command()

program
    .addOption(new Option('--port <number>').env('HTTP_PORT').argParser(Number).default(80))
    .addOption(new Option('--deploy-environment <value>').env('DEPLOY_ENVIRONMENT').default('PROD'))
    .addOption(new Option('--sepal-version <value>').env('SEPAL_VERSION').default('latest'))
    .addOption(new Option('--docker-registry-host <value>').env('DOCKER_REGISTRY_HOST').default('localhost'))
    .addOption(new Option('--sepal-host-data-dir <value>').env('SEPAL_HOST_DATA_DIR').makeOptionMandatory())
    .addOption(new Option('--sepal-host-project-dir <value>').env('SEPAL_HOST_PROJECT_DIR'))
    .addOption(new Option('--syslog-address <value>').env('SYSLOG_ADDRESS'))
    .addOption(new Option('--task-max-concurrent <number>').env('TASK_MAX_CONCURRENT').argParser(positiveNumber('TASK_MAX_CONCURRENT')).default(30))
    .addOption(new Option('--task-max-concurrent-local <number>').env('TASK_MAX_CONCURRENT_LOCAL').argParser(positiveNumber('TASK_MAX_CONCURRENT_LOCAL')).default(4))
    .addOption(new Option('--task-max-concurrent-per-user <number>').env('TASK_MAX_CONCURRENT_PER_USER').argParser(positiveNumber('TASK_MAX_CONCURRENT_PER_USER')).default(5))
    .addOption(new Option('--task-local-memory-mb <number>').env('TASK_LOCAL_MEMORY_MB').argParser(positiveNumber('TASK_LOCAL_MEMORY_MB')).default(4096))
    .addOption(new Option('--task-memory-mb <number>').env('TASK_MEMORY_MB').argParser(positiveNumber('TASK_MEMORY_MB')).default(2048))
    .addOption(new Option('--task-cpus <number>').env('TASK_CPUS').argParser(positiveNumber('TASK_CPUS')).default(1))

ignoreEmptyEnv(program).parse()

export const config = program.opts()

// Where task-manager itself sees ${SEPAL_HOST_DATA_DIR}/task-manager/tasks.
export const TASK_DIR = '/var/lib/sepal/task-manager/tasks'

log.info('Configuration loaded')
