import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {row} = vi.hoisted(() => ({row: {}}))

vi.mock('~/translate', () => ({msg: key => key}))
// The test lays the row out itself, so all the breadcrumb needs to hear is that its width changed.
vi.mock('~/widget/elementResizeDetector', () => ({
    ElementResizeDetector: ({children, onResize}) => {
        row.resize = onResize
        return children
    }
}))

// The real tooltip reads the store and opens in a portal. What a plain tooltip says is kept on the element it
// is for.
vi.mock('~/widget/tooltip', async () => {
    const {cloneElement} = await import('react')
    return {
        Tooltip: ({msg, children}) => typeof msg === 'string' ? cloneElement(children, {'data-tooltip': msg}) : children
    }
})
// What the button behind the gathered folders shows on hover is the contract here, so its tooltip is drawn
// in place, open.
vi.mock('~/widget/button', () => ({
    Button: ({tooltip}) => <div data-more>{tooltip({close: () => {}})}</div>
}))

import {Breadcrumb, BreadcrumbLabel} from './breadcrumb'
import {DropTargetContext} from './dropTargetContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Breadcrumb', () => {
    it('shows the root as the current segment, not a link, when already there', () => {
        mount({folders, folderId: null, onNavigate: () => {}})

        expect(current()).toBe(ROOT_NAME)
        expect(labels()).toEqual([])
    })

    it('offers the root as a link once you have left it', () => {
        mount({folders, folderId: 'kenya', onNavigate: () => {}})

        expect(labels()).toEqual([ROOT_NAME])
    })

    it('shows the root as an icon alone', () => {
        mount({folders, folderId: 'kenya', onNavigate: () => {}})

        expect(link(ROOT_NAME).textContent).toBe('')
        expect(link(ROOT_NAME).querySelector('[data-icon="house"]')).not.toBeNull()
    })

    it('follows the root with a chevron, as a folder, even with nothing after it', () => {
        mount({folders, folderId: null, onNavigate: () => {}})

        expect(icons(container)).toEqual(['house', 'chevron-right'])
    })

    it('reads as a path from the root', () => {
        mount({folders, folderId: '2024', onNavigate: () => {}})

        expect(icons(container)).toEqual(['house', 'chevron-right', 'chevron-right'])
        expect(container.textContent).toBe('Kenya2024')
    })

    it('navigates to an ancestor but not to the current folder', () => {
        const onNavigate = vi.fn()
        mount({folders, folderId: '2024', onNavigate})

        act(() => container.querySelectorAll('button')[0].click())

        expect(onNavigate).toHaveBeenCalledWith(null)
        expect(labels()).not.toContain('2024')
    })

    it('hovers the segment a drop would land in', () => {
        mount({folders, folderId: '2024', onNavigate: () => {}}, {target: {folderId: 'kenya'}})

        expect(hoveredLabels()).toEqual(['Kenya'])
    })

    it('hovers the root when a drop would land there', () => {
        mount({folders, folderId: '2024', onNavigate: () => {}}, {target: {folderId: null}})

        expect(hoveredLabels()).toEqual([ROOT_NAME])
    })

    it('hovers no segment while the drag is over none of them', () => {
        mount({folders, folderId: '2024', onNavigate: () => {}}, {target: null})

        expect(hoveredLabels()).toEqual([])
    })

    it('marks the folder you are in as the current one, for a screen reader', () => {
        mount({folders, folderId: Y2024.id, onNavigate: () => {}})

        expect(current()).toBe('2024')
    })

    // The link that had the focus is gone once the folder it named is the current one.
    it('hands the focus to the folder it went to', () => {
        const render = mount({folders, folderId: Q1.id, onNavigate: () => {}})
        link('Kenya').focus()

        act(() => link('Kenya').click())
        render({folderId: KENYA.id})

        expect(document.activeElement.textContent).toBe('Kenya')
    })

    it('makes the root clickable when the current folder no longer exists', () => {
        const onNavigate = vi.fn()
        mount({folders, folderId: 'deleted', onNavigate})

        expect(labels()).toEqual([ROOT_NAME])

        act(() => container.querySelectorAll('button')[0].click())

        expect(onNavigate).toHaveBeenCalledWith(null)
    })
})

describe('a path wider than its row', () => {
    it('shows every folder when the row holds them all', () => {
        rowWithRoomFor('Kenya2024Q1Q1Q2'.length)
        mount({folders, folderId: Q1Q2.id, onNavigate: () => {}})

        expect(labels()).toEqual([ROOT_NAME, 'Kenya', '2024', 'Q1'])
        expect(container.querySelector('[data-more]')).toBeNull()
    })

    it('gathers the folders above the ones the row holds behind one button', () => {
        rowWithRoomFor('2024Q1Q1Q2'.length)
        mount({folders, folderId: Q1Q2.id, onNavigate: () => {}})

        expect(labels()).toEqual([ROOT_NAME, '2024', 'Q1'])
        expect(current()).toBe('Q1Q2')
    })

    it('keeps the folder you are in when the row holds nothing more', () => {
        rowWithRoomFor(0)
        mount({folders, folderId: Q1Q2.id, onNavigate: () => {}})

        expect(labels()).toEqual([ROOT_NAME])
        expect(current()).toBe('Q1Q2')
    })

    it('shows the folders it gathers on hover, as the start of the path', () => {
        rowWithRoomFor('Q1Q2'.length)
        mount({folders, folderId: Q1Q2.id, onNavigate: () => {}})

        expect(hiddenLabels()).toEqual(['Kenya', '2024', 'Q1'])
        expect(icons(container.querySelector('[data-more]'))).toEqual(['chevron-right', 'chevron-right'])
    })

    it('opens a folder clicked among the ones gathered', () => {
        const onNavigate = vi.fn()
        rowWithRoomFor('Q1'.length)
        mount({folders, folderId: Q1.id, onNavigate})

        act(() => hiddenLink('Kenya').click())

        expect(onNavigate).toHaveBeenCalledWith(KENYA.id)
    })

    it('shows more of the path once the row widens', () => {
        rowWithRoomFor('Q1Q2'.length)
        mount({folders, folderId: Q1Q2.id, onNavigate: () => {}})

        rowWithRoomFor('Kenya2024Q1Q1Q2'.length)
        act(() => row.resize())

        expect(labels()).toEqual([ROOT_NAME, 'Kenya', '2024', 'Q1'])
    })

    it('shows more of the path once a folder in it gets a shorter name', () => {
        rowWithRoomFor('K2024'.length)
        const render = mount({folders, folderId: Y2024.id, onNavigate: () => {}})

        render({folders: [{...KENYA, name: 'K'}, Y2024, Q1, Q1Q2]})

        expect(labels()).toEqual([ROOT_NAME, 'K'])
    })
})

describe('BreadcrumbLabel', () => {
    it('reads the root as a slash', () => {
        show(<BreadcrumbLabel folders={folders} folderId={null}/>)

        expect(container.textContent).toBe('/')
    })

    it('reads a path from the root', () => {
        show(<BreadcrumbLabel folders={folders} folderId={Y2024.id}/>)

        expect(container.textContent).toBe('/Kenya2024')
        expect(icons(container)).toEqual(['chevron-right'])
    })

    it('gathers the folders above the ones that fit in an ellipsis, as the breadcrumb does', () => {
        rowWithRoomFor('Q1Q1Q2'.length)
        show(<BreadcrumbLabel folders={folders} folderId={Q1Q2.id}/>)

        expect(container.textContent).toBe('/…Q1Q1Q2')
        expect(icons(container)).toEqual(['chevron-right', 'chevron-right'])
    })

    it('names the folders it gathers on hover, and offers no way to them', () => {
        rowWithRoomFor('Q1Q1Q2'.length)
        show(<BreadcrumbLabel folders={folders} folderId={Q1Q2.id}/>)

        expect(container.querySelector('[data-tooltip]').getAttribute('data-tooltip')).toBe('Kenya > 2024')
        expect(container.querySelector('button')).toBeNull()
    })
})

const ROOT_NAME = 'process.recipeList.root'

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const Y2024 = {id: '2024', name: '2024', parentId: 'kenya'}
const Q1 = {id: 'q1', name: 'Q1', parentId: '2024'}
const Q1Q2 = {id: 'q1q2', name: 'Q1Q2', parentId: 'q1'}
const folders = [KENYA, Y2024, Q1, Q1Q2]

let mounted
let container

// Returns a way to render again with changed props, as the list does once a navigation lands.
const mount = (props, drag = null) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = changes => act(() => root.render(
        <DropTargetContext.Provider value={drag}>
            <Breadcrumb {...props} {...changes}/>
        </DropTargetContext.Provider>
    ))
    render()
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
    return render
}

const show = element => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(element))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

// Lays the path out in a row with room for so many characters of folder names: past that, the names shown
// are cut.
const rowWithRoomFor = characters =>
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
        .mockImplementation(() => shownNames().length > characters ? 1 : 0)

// The folders the button holds are in its tooltip, not in the row.
const shownNames = () => {
    const row = container.cloneNode(true)
    row.querySelectorAll('[data-more]').forEach(more => more.remove())
    return row.textContent.replace(/[/…]/g, '')
}

// What a segment is called: the root has only an icon, so it is known by the name a screen reader is given.
const nameOf = element => element.getAttribute('aria-label') || element.textContent

const pathButtons = () => [...container.querySelectorAll('button')].filter(button => !button.closest('[data-more]'))

const labels = () => pathButtons().map(nameOf)

const link = label => pathButtons().find(button => nameOf(button) === label)

const hiddenLabels = () => [...container.querySelectorAll('[data-more] button')].map(button => button.textContent)

const hiddenLink = label => [...container.querySelectorAll('[data-more] button')].find(button => button.textContent === label)

const current = () => nameOf(container.querySelector('[aria-current="page"]'))

const icons = element => [...element.querySelectorAll('[data-icon]')].map(icon => icon.getAttribute('data-icon'))

const hoveredLabels = () => [...container.querySelectorAll('button')]
    .filter(button => button.className.includes('hoverForcedOn'))
    .map(nameOf)

beforeEach(() => {
    mounted = []
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
    vi.restoreAllMocks()
})
