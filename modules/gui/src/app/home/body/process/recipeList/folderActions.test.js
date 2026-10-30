import {defer, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// The server, as far as these actions reach it: each request waits until the test answers it, and a folder
// saved comes back in the whole folder list, which the store then holds.
const server = vi.hoisted(() => ({folders: [], pending: [], requests: [], notifications: [], offers: []}))

vi.mock('~/store', () => ({select: path => path === 'process.folders' ? server.folders : undefined}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({
    Notifications: {
        warning: ({message}) => server.notifications.push({level: 'warning', message}),
        error: ({message}) => server.notifications.push({level: 'error', message})
    }
}))
vi.mock('~/action-builder', () => ({
    actionBuilder: () => {
        const sets = {}
        const builder = {
            set: (path, value) => {
                sets[path] = value
                return builder
            },
            dispatch: () => {
                server.folders = sets['process.folders'] ?? server.folders
            }
        }
        return builder
    }
}))
vi.mock('./moveNotification', () => ({offerMoveUndo: (message, undo) => server.offers.push({message, undo})}))
vi.mock('../recipe', () => ({
    moveRecipes$: (recipeIds, folderId) => request(['move', recipeIds, folderId], () => [])
}))
vi.mock('~/apiRegistry', () => ({
    default: {folder: {save$: folder => request(['save', folder], () => saved(folder))}}
}))

const {moveItems, updateFolder} = await import('./folderActions')

describe('moving recipes and folders', () => {
    it('moves the recipes in one request', () => {
        moveItems([recipe(AT_ROOT), recipe(ALSO_AT_ROOT)], KENYA.id)

        expect(server.requests).toEqual([['move', [AT_ROOT.id, ALSO_AT_ROOT.id], KENYA.id]])
    })

    it('offers the way back once the move has landed, and not before', () => {
        moveItems([recipe(AT_ROOT)], KENYA.id)
        expect(server.offers).toEqual([])

        land()

        expect(server.offers.map(({message}) => message)).toEqual(['process.recipe.move.done'])
    })

    it('reports a move that failed, and offers no way back', () => {
        moveItems([recipe(AT_ROOT)], KENYA.id)

        fail(httpError())

        expect(server.notifications).toEqual([{level: 'error', message: 'process.recipe.move.error'}])
        expect(server.offers).toEqual([])
    })

    it('says so when the folder moved to no longer exists', () => {
        moveItems([recipe(AT_ROOT)], KENYA.id)

        fail(httpError('FOLDER_NOT_FOUND'))

        expect(server.notifications).toEqual([{level: 'error', message: 'process.recipe.move.folderNotFound'}])
    })

    // Each save answers with the whole folder list, so an answer arriving late would undo the moves before it.
    it('saves the folders one at a time', () => {
        moveItems([folder(Y2024), folder(EMPTY)], MOZAMBIQUE.id)
        expect(savedIds()).toEqual([Y2024.id])

        land(1)

        expect(savedIds()).toEqual([Y2024.id, EMPTY.id])
    })

    it('offers the way back once every folder has moved', () => {
        moveItems([folder(Y2024), folder(EMPTY)], MOZAMBIQUE.id)
        land(1)
        expect(server.offers).toEqual([])

        land()

        expect(server.offers.map(({message}) => message)).toEqual(['process.recipeList.moved'])
    })

    // Two folders of one name cannot sit side by side, and nothing tells them apart if they do.
    it('keeps a folder where it is when the destination has one of the same name, and says so', () => {
        server.folders = [...FOLDERS, {id: 'empty-home', name: 'EMPTY', parentId: null}]

        moveItems([folder(EMPTY)], null)

        expect(server.requests).toEqual([])
        expect(server.notifications).toEqual([{level: 'warning', message: 'process.folder.move.nameTaken'}])
        expect(server.offers).toEqual([])
    })

    it('still moves what went with a folder that stays', () => {
        server.folders = [...FOLDERS, {id: 'empty-home', name: 'EMPTY', parentId: null}]

        moveItems([folder(EMPTY), folder(Y2024)], null)
        land()

        expect(savedIds()).toEqual([Y2024.id])
        expect(server.offers).toHaveLength(1)
    })
})

describe('undoing a move', () => {
    it('puts a recipe back where it was', () => {
        moveItems([recipe(AT_ROOT)], KENYA.id)
        land()

        undo()

        expect(server.requests.at(-1)).toEqual(['move', [AT_ROOT.id], null])
    })

    // A search reaches into the subfolders, so one move can take recipes out of several folders.
    it('puts each recipe back in its own folder', () => {
        moveItems([recipe(AT_ROOT), recipe(IN_2024)], MOSAICS.id)
        land()

        undo()

        expect(server.requests.slice(1)).toEqual(expect.arrayContaining([
            ['move', [AT_ROOT.id], null],
            ['move', [IN_2024.id], Y2024.id]
        ]))
    })

    it('puts a folder back under its parent, keeping a rename made since', () => {
        moveItems([folder(Y2024)], null)
        land()
        server.folders = server.folders.map(folder => folder.id === Y2024.id ? {...folder, name: 'Renamed'} : folder)

        undo()

        expect(server.requests.at(-1)).toEqual(['save', {...Y2024, name: 'Renamed', parentId: KENYA.id}])
    })

    it('leaves a folder removed since where it is', () => {
        moveItems([folder(Y2024)], null)
        land()
        server.folders = server.folders.filter(({id}) => id !== Y2024.id)

        undo()

        expect(savedIds()).toEqual([Y2024.id])
    })

    it('keeps a folder where it is when its old place has taken its name since, and says so', () => {
        moveItems([folder(Y2024)], null)
        land()
        server.folders = [...server.folders, {id: 'namesake', name: Y2024.name, parentId: KENYA.id}]

        undo()

        expect(savedIds()).toEqual([Y2024.id])
        expect(server.notifications).toEqual([{level: 'warning', message: 'process.folder.move.nameTaken'}])
    })

    it('puts back the folders one at a time', () => {
        moveItems([folder(Y2024), folder(EMPTY)], MOZAMBIQUE.id)
        land()

        undo()

        expect(savedIds()).toEqual([Y2024.id, EMPTY.id, Y2024.id])
    })

    it('puts a folder and a recipe back together', () => {
        moveItems([folder(KENYA), recipe(AT_ROOT)], MOZAMBIQUE.id)
        land()

        undo()
        land()

        expect(server.requests.slice(2)).toEqual(expect.arrayContaining([
            ['move', [AT_ROOT.id], null],
            ['save', {...KENYA, parentId: null}]
        ]))
    })
})

describe('updating a folder', () => {
    it.each([
        ['FOLDER_CYCLE', 'process.folder.update.cycle'],
        ['FOLDER_PARENT_NOT_FOUND', 'process.folder.update.parentNotFound'],
        [undefined, 'process.folder.update.error']
    ])('reports a save refused with %s by its reason', (code, message) => {
        updateFolder({...KENYA, name: 'Renamed'})

        fail(httpError(code))

        expect(server.notifications).toEqual([{level: 'error', message}])
    })
})

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const MOZAMBIQUE = {id: 'mozambique', name: 'Mozambique', parentId: null}
const Y2024 = {id: '2024', name: 'Kenya_2024', parentId: 'kenya'}
const MOSAICS = {id: 'mosaics', name: 'Mosaics_2024', parentId: '2024'}
const EMPTY = {id: 'empty', name: 'Empty', parentId: 'kenya'}
const FOLDERS = [KENYA, MOZAMBIQUE, Y2024, MOSAICS, EMPTY]

const AT_ROOT = {id: 'r1', folderId: null}
const ALSO_AT_ROOT = {id: 'r3', folderId: null}
const IN_2024 = {id: 'r2', folderId: '2024'}

beforeEach(() => {
    server.folders = FOLDERS
    server.pending = []
    server.requests = []
    server.notifications = []
    server.offers = []
})

// An item as a drag carries it: what it is, and the folder holding it.
const recipe = ({id, folderId}) => ({kind: 'recipe', id, folderId})
const folder = folder => ({kind: 'folder', id: folder.id, folderId: folder.parentId, folder})

// Sent when subscribed to, as an HTTP request is.
const request = (description, answer) => defer(() => {
    const response = new Subject()
    server.requests.push(description)
    server.pending.push({
        respond: () => {
            response.next(answer())
            response.complete()
        },
        fail: error => response.error(error)
    })
    return response
})

const saved = folder => server.folders.map(existing => existing.id === folder.id ? folder : existing)

// Answers the requests waiting, and those they lead to, until none is left or `count` have been answered.
const land = (count = Infinity) => {
    for (let answered = 0; answered < count && server.pending.length; answered++) {
        server.pending.shift().respond()
    }
}

const fail = error => server.pending.shift().fail(error)

const undo = () => server.offers.at(-1).undo()

const savedIds = () => server.requests.filter(([kind]) => kind === 'save').map(([, folder]) => folder.id)

const httpError = code => Object.assign(new Error('refused'), {response: code ? {code} : null})
