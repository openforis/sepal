function createServer({httpServer, bus, port, routes, wsHandler}) {
    return {start}

    function start() {
        return bus.track('server.start', {port}, () =>
            httpServer.start({
                port,
                routes,
                wsRoutes: {'/ws': httpServer.wsStream(wsHandler)}
            })
        )
    }
}

export {createServer}
