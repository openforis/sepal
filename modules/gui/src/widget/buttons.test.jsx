import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import lookStyles from '~/style/look.module.css'
import {Buttons} from '~/widget/buttons'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

it.each([false, true])('shows the selected read-only choices while refusing changes (multiple=%s)', async multiple => {
    const onChange = vi.fn()
    await open({disabled: true, readOnly: true, multiple, selected: multiple ? ['a', 'c'] : 'b', onChange})
    expect([...container.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
    expect(selected()).toEqual(multiple ? ['a', 'c'] : ['b'])
    await act(async () => [...container.querySelectorAll('button')].forEach(button => button.click()))
    expect(onChange).not.toHaveBeenCalled()
})

it('keeps the existing ordinary disabled appearance', async () => {
    await open({disabled: true, selected: 'b'})
    expect(selected()).toEqual([])
})

it('keeps an editable group highlighted and interactive', async () => {
    const onChange = vi.fn()
    await open({selected: 'b', onChange})
    expect(selected()).toEqual(['b'])
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'c').click())
    expect(onChange).toHaveBeenCalledWith('c', undefined)
})

const selected = () => [...container.querySelectorAll('button')].filter(button => button.classList.contains(lookStyles.highlight)).map(button => button.textContent)
const open = async props => {
    const store = createStore((state = {dimensions: {width: 1024, height: 768}}) => state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<Provider store={store}>
        <Buttons options={['a', 'b', 'c']} {...props}/>
    </Provider>))
}
