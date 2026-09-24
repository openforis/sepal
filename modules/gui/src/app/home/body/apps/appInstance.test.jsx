// @vitest-environment-options {"settings": {"navigation": {"disableChildFrameNavigation": true}}}

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Jupyter apps are fetched and written into the frame, where voila's frontend still has to start and render the
// widgets. The frame must stay out of sight meanwhile, leaving the app's launch status visible beneath it.

const server = vi.hoisted(() => ({page: ''}))

vi.mock('~/compose', () => ({compose: Component => Component}))
vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/widget/tabs/tabContext', () => ({withTab: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/sectionLayout', () => ({
    ContentPadding: ({className, children}) => <div className={className}>{children}</div>
}))
vi.mock('~/apiRegistry', () => ({default: {apps: {reportInteraction$: () => of()}}}))
vi.mock('~/apps', () => ({runApp$: () => of({})}))
vi.mock('~/http-client', () => ({get$: () => of(server.page)}))

const {AppInstance} = await import('./appInstance')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SESSION_START_MS = 500
const A_WHILE_MS = 30 * 1000
const A_MOMENT_MS = 1000

describe('launching a voila app', () => {
    it('keeps the app out of sight, with its tab busy, until its widgets are rendered', () => {
        server.page = voilaPage(loadingWidget())
        launch(voilaApp())
        advance(SESSION_START_MS + A_WHILE_MS)

        expect(isShown(appFrame())).toBe(false)
        expect(tabBusy[voilaApp().id]).toBe(true)

        startFrontend(appFrame().contentWindow)
        renderWidgets(appFrame().contentWindow)
        advance(A_MOMENT_MS)

        expect(isShown(appFrame())).toBe(true)
        expect(tabBusy[voilaApp().id]).toBe(false)
    })

    // Transparency alone leaves the frame in the tab order, so the keyboard could reach an app nobody can see.
    it('keeps the app out of the keyboard\'s reach while it is out of sight', () => {
        server.page = voilaPage(loadingWidget())
        launch(voilaApp())
        advance(SESSION_START_MS + A_WHILE_MS)

        expect(isInert(appFrame())).toBe(true)

        startFrontend(appFrame().contentWindow)
        renderWidgets(appFrame().contentWindow)
        advance(A_MOMENT_MS)

        expect(isInert(appFrame())).toBe(false)
    })
})

describe('launching an app served from its own URL', () => {
    it('shows the app, and leaves it usable, while it loads', () => {
        launch(rstudioApp())
        advance(SESSION_START_MS)

        expect(isShown(appFrame())).toBe(true)
        expect(isInert(appFrame())).toBe(false)
    })
})

let container
let root
let subscriptions
let tabBusy

beforeEach(() => {
    vi.useFakeTimers()
    subscriptions = []
    tabBusy = {}
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    subscriptions.forEach(subscription => subscription.unsubscribe())
    container.remove()
    vi.useRealTimers()
})

const launch = app => act(() => root.render(
    <AppInstance
        app={app}
        tab={{busy: {set: (id, busy) => tabBusy[id] = busy}}}
        stream={(_name, stream$, next, error) => stream$ && subscriptions.push(stream$.subscribe({next, error}))}
    />
))

const advance = ms => act(() => vi.advanceTimersByTime(ms))

const appFrame = () => container.querySelector('iframe')

const isShown = frame => {
    const style = window.getComputedStyle(frame)
    return style.opacity !== '0' && style.pointerEvents !== 'none'
}

const isInert = frame => frame.hasAttribute('inert')

const startFrontend = appWindow => {
    appWindow.jupyterapp = {name: 'Voila', widgetManager: {restoredStatus: true}}
}

const renderWidgets = appWindow =>
    appWindow.document.querySelectorAll('.jp-OutputArea-output.lm-Panel').forEach(output => {
        output.innerHTML = '<div class="lm-Widget jupyter-widgets"></div>'
    })

const voilaApp = () => ({
    id: 'sbae-design',
    label: 'Sampling design',
    endpoint: 'jupyter',
    path: '/sandbox/jupyter/voila/render/shared/apps/sbae-design/ui.ipynb'
})

const rstudioApp = () => ({
    id: 'rstudio',
    label: 'RStudio',
    endpoint: 'rstudio',
    path: '/sandbox/rstudio/'
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

const loadingWidget = () =>
    '<div class="lm-Widget lm-Panel jp-OutputArea-output">Loading widget...</div>'
