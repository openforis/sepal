const disconnectedClients = new WeakSet()

export const closeUpstreamOnClientClose = ({proxyRequest, clientSocket}) => {
    proxyRequest.once('socket', upstreamSocket => {
        const close = () => {
            // Upstream teardown can report a reset; remember which side closed first.
            disconnectedClients.add(clientSocket)
            upstreamSocket.destroy()
        }
        if (clientSocket.destroyed) close()
        else clientSocket.once('close', close)
    })
}

// An upstream failure may destroy the downstream before reporting its own error.
export const isClientDisconnect = ({error, response}) =>
    error?.code === 'ECONNRESET' && disconnectedClients.has(response) && !response.errored
