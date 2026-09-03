import {tag} from '#sepal/tag'

// instanceTag/sessionTag take the object, or a bare id where the caller has nothing else (an
// id-only command, an event carrying just the id): the qualifier is then left out of the tag.

const instanceTag = instance =>
    typeof instance === 'string'
        ? tag('Instance', instance)
        : tag('Instance', instance?.type, instance?.id)

const sessionTag = session =>
    typeof session === 'string'
        ? tag('Session', session)
        : tag('Session', session?.username, session?.id)

const taskTag = taskId => tag('Task', taskId)

const userTag = username => tag('User', username)

const clientTag = clientId => tag('Client', clientId)

const subscriptionTag = (username, subscriptionId) => tag('Subscription', username, subscriptionId)

const containerTag = containerName => tag('Container', containerName)

export {
    clientTag,
    containerTag,
    instanceTag,
    sessionTag,
    subscriptionTag,
    taskTag,
    userTag}
