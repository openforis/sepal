const usernameTag = username =>
    username
        ? `[${username}]`
        : '<anonymous>'

const urlTag = url =>
    `[${url}]`

const moduleTag = module =>
    `Module<${module}>`

const userTag = username =>
    `User<${username}>`

module.exports = {
    usernameTag,
    urlTag,
    moduleTag,
    userTag
}
