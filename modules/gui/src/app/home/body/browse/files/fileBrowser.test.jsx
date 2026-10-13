import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {setApi} from '~/apiRegistry'

vi.mock('~/enabled', () => ({
    withEnableDetector: () => Component => props =>
        <Component {...props} enableDetector={{onChange: () => {}, isEnabled: () => true}}/>
}))
vi.mock('~/subscription', () => ({
    withSubscriptions: () => Component => props =>
        <Component {...props} addSubscription={() => {}}/>
}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/button', () => ({
    Button: ({icon, disabled, label, onClick}) =>
        <button data-icon={icon} disabled={disabled} onClick={onClick}>{label}</button>
}))
vi.mock('~/widget/removeButton', () => ({
    RemoveButton: ({disabled}) => <button data-icon='remove' disabled={disabled}/>
}))
vi.mock('~/widget/toggleButton', () => ({ToggleButton: () => null}))
vi.mock('~/widget/sortButtons', () => ({SortButtons: () => null}))
vi.mock('~/widget/icon', () => ({Icon: () => null}))
vi.mock('~/widget/scrollable', () => ({Scrollable: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/sectionLayout', () => ({
    SectionLayout: ({children}) => <div>{children}</div>,
    Content: ({children}) => <div>{children}</div>
}))
vi.mock('~/widget/layout', () => ({Layout: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/buttonGroup', () => ({ButtonGroup: ({children}) => <div>{children}</div>}))

import {FileBrowser} from './fileBrowser'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('FileBrowser toolbar', () => {
    let container, root, ws

    beforeEach(() => {
        ws = fakeUserFilesWs()
        setApi({
            userFiles: {ws: () => ws, downloadUrl: path => `/files/${path}`},
            userData: {ws: () => fakeUserFilesWs(), downloadUrl: path => `/data/${path}`}
        })
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('renders with nothing selected', () => {
        render()

        expect(button('download').disabled).toBe(true)
        expect(button('remove').disabled).toBe(true)
    })

    it('cannot remove the Data folder', () => {
        render()

        select('browse.data.label')

        expect(button('remove').disabled).toBe(true)
    })

    it('can download a single selected file', () => {
        render()

        select('report.txt')

        expect(button('download').disabled).toBe(false)
        expect(button('remove').disabled).toBe(false)
    })

    const render = () => {
        act(() => root.render(<FileBrowser/>))
        act(() => ws.ready(true))
        act(() => ws.update({path: '', items: {'report.txt': {file: true, size: 1, mtime: 2}}}))
    }

    const select = name => {
        const row = [...container.querySelectorAll('li > div')].find(div => div.textContent.includes(name))
        act(() => row.click())
    }

    const button = icon =>
        container.querySelector(`button[data-icon="${icon}"]`)
})

const fakeUserFilesWs = () => {
    const upstream$ = new Subject()
    const downstream$ = new Subject()
    return {
        upstream$,
        downstream$,
        ready: ready => downstream$.next({ready}),
        update: data => downstream$.next({data})
    }
}
