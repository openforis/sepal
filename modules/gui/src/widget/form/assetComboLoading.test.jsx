import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

// An asset chosen while the metadata of the one before it is still loading, in a form, over a real store. What is no
// longer selected is no longer loaded: giving up on it is not a failure, of it or of the asset chosen instead.

const fake = vi.hoisted(() => ({requests: []}))
vi.mock('~/apiRegistry', async () => {
    const {of, Subject} = await import('rxjs')
    return {default: {
        gee: {
            // Answered when a test answers, as Earth Engine answers: later.
            assetMetadata$: ({asset}) => {
                const answer$ = new Subject()
                fake.requests.push({id: asset, answer$})
                return answer$
            },
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}})
        }
    }}
})
vi.mock('~/translate', () => ({msg: key => `${key}`}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))

const {Form} = await import('~/widget/form')
const {withForm} = await import('~/widget/form/form')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LABEL = 'asset'
const ASSET_X = 'users/x/image-x'
const ASSET_Y = 'users/x/image-y'

let root, container, loaded

beforeEach(() => {
    fake.requests = []
    loaded = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('an asset chosen while the previous one loads', () => {
    it('is loaded and left valid, while the previous one is given up on', async () => {
        await editAsset(ASSET_X)

        await selectAsset(ASSET_Y)
        await answer(ASSET_Y)

        expect(errors()).toEqual([])
        expect(loaded.map(({asset}) => asset)).toEqual([ASSET_Y])
    })

    it('is not described by a late answer about the previous one', async () => {
        await editAsset(ASSET_X)
        await selectAsset(ASSET_Y)
        await answer(ASSET_Y)

        await answer(ASSET_X)

        expect(errors()).toEqual([])
        expect(loaded.map(({asset}) => asset)).toEqual([ASSET_Y])
    })
})

const fields = {
    asset: new Form.Field().notBlank()
}

const AssetEditor = withForm({fields})(({inputs}) =>
    <Form.AssetCombo
        input={inputs.asset}
        label={LABEL}
        allowedTypes={['Image']}
        onLoaded={payload => loaded.push(payload)}/>
)

const editAsset = async asset => {
    const initialState = {
        assets: {user: [ASSET_X, ASSET_Y].map(id => ({id, type: 'Image', updateTime: 'T1'})), other: []},
        dimensions: {width: 1024, height: 768}
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <EventShield>
                <PortalContainer/>
                <AssetEditor values={{asset}}/>
            </EventShield>
        </Provider>
    ))
    await settled()
}

const selectAsset = async id => {
    const input = field().querySelector('input')
    await act(async () => input.click())
    await act(async () => setValue(input, id))
    await act(async () => [...document.querySelectorAll('[data-hook="option"]')]
        .find(element => element.textContent.includes(id))
        .click())
    await settled()
}

const answer = async id => {
    const {answer$} = fake.requests.filter(request => request.id === id).at(-1)
    await act(async () => {
        answer$.next({type: 'Image', bandNames: ['red'], bands: [{id: 'red'}], properties: {}})
        answer$.complete()
    })
    await settled()
}

const field = () => document.querySelector(`[data-label="${LABEL}"]`)

// What the field's label says of it as errors: the tooltip of the icon marking them.
const errors = () => {
    const tooltip = field().querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const setValue = (input, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
    input.dispatchEvent(new Event('input', {bubbles: true}))
}

const settled = () => act(async () => {})
