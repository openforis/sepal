function guiProductRequest$(guiRequests, context, action, params) {
    return guiRequests.request$({
        clientId: context.clientId,
        subscriptionId: context.subscriptionId,
        action,
        params
    })
}

module.exports = {guiProductRequest$}
