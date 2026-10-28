import {act, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import lookStyles from '~/style/look.module.css'

// Which option a Combo's list highlights for the keyboard, through the real list, keybindings and options: after a
// choice its picker removes - an Add popup, which stays open - the option that followed it; after anything else, as
// before. Each key is pressed as the document receives it.

vi.mock('~/translate', () => ({msg: key => key}))

const {Combo} = await import('./combo')
const {EventShield} = await import('./eventShield')
const {PortalContainer} = await import('./portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, chosen

beforeEach(() => {
    store = createStore((state = {dimensions: {width: 1024, height: 768}}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    chosen = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})

describe('a picker that stays open, removing what is chosen', () => {
    it('highlights the next option that can be chosen, past an option that cannot and a heading', async () => {
        await show(<AddingPicker options={GROUPED}/>)
        await press('ArrowDown')
        expect(highlighted()).toEqual(['blue'])

        await press('Enter')

        expect(chosen).toEqual(['blue'])
        expect(highlighted()).toEqual(['red'])

        await press('Enter')

        expect(chosen).toEqual(['blue', 'red'])
        expect(highlighted()).toEqual(['ndvi'])
    })

    it('adds what is clicked once, staying open', async () => {
        await show(<AddingPicker options={GROUPED}/>)

        await click(option('ndvi'))

        expect(chosen).toEqual(['ndvi'])
        expect(offered()).toEqual(['Image bands', 'aerosol', 'blue', 'green', 'red', 'Indexes', 'ndwi'])
    })

    it('highlights as before when its options change without a choice', async () => {
        await show(<AddingPicker options={GROUPED}/>)
        await press('ArrowDown')
        await press('ArrowDown')
        expect(highlighted()).toEqual(['red'])

        await show(<AddingPicker options={GROUPED} withdrawn={['red']}/>)

        expect(highlighted()).toEqual(['aerosol'])
    })
})

describe('a picker that stays open, keeping what is chosen', () => {
    it('highlights the first match of a filter typed after a choice', async () => {
        await show(<KeepingPicker options={LETTERS}/>)
        await press('ArrowDown')
        await press('Enter')
        expect(chosen).toEqual(['b1'])

        await typeFilter('a')

        expect(offered()).toEqual(['a1', 'a2'])
        expect(highlighted()).toEqual(['a1'])
    })
})

describe('an ordinary selector', () => {
    it('closes on a choice, and opens again with it highlighted', async () => {
        await show(<Selector options={LETTERS}/>)
        await click(input())
        await press('ArrowDown')

        await press('Enter')

        expect(chosen).toEqual(['b1'])
        expect(offered()).toEqual([])

        await click(input())

        expect(highlighted()).toEqual(['b1'])
    })
})

const GROUPED = [
    {label: 'Image bands', options: ['aerosol', 'blue', 'green', 'red'].map(value => ({value, label: value, disabled: value === 'green'}))},
    {label: 'Indexes', options: [{value: 'ndvi', label: 'ndvi'}, {value: 'ndwi', label: 'ndwi'}]}
]

const LETTERS = ['a1', 'b1', 'a2', 'b2'].map(value => ({value, label: value}))

// Offers what has not been chosen, or `withdrawn`, as the Add popups offer what is not yet added.
const AddingPicker = ({options, withdrawn = []}) => {
    const [added, setAdded] = useState([])
    const offer = options => options
        .map(option => option.options ? {...option, options: offer(option.options)} : option)
        .filter(option => option.options || ![...added, ...withdrawn].includes(option.value))
    return (
        <Combo
            options={offer(options)}
            stayOpenOnSelect
            autoOpen
            autoFocus
            onChange={({value}) => {
                chosen.push(value)
                setAdded(added => [...added, value])
            }}
        />
    )
}

// Offers every option whatever is chosen, and nothing else changes with a choice.
const KeepingPicker = ({options}) => (
    <Combo
        options={options}
        stayOpenOnSelect
        autoOpen
        autoFocus
        onChange={({value}) => chosen.push(value)}
    />
)

const Selector = ({options}) => {
    const [value, setValue] = useState()
    return (
        <Combo
            options={options}
            value={value}
            onChange={({value}) => {
                chosen.push(value)
                setValue(value)
            }}
        />
    )
}

// The picker shown, or shown again with other props, its state kept.
const show = async picker => {
    await act(async () => root.render(
        <Provider store={store}>
            <EventShield>
                <PortalContainer/>
                {picker}
            </EventShield>
        </Provider>
    ))
    await settled()
}

const press = async key => {
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true})))
    await settled()
}

const click = async element => {
    await act(async () => element.click())
    await settled()
}

const typeFilter = async text => {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), text)
        input().dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

const input = () => container.querySelector('input')

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

const option = label => options().find(element => element.textContent === label)

// What the options list shows, headings and options that cannot be chosen included.
const offered = () => [...document.querySelectorAll('li')].map(element => element.textContent)

const highlighted = () => options()
    .filter(element => element.classList.contains(lookStyles.hoverForcedOn))
    .map(element => element.textContent)

const settled = async () => {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
