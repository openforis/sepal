import {createServer} from '#mcp/server'

describe('Server adapter', () => {

    it('routes a WS connection at /ws through wsStream to the handler', async () => {
        const httpServer = aFakeHttpServer()
        let receivedCtx
        const wsHandler = ctx => { receivedCtx = ctx }
        const server = createServer({
            httpServer,
            bus: passthroughBus(),
            port: 8080,
            routes: () => {},
            wsHandler
        })

        await server.start()

        httpServer.connectWs('/ws', {arg$: 'inbound-stream'})

        expect(receivedCtx).toEqual({arg$: 'inbound-stream'})
    })

    it('wraps the start in a server.start span', async () => {
        const httpServer = aFakeHttpServer()
        const bus = aSpyBus()
        const server = createServer({
            httpServer,
            bus,
            port: 8080,
            routes: () => {},
            wsHandler: () => null
        })

        await server.start()

        expect(bus.spans).toEqual([
            {name: 'server.start', attrs: {port: 8080}}
        ])
    })
})

function aFakeHttpServer() {
    let wsRoutes = {}
    return {
        wsStream(handler) {
            return ctx => handler(ctx)
        },
        async start(opts) {
            wsRoutes = opts.wsRoutes ?? {}
        },
        connectWs(path, ctx) {
            return wsRoutes[path]?.(ctx)
        }
    }
}

function passthroughBus() {
    return {track: (_name, _attrs, work) => work()}
}

function aSpyBus() {
    const spans = []
    return {
        async track(name, attrs, work) {
            spans.push({name, attrs})
            return work()
        },
        spans
    }
}
