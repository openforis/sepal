const join = (...args) =>
    args.filter(Boolean).join(':')

const userTag = username =>
    `User<${username}>`
 
const clientTag = ({username = '?', clientId}) =>
    `Client<${join(username, clientId.slice(-4))}>`

const subscriptionTag = ({username = '?', clientId, subscriptionId}) =>
    `Subscription<${join(username, clientId.slice(-4), subscriptionId?.slice(-4))}>`

module.exports = {userTag, clientTag, subscriptionTag}
