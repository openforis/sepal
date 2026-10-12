import http from 'node:http'

// A real HTTP server on a free local port, answering every request with handle(request, response).
export class FileServer {
    requests = []
    #server

    static async start(handle) {
        const fileServer = new FileServer(handle)
        await new Promise(resolve => fileServer.#server.listen(0, '127.0.0.1', resolve))
        return fileServer
    }

    constructor(handle) {
        this.#server = http.createServer((request, response) => {
            this.requests.push({path: request.url, authorization: request.headers.authorization})
            handle(request, response)
        })
    }

    url(path) {
        return `http://127.0.0.1:${this.#server.address().port}${path}`
    }

    close() {
        this.#server.closeAllConnections()
        return new Promise(resolve => this.#server.close(resolve))
    }
}

// Serves contents[name] at /<name>.
export const serving = contents => (request, response) => {
    const content = contents[request.url.slice(1)]
    content === undefined
        ? response.writeHead(404).end()
        : response.end(content)
}

// Answers with the start of a body and never finishes it.
export const holdingOpen = (_request, response) => {
    response.writeHead(200, {'Content-Length': 1000})
    response.write('partial')
}

// Calls onChunk once a body chunk has been handed to whoever reads the response, so a test can act mid-stream.
export const noticingChunks = onChunk => async (url, options) => {
    const response = await fetch(url, options)
    const reader = response.body.getReader()
    const body = new ReadableStream({
        async pull(controller) {
            const {done, value} = await reader.read()
            if (done) {
                controller.close()
            } else {
                controller.enqueue(value)
                onChunk()
            }
        },
        cancel: reason => reader.cancel(reason)
    }, {highWaterMark: 0})
    return new Response(body, {status: response.status, headers: response.headers})
}
