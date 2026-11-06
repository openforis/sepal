import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import lookStyles from '~/style/look.module.css'

const scrollable = vi.hoisted(() => ({
    clientHeight: 100,
    scrollTop: 0,
    setScrollTop: offset => scrollable.scrollTop = offset
}))

vi.mock('./scrollable', () => {
    return {
        Scrollable: ({children}) => <div>{children}</div>,
        withScrollable: () => Component => props => <Component {...props} scrollable={scrollable}/>
    }
})

import {FastList} from './fastList'
import styles from './fastList.module.css'
import {Keybinding} from './keybinding'
import {ListItem} from './listItem'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ITEM_HEIGHT = 20

describe('FastList hover', () => {
    let container, root

    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            return {height: this.querySelectorAll('[data-item]').length * ITEM_HEIGHT}
        })
        scrollable.scrollTop = 0
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('leaves hovering to the mouse before any key is pressed', () => {
        renderList()

        expect(hover()).toEqual({a: 'mouse', b: 'mouse', c: 'mouse'})
    })

    it('an arrow key hovers an item and cancels mouse hover on the others', () => {
        renderList()

        press('ArrowDown')
        press('ArrowDown')

        expect(hover()).toEqual({a: 'off', b: 'keyboard', c: 'off'})
    })

    it('ArrowUp stops at the first item', () => {
        renderList()
        press('ArrowDown')

        press('ArrowUp')

        expect(hover()).toEqual({a: 'keyboard', b: 'off', c: 'off'})
    })

    it('Escape leaves keyboard hover alone and reaches other keybindings', () => {
        const onEscape = vi.fn()
        const otherRoot = createRoot(document.createElement('div'))
        act(() => otherRoot.render(<Keybinding keymap={{Escape: onEscape}}/>))
        renderList()
        press('ArrowDown')

        press('Escape')

        expect(hover()).toEqual({a: 'keyboard', b: 'off', c: 'off'})
        expect(onEscape).toHaveBeenCalled()
        act(() => otherRoot.unmount())
    })

    it('a change of items hands hovering back to the mouse', () => {
        renderList()
        press('ArrowDown')

        renderList({items: [{id: 'a'}, {id: 'b'}]})

        expect(hover()).toEqual({a: 'mouse', b: 'mouse'})
    })

    it('an update of the same items keeps keyboard hover and scroll position', () => {
        const onEnter = vi.fn()
        const items = manyItems()
        renderList({items, onEnter})
        press('End')
        const scrollTop = scrollable.scrollTop
        const updatedItems = items.map(item => ({...item, progress: 50}))

        renderList({items: updatedItems, onEnter})
        press('Enter')

        expect(scrollable.scrollTop).toEqual(scrollTop)
        expect(onEnter).toHaveBeenCalledWith(updatedItems.at(-1))
    })

    it('reordered items reset keyboard hover and scroll position', () => {
        const items = manyItems()
        renderList({items})
        press('End')

        renderList({items: items.toReversed()})

        expect(mouseShield()).toBeNull()
        expect(scrollable.scrollTop).toEqual(0)
    })

    it('moving the mouse over the list cancels keyboard hover', () => {
        renderList()
        press('ArrowDown')

        moveMouse(mouseShield())

        expect(hover()).toEqual({a: 'mouse', b: 'mouse', c: 'mouse'})
    })

    it('pressing a mouse button over the list cancels keyboard hover', () => {
        renderList()
        press('ArrowDown')

        act(() => mouseShield().dispatchEvent(new MouseEvent('mousedown', {bubbles: true})))

        expect(hover()).toEqual({a: 'mouse', b: 'mouse', c: 'mouse'})
    })

    it('moving the mouse outside the list keeps keyboard hover', () => {
        renderList()
        press('ArrowDown')

        moveMouse(document.body)

        expect(hover()).toEqual({a: 'keyboard', b: 'off', c: 'off'})
    })

    it('Enter selects the keyboard hovered item', () => {
        const onEnter = vi.fn()
        renderList({onEnter})
        press('ArrowDown')

        press('Enter')

        expect(onEnter).toHaveBeenCalledWith({id: 'a'})
    })

    it('Enter selects nothing once the mouse has cancelled keyboard hover', () => {
        const onEnter = vi.fn()
        renderList({onEnter})
        press('ArrowDown')
        moveMouse(mouseShield())

        press('Enter')

        expect(onEnter).not.toHaveBeenCalled()
    })

    it('an arrow key scrolls down just enough to show an item below the view', () => {
        renderList({items: manyItems(), overflow: 2})

        times(6, () => press('ArrowDown'))

        expect(scrollable.scrollTop).toEqual(6 * ITEM_HEIGHT - scrollable.clientHeight)
    })

    it('an arrow key scrolls up just enough to show an item above the view', () => {
        renderList({items: manyItems(), overflow: 2})
        times(11, () => press('ArrowDown'))
        const lastHovered = 10

        times(6, () => press('ArrowUp'))

        expect(scrollable.scrollTop).toEqual((lastHovered - 6) * ITEM_HEIGHT)
    })

    it('an arrow key does not scroll when the item is already in view', () => {
        renderList({items: manyItems(), overflow: 2})

        times(5, () => press('ArrowDown'))

        expect(scrollable.scrollTop).toEqual(0)
    })

    it('an arrow key brings back an item scrolled out of the rendered items', () => {
        renderList({items: manyItems(), overflow: 2})
        press('ArrowDown')
        scrollable.scrollTop = 80 * ITEM_HEIGHT

        press('ArrowDown')

        expect(scrollable.scrollTop).toEqual(ITEM_HEIGHT)
    })

    it('ArrowDown starts from the mouse hovered item', () => {
        renderList()
        hoverWithMouse('b')

        press('ArrowDown')

        expect(hover()).toEqual({a: 'off', b: 'off', c: 'keyboard'})
    })

    it('ArrowUp starts from the mouse hovered item', () => {
        renderList()
        hoverWithMouse('b')

        press('ArrowUp')

        expect(hover()).toEqual({a: 'keyboard', b: 'off', c: 'off'})
    })

    it('an arrow key no longer starts from an item the mouse has left', () => {
        renderList()
        hoverWithMouse('b')
        leaveWithMouse('b')

        press('ArrowDown')

        expect(hover()).toEqual({a: 'keyboard', b: 'off', c: 'off'})
    })

    it('PageDown moves a page down, keeping the item it left in view', () => {
        const onEnter = vi.fn()
        renderList({items: manyItems(), onEnter})
        press('ArrowDown')

        press('PageDown')
        press('PageDown')
        press('Enter')

        expect(onEnter).toHaveBeenCalledWith({id: 'item-8'})
        expect(scrollable.scrollTop).toEqual(9 * ITEM_HEIGHT - scrollable.clientHeight)
    })

    it('PageUp moves a page up, keeping the item it left in view', () => {
        const onEnter = vi.fn()
        renderList({items: manyItems(), onEnter})
        times(21, () => press('ArrowDown'))

        press('PageUp')
        press('PageUp')
        press('Enter')

        expect(onEnter).toHaveBeenCalledWith({id: 'item-12'})
        expect(scrollable.scrollTop).toEqual(12 * ITEM_HEIGHT)
    })

    it('PageDown stops at the last item', () => {
        renderList()

        press('PageDown')
        press('PageDown')

        expect(hover()).toEqual({a: 'off', b: 'off', c: 'keyboard'})
    })

    it('PageUp stops at the first item', () => {
        renderList()
        press('ArrowDown')
        press('ArrowDown')

        press('PageUp')

        expect(hover()).toEqual({a: 'keyboard', b: 'off', c: 'off'})
    })

    it('PageDown starts from the mouse hovered item', () => {
        const onEnter = vi.fn()
        renderList({items: manyItems(), onEnter})
        hoverWithMouse('item-1')

        press('PageDown')
        press('Enter')

        expect(onEnter).toHaveBeenCalledWith({id: 'item-5'})
    })

    it('End moves to the last item and scrolls it into view', () => {
        const onEnter = vi.fn()
        const items = manyItems()
        renderList({items, onEnter})

        press('End')
        press('Enter')

        expect(onEnter).toHaveBeenCalledWith(items.at(-1))
        expect(scrollable.scrollTop).toEqual(items.length * ITEM_HEIGHT - scrollable.clientHeight)
    })

    it('Home moves to the first item and scrolls it into view', () => {
        const onEnter = vi.fn()
        const items = manyItems()
        renderList({items, onEnter})
        press('End')

        press('Home')
        press('Enter')

        expect(onEnter).toHaveBeenCalledWith(items[0])
        expect(scrollable.scrollTop).toEqual(0)
    })

    const manyItems = () =>
        Array.from({length: 100}, (_, index) => ({id: `item-${index}`}))

    const times = (count, action) =>
        Array.from({length: count}).forEach(action)

    const renderList = props => {
        act(() => root.render(
            <FastList
                items={[{id: 'a'}, {id: 'b'}, {id: 'c'}]}
                itemKey={({id}) => id}
                itemRenderer={({id}, hovered) => <div data-item><ListItem hovered={hovered} onClick={() => {}}>{id}</ListItem></div>}
                {...props}
            />
        ))
        act(() => vi.advanceTimersByTime(100))
    }

    const press = key =>
        act(() => document.dispatchEvent(new KeyboardEvent('keydown', {key})))

    const moveMouse = element =>
        act(() => element.dispatchEvent(new MouseEvent('mousemove', {bubbles: true})))

    const mouseShield = () =>
        container.querySelector(`.${styles.mouseShield}`)

    const itemElement = id =>
        [...container.querySelectorAll('[data-item]')].find(item => item.textContent === id)

    const hoverWithMouse = id =>
        act(() => itemElement(id).dispatchEvent(new MouseEvent('mouseover', {bubbles: true})))

    const leaveWithMouse = id =>
        act(() => itemElement(id).dispatchEvent(new MouseEvent('mouseout', {bubbles: true, relatedTarget: document.body})))

    const hover = () =>
        Object.fromEntries(
            [...container.querySelectorAll('[data-item]')].map(item => [item.textContent, hoverOf(item)])
        )

    const hoverOf = item =>
        item.querySelector(`.${lookStyles.hoverForcedOn}`)
            ? 'keyboard'
            : mouseShield()
                ? 'off'
                : 'mouse'
})
