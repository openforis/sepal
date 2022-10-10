const usernameTag = username =>
    username
        ? `[${username}]`
        : '<anonymous>'

const urlTag = url =>
    `[${url}]`
    
module.exports = {
    usernameTag,
    urlTag
}
