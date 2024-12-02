const usernameTag = username =>
    username
        ? `[${username}]`
        : '<anonymous>'

const urlTag = url =>
    `[${url}]`

const moduleTag = module =>
    `Module<${module}>`

const userTag = (username = '?', clientId = '?') =>
    `User<${username}:${clientId.slice(-4)}>`

const clientTag = (clientId = '?') =>
    `Client<${clientId.slice(-4)}>`

module.exports = {
    usernameTag,
    urlTag,
    moduleTag,
    userTag,
    clientTag
}
