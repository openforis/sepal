function createServer({httpServer, tracer, port, routes, wsHandler}) {
    return {start}

    function start() {
        return tracer.span('server.start', {port}, () =>
            httpServer.start({
                port,
                routes,
                wsRoutes: {'/ws': httpServer.wsStream(wsHandler)}
            })
        )
    }
}

module.exports = {createServer}
