const usernameTag = username =>
    username
        ? `[${username}]`
        : '<anonymous>'

const urlTag = url =>
    `[${url}]`

const eventTag = event =>
    `Event<${event}>`

const moduleTag = module =>
    `Module<${module}>`

const userTag = username =>
    `User<${username}>`

const clientTag = (username, clientId) =>
    `Client<${username || '?'}:${clientId.slice(-4)}>`

const subscriptionTag = (username = '?', clientId, subscriptionId) =>
    `Subscription<${username}:${clientId.slice(-4)}:${subscriptionId?.slice(-4)}>`

export {
    clientTag,
    eventTag,
    moduleTag,
    subscriptionTag,
    urlTag,
    usernameTag,
    userTag}
