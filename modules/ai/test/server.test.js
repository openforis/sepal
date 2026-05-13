const {createServer} = require('#mcp/server')

describe('Server adapter', () => {

    it('routes a WS connection at /ws through wsStream to the handler', async () => {
        const httpServer = aFakeHttpServer()
        let receivedCtx
        const wsHandler = ctx => { receivedCtx = ctx }
        const server = createServer({
            httpServer,
            tracer: passthroughTracer(),
            port: 8080,
            routes: () => {},
            wsHandler
        })

        await server.start()

        httpServer.connectWs('/ws', {arg$: 'inbound-stream'})

        expect(receivedCtx).toEqual({arg$: 'inbound-stream'})
        expect(httpServer.wsStreamCalls).toEqual([wsHandler])
    })

    it('wraps the start in a server.start span', async () => {
        const httpServer = aFakeHttpServer()
        const tracer = aSpyTracer()
        const server = createServer({
            httpServer,
            tracer,
            port: 8080,
            routes: () => {},
            wsHandler: () => null
        })

        await server.start()

        expect(tracer.spans).toEqual([
            {name: 'server.start', attrs: {port: 8080}}
        ])
    })
})

function aFakeHttpServer() {
    let wsRoutes = {}
    const wsStreamCalls = []
    return {
        wsStream(handler) {
            wsStreamCalls.push(handler)
            return ctx => handler(ctx)
        },
        async start(opts) {
            wsRoutes = opts.wsRoutes ?? {}
        },
        connectWs(path, ctx) {
            return wsRoutes[path]?.(ctx)
        },
        wsStreamCalls
    }
}

function passthroughTracer() {
    return {span: (_name, _attrs, work) => work()}
}

function aSpyTracer() {
    const spans = []
    return {
        async span(name, attrs, work) {
            spans.push({name, attrs})
            return work()
        },
        spans
    }
}
