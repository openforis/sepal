import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {lastValueFrom, throwError} from 'rxjs'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'

import {taskStatusDescription} from '~/app/home/body/tasks/taskStatusDescription'
import {Layer} from '~/app/home/map/layer/layer'
import {handleError$} from '~/app/home/map/tileProvider/earthEngineError'
import {initStore} from '~/store'
import {TranslationProvider} from '~/translate'
import {EventShield} from '~/widget/eventShield'
import {Notifications} from '~/widget/notifications'

vi.mock('~/eventPublisher', () => ({publishError: () => {}}))
vi.mock('~/log', () => ({getLogger: () => ({debug: () => {}, info: () => {}, warn: () => {}})}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, language

beforeEach(async () => {
    language = localStorage.getItem('sepal:language')
    localStorage.setItem('sepal:language', 'en')
    const store = createStore((state = {dimensions: {width: 1024, height: 768}}) => state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}>
        <TranslationProvider>
            <EventShield><Notifications/></EventShield>
        </TranslationProvider>
    </Provider>))
})

afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    if (language === null) localStorage.removeItem('sepal:language')
    else localStorage.setItem('sepal:language', language)
})

// Exercise the real translation: formatter mocks otherwise hide a translation that drops the EE attribution.
it('identifies Earth Engine in a failed-layer notification and preserves its diagnostic', async () => {
    const layer = new Layer()
    layer.addToMap$ = () => throwError(() => ({status: 500, response: {
        errorType: 'EARTH_ENGINE', messageKey: 'gee.error.earthEngineException',
        messageArgs: {earthEngineMessage: 'User memory limit exceeded.'},
        defaultMessage: 'Earth Engine: User memory limit exceeded.'
    }}))
    await act(async () => layer.add())
    expect(container.textContent).toContain('Failed to load layer')
    expect(container.textContent).toContain('Google Earth Engine: User memory limit exceeded.')
})

it('uses the same Earth Engine attribution for task failures', () => {
    expect(taskStatusDescription({statusDescription: JSON.stringify({
        messageKey: 'gee.error.earthEngineException',
        messageArgs: {earthEngineMessage: 'Computation timed out.'},
        defaultMessage: 'Earth Engine: Computation timed out.'
    })})).toBe('Google Earth Engine: Computation timed out.')
})

it('keeps direct Earth Engine tile failures identified', async () => {
    const error = {response: {text: async () => JSON.stringify({error: {message: 'User memory limit exceeded.'}})}}
    await act(async () => {
        await expect(lastValueFrom(handleError$(error, 'Retry'))).rejects.toContain('User memory limit exceeded.')
    })
    expect(container.textContent).toContain('Earth Engine tile rendering failed')
    expect(container.textContent).toContain('User memory limit exceeded.')
})

it('does not attribute an ordinary SEPAL error to Earth Engine', async () => {
    const layer = new Layer()
    layer.addToMap$ = () => throwError(() => ({status: 500, response: {
        messageKey: 'error.internal', defaultMessage: 'Internal error'
    }}))
    await act(async () => layer.add())
    expect(container.textContent).toContain('Internal error')
    expect(container.textContent).not.toContain('Earth Engine')
})
