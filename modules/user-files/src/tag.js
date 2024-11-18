const clientTag = ({username = '?', clientId}) =>
    `Client<${username}:${clientId.slice(-4)}>`

const subscriptionTag = ({username = '?', clientId, subscriptionId}) =>
    `Subscription<${username}:${clientId.slice(-4)}:${subscriptionId?.slice(-4)}>`

module.exports = {clientTag, subscriptionTag}
