function guiProductRequest$(guiRequests, context, action, params) {
    return guiRequests.request$({
        channel: context.channel,
        clientId: context.clientId,
        subscriptionId: context.subscriptionId,
        action,
        params
    })
}

module.exports = {guiProductRequest$}
