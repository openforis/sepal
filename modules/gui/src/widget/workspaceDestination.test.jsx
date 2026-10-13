import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {PortalContainer} from '~/widget/portal'

// The workspace field rendered over a real store, recipe and form. What is replaced is the remote listing: the
// home's through the API registry, and Data's at its HTTP seam, so the Data adapter is the real one.

const {get$, listHomeFiles$} = vi.hoisted(() => ({get$: vi.fn(), listHomeFiles$: vi.fn()}))
vi.mock('~/apiRegistry', () => ({default: {userFiles: {listFiles$: listHomeFiles$}}}))
vi.mock('~/http-client', async importOriginal => ({...await importOriginal(), get$}))
vi.mock('~/api/ws.js', () => ({moduleWebSocket$: () => null}))
vi.mock('~/translate', () => ({msg: key => key}))
// Cuts an import cycle `~/user` enters through a panel reading `Form.Field` while the form barrel is still evaluating.
vi.mock('~/user', () => ({currentUser: () => ({username: 'me'})}))
// The folder browser reads the home over a websocket; it is never opened here.
vi.mock('~/widget/workspaceDestinationBrowser', () => ({WorkspaceDestinationBrowser: () => null}))

const {WorkspaceDestination} = await import('./workspaceDestination')
const {default: userData} = await import('~/api/userData')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, pathInput

beforeEach(() => {
    get$.mockReset().mockImplementation(() => of({items: {}}))
    listHomeFiles$.mockReset().mockImplementation(() => of({path: '', files: [], count: 0}))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a SEPAL workspace folder', () => {
    it.each(['data/x', 'data', './data/x', '/data/x', 'a/../data/x'])('%j, inside the home\'s data folder, is refused without listing anything', async path => {
        show({destination: 'SEPAL', path})

        await validated()

        expect(shownError()).toBe('widget.workspaceDestination.dataReserved')
        expect(listHomeFiles$).not.toHaveBeenCalled()
    })

    it('is listed in the home, hidden files included, when it is outside the data folder', async () => {
        show({destination: 'SEPAL', path: 'database/x'})

        await validated()

        expect(shownError()).toBe(null)
        expect(listHomeFiles$).toHaveBeenCalledWith('database/x', {includeHidden: true})
    })
})

describe('a Data folder', () => {
    it.each(['a//b', '/a', 'a/./b', 'a/../b', 'a\\b', 'a/'])('%j is refused without listing anything', async path => {
        show({destination: 'DATA', path})

        await validated()

        expect(shownError()).toBe('widget.workspaceDestination.invalidDataFolder')
        expect(get$).not.toHaveBeenCalled()
    })

    it('holding files is refused as not empty', async () => {
        get$.mockImplementation(() => of({items: {'a.tif': {file: true, size: 1, mtime: '2026-10-13T00:00:00Z'}}}))
        show({destination: 'DATA', path: 'exports/x'})

        await validated()

        expect(shownError()).toBe('widget.workspaceDestination.notEmpty')
        expect(get$).toHaveBeenCalledWith('/api/user-data/attachments/data/files', {query: {path: 'exports/x'}})
    })

    it('that does not exist yet is accepted', async () => {
        show({destination: 'DATA', path: 'exports/x'})

        await validated()

        expect(shownError()).toBe(null)
    })

    it('a pending Data task exports to is refused', async () => {
        show({destination: 'DATA', path: 'exports/x', tasks: [pendingTask({destination: 'DATA', outputPath: 'exports/x'})]})

        await validated()

        expect(shownError()).toBe('widget.workspaceDestination.taskPending')
    })

    it('a pending SEPAL task exports to the same path in the home does not conflict', async () => {
        show({destination: 'DATA', path: 'exports/x', tasks: [pendingTask({destination: 'SEPAL', outputPath: 'exports/x'})]})

        await validated()

        expect(shownError()).toBe(null)
    })

    it.each([400, 500])('that cannot be checked (%i) says so for Data', async status => {
        get$.mockImplementation(() => throwError(() => ({status})))
        show({destination: 'DATA', path: 'exports/x'})

        await validated()

        expect(shownError()).toBe('widget.workspaceDestination.dataLoadError')
    })

    it('defaults to exports, under the recipe\'s project, ignoring the project\'s workspace folder', () => {
        show({destination: 'DATA', projectId: 'p1'})

        expect(pathInput.value).toBe('exports/My_project/My recipe')
    })

    it('defaults to exports for a recipe without a project', () => {
        show({destination: 'DATA'})

        expect(pathInput.value).toBe('exports/My recipe')
    })

    it('cannot be browsed, the browser reading only the home', () => {
        show({destination: 'DATA', path: 'exports/x', browse: false})

        expect(container.querySelectorAll('button')).toHaveLength(0)
    })
})

it('a SEPAL folder can be browsed', () => {
    show({destination: 'SEPAL', path: 'downloads/x'})

    expect(container.querySelectorAll('button')).toHaveLength(1)
})

const RECIPE_ID = 'recipe-1'
const DEBOUNCE_MS = 750

const PROJECTS = [{id: 'p1', name: 'My project', defaultWorkspaceFolder: 'downloads/elsewhere'}]

const pendingTask = taskInfo => ({id: 'task-1', status: 'PENDING', taskInfo})

const fields = {path: new Form.Field()}

const Host = withForm({fields})(({inputs: {path}, destination, browse}) => {
    pathInput = path
    return (
        <WorkspaceDestination
            workspacePathInput={path}
            destination={destination}
            browse={browse}
            {...(destination === 'DATA' ? {listFiles$: userData.listFiles$} : {})}
        />
    )
})

const show = ({destination, path, browse, projectId = null, tasks = []}) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        tasks,
        process: {
            loadedRecipes: {[RECIPE_ID]: {id: RECIPE_ID, type: 'MOSAIC', title: 'My recipe', projectId, model: {}}},
            projects: PROJECTS,
            tabs: []
        }
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <EventShield>
                <Recipe id={RECIPE_ID}>
                    <Host values={path === undefined ? {} : {path}} destination={destination} browse={browse}/>
                </Recipe>
            </EventShield>
        </Provider>
    ))
}

// The folder is checked once its typing has settled.
const validated = () => act(() => new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS + 100)))

const shownError = () => pathInput.error || null
