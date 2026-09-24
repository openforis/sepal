import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {voilaReady$} from './voilaReady'

// Pages are shaped like voila 0.5's lab template and written into a same-origin iframe, as AppInstance does.
// Voila's frontend reports its progress on the frame's window: `jupyterapp` once it has started, and
// `widgetManager.restoredStatus` once the widget models are restored from the kernel. A widget output is an
// empty lm-Panel reading "Loading widget..." until its view is rendered into it.

const TIMEOUT_MS = 3 * 60 * 1000
const A_WHILE_MS = 30 * 1000
const A_MOMENT_MS = 1000

describe('a page that is not a voila notebook', () => {
    it('is ready as soon as it is written', () => {
        const watch = watchReady(frameWith(jupyterLabPage()))

        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })

    it('includes a voila error page', () => {
        const watch = watchReady(frameWith(voilaErrorPage()))

        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })
})

describe('a page still being parsed', () => {
    it('is not ready, even though no voila notebook has been parsed yet', () => {
        const appWindow = frameWith(pageHead())
        stillParsing(appWindow)
        const watch = watchReady(appWindow)

        advance(A_WHILE_MS)

        expect(watch.ready).toBe(false)
    })
})

describe('a voila notebook', () => {
    it('is not ready while the voila frontend has not started', () => {
        const watch = watchReady(frameWith(voilaPage(loadingWidget())))

        advance(A_WHILE_MS)

        expect(watch.ready).toBe(false)
    })

    it('is not ready while widget state is being restored from the kernel', () => {
        const appWindow = frameWith(voilaPage(javascriptOutput()))
        startFrontend(appWindow, {restored: false})
        const watch = watchReady(appWindow)

        advance(A_WHILE_MS)

        expect(watch.ready).toBe(false)
    })

    it('is not ready while a widget output is still loading', () => {
        const appWindow = frameWith(voilaPage(renderedWidget(), loadingWidget()))
        startFrontend(appWindow, {restored: true})
        const watch = watchReady(appWindow)

        advance(A_WHILE_MS)

        expect(watch.ready).toBe(false)
    })

    it('becomes ready once every widget output has rendered', () => {
        const appWindow = frameWith(voilaPage(javascriptOutput(), loadingWidget(), loadingWidget()))
        startFrontend(appWindow, {restored: true})
        const watch = watchReady(appWindow)

        renderWidgets(appWindow)
        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })

    it('does not wait for widget outputs that failed to render or were closed', () => {
        const appWindow = frameWith(voilaPage(failedWidget(), closedWidget(), renderedWidget()))
        startFrontend(appWindow, {restored: true})
        const watch = watchReady(appWindow)

        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })

    it('is ready once started when voila could not create a widget manager', () => {
        const appWindow = frameWith(voilaPage())
        startFrontend(appWindow, {widgetManager: null})
        const watch = watchReady(appWindow)

        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })

    it('is not waited for once its kernel has died', () => {
        const appWindow = frameWith(voilaPage(loadingWidget()))
        startFrontend(appWindow, {restored: false, kernel: {status: 'dead', connectionStatus: 'connected'}})
        const watch = watchReady(appWindow)

        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })

    it('is not waited for once its kernel connection has given up', () => {
        const appWindow = frameWith(voilaPage(loadingWidget()))
        startFrontend(appWindow, {restored: false, kernel: {status: 'idle', connectionStatus: 'disconnected'}})
        const watch = watchReady(appWindow)

        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })

    it('stops being waited for after three minutes', () => {
        const watch = watchReady(frameWith(voilaPage(loadingWidget())))

        advance(TIMEOUT_MS - 1)
        expect(watch.ready).toBe(false)

        advance(1)
        expect(watch.ready).toBe(true)
    })

    it('is reported ready once', () => {
        const appWindow = frameWith(voilaPage(renderedWidget()))
        startFrontend(appWindow, {restored: true})
        const watch = watchReady(appWindow)

        advance(TIMEOUT_MS * 2)

        expect(watch.readyCount).toBe(1)
    })
})

describe('a frame that cannot be inspected', () => {
    it('is ready straight away rather than hidden for good', () => {
        const watch = watchReady(uninspectableWindow())

        advance(A_MOMENT_MS)

        expect(watch.ready).toBe(true)
    })
})

let frames
let subscriptions

beforeEach(() => {
    vi.useFakeTimers()
    frames = []
    subscriptions = []
})

afterEach(() => {
    subscriptions.forEach(subscription => subscription.unsubscribe())
    frames.forEach(frame => frame.remove())
    vi.useRealTimers()
})

const watchReady = appWindow => {
    const watch = {
        readyCount: 0,
        get ready() {
            return this.readyCount > 0
        }
    }
    subscriptions.push(voilaReady$(appWindow).subscribe(() => watch.readyCount++))
    return watch
}

const advance = ms => vi.advanceTimersByTime(ms)

const frameWith = html => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    frames.push(frame)
    const doc = frame.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()
    return frame.contentWindow
}

// happy-dom parses a written document at once. A browser stops at the page's blocking head scripts, leaving the
// document loading with only its head parsed, for as long as those scripts take to load.
const stillParsing = appWindow =>
    Object.defineProperty(appWindow.document, 'readyState', {configurable: true, get: () => 'loading'})

const startFrontend = (appWindow, {
    restored = true,
    kernel = {status: 'busy', connectionStatus: 'connected'},
    widgetManager = {restoredStatus: restored, kernel}
}) => {
    appWindow.jupyterapp = {name: 'Voila', widgetManager}
}

const renderWidgets = appWindow =>
    appWindow.document.querySelectorAll('.jp-OutputArea-output.lm-Panel').forEach(output => {
        if (output.textContent === 'Loading widget...') {
            output.innerHTML = '<div class="lm-Widget jupyter-widgets"></div>'
        }
    })

const voilaPage = (...outputs) => `<!DOCTYPE html>
<html>
<head><title>ui</title></head>
<body class="jp-Notebook theme-light" data-base-url="/api/sandbox/jupyter/voila/" data-voila="voila">
<div id="rendered_cells">
    <div>
        <div cell-index="1">${outputs.join('')}</div>
    </div>
</div>
</body>
</html>`

const pageHead = () => `<!DOCTYPE html>
<html>
<head><title>ui</title>`

const voilaErrorPage = () => `<!DOCTYPE HTML>
<html>
<head><title>Voilà</title></head>
<body data-base-url="/api/sandbox/jupyter/voila/" data-voila="voila">
<div>
    <div class="voila-error"><h1>404: Not Found</h1></div>
</div>
</body>
</html>`

const jupyterLabPage = () => `<!DOCTYPE html>
<html>
<head><title>JupyterLab</title></head>
<body class="jp-ThemedContainer"></body>
</html>`

const loadingWidget = () =>
    '<div class="lm-Widget lm-Panel jp-OutputArea-output">Loading widget...</div>'

const renderedWidget = () =>
    '<div class="lm-Widget lm-Panel jp-OutputArea-output"><div class="lm-Widget jupyter-widgets"></div></div>'

const failedWidget = () =>
    '<div class="lm-Widget lm-Panel jp-OutputArea-output jupyter-widgets">Error displaying widget: model not found</div>'

const closedWidget = () =>
    '<div class="lm-Widget lm-Panel jp-OutputArea-output lm-mod-hidden">Loading widget...</div>'

const javascriptOutput = () =>
    '<div class="lm-Widget jp-RenderedJavaScript jp-mod-trusted jp-OutputArea-output"></div>'

const uninspectableWindow = () => ({
    get document() {
        throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError')
    }
})
