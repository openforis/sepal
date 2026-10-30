import {describe, expect, it} from 'vitest'

import {
    canDropInto, childFolders, folderCounts, folderPath, folderPathLabel, folderRecipes,
    isSelfOrDescendant, locationLabel, locationPath, parentFolderId, placedFolderId, placedRecipes, ROOT, searchTree,
    splitByNameClash
} from './recipeTree'

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const MOZAMBIQUE = {id: 'mozambique', name: 'Mozambique', parentId: null}
const Y2024 = {id: '2024', name: '2024', parentId: 'kenya'}
const MOSAICS = {id: 'mosaics', name: 'Mosaics', parentId: '2024'}

const folders = [MOSAICS, KENYA, Y2024, MOZAMBIQUE]

const AT_ROOT = {id: 'r1', name: 'loose_draft', type: 'MOSAIC', folderId: null}
const IN_KENYA = {id: 'r2', name: 'nairobi', type: 'CCDC', folderId: 'kenya'}
const IN_2024 = {id: 'r3', name: 'rift_timeseries', type: 'TIME_SERIES', folderId: '2024'}

const recipes = [AT_ROOT, IN_KENYA, IN_2024]

const ids = items => items.map(({id}) => id)

describe('childFolders', () => {
    it('lists root folders by name when asked for the root', () => {
        expect(ids(childFolders(folders, ROOT))).toEqual(['kenya', 'mozambique'])
    })

    it('lists a folder\'s own children', () => {
        expect(ids(childFolders(folders, 'kenya'))).toEqual(['2024'])
    })

    it('returns nothing for a leaf folder', () => {
        expect(childFolders(folders, 'mosaics')).toEqual([])
    })

    it('treats a folder whose parent is an empty string as a root folder', () => {
        const legacy = {id: 'legacy', name: 'Legacy', parentId: ''}
        expect(ids(childFolders([legacy, Y2024], ROOT))).toEqual(['legacy'])
    })
})

describe('folderRecipes', () => {
    it('treats a recipe with no folder as living at the root', () => {
        expect(ids(folderRecipes(recipes, ROOT))).toEqual(['r1'])
    })

    it('lists the recipes of one folder only', () => {
        expect(ids(folderRecipes(recipes, 'kenya'))).toEqual(['r2'])
    })

    it('treats a recipe whose folder is an empty string as living at the root', () => {
        const legacy = {id: 'r0', name: 'legacy_draft', type: 'MOSAIC', folderId: ''}
        expect(ids(folderRecipes([legacy, IN_KENYA], ROOT))).toEqual(['r0'])
    })
})

// A recipe can name a folder that is gone: saved into it after it was removed, or stored before the server
// checked. Shown nowhere, it could only be found by a search.
describe('placedRecipes', () => {
    const LOST = {id: 'r4', name: 'orphan', type: 'MOSAIC', folderId: 'removed'}

    it('puts a recipe whose folder is gone at the root', () => {
        const placed = placedRecipes(folders, [...recipes, LOST])

        expect(ids(folderRecipes(placed, ROOT))).toEqual([AT_ROOT.id, LOST.id])
    })

    it('leaves every recipe where it says it is while the folders are not loaded', () => {
        expect(placedRecipes(undefined, [...recipes, LOST])).toEqual([...recipes, LOST])
    })

    it('hands back the same recipes when none has lost its folder', () => {
        expect(placedRecipes(folders, recipes)).toBe(recipes)
    })
})

describe('placedFolderId', () => {
    it('gives the folder of a recipe in one that exists', () => {
        expect(placedFolderId(folders, 'kenya')).toBe('kenya')
    })

    it('gives the root for a folder that is gone', () => {
        expect(placedFolderId(folders, 'removed')).toBe(ROOT)
    })

    it('gives the folder named while the folders are not loaded', () => {
        expect(placedFolderId(undefined, 'kenya')).toBe('kenya')
    })
})

describe('parentFolderId', () => {
    it('gives the folder above', () => {
        expect(parentFolderId(folders, 'mosaics')).toBe('2024')
    })

    it('gives the root for a folder that sits there', () => {
        expect(parentFolderId(folders, 'kenya')).toBe(ROOT)
    })

    it('gives the root for a folder that is no longer there', () => {
        expect(parentFolderId(folders, 'removed')).toBe(ROOT)
    })

    it('gives the root for a folder whose parent is an empty string', () => {
        const legacy = {id: 'legacy', name: 'Legacy', parentId: ''}
        expect(parentFolderId([legacy], 'legacy')).toBe(ROOT)
    })
})

describe('folderPath', () => {
    it('is empty at the root', () => {
        expect(folderPath(folders, ROOT)).toEqual([])
    })

    it('runs from the outermost folder to the one asked for', () => {
        expect(folderPath(folders, 'mosaics')).toEqual([
            {id: 'kenya', name: 'Kenya'}, {id: '2024', name: '2024'}, {id: 'mosaics', name: 'Mosaics'}
        ])
    })

    it('is empty for a folder that no longer exists', () => {
        expect(folderPath(folders, 'deleted')).toEqual([])
    })
})

describe('folderPathLabel', () => {
    it('joins the path with a separator', () => {
        expect(folderPathLabel(folders, 'mosaics')).toBe('Kenya / 2024 / Mosaics')
    })

    it('is empty at the root', () => {
        expect(folderPathLabel(folders, ROOT)).toBe('')
    })

    it('reads relative to the folder given', () => {
        expect(folderPathLabel(folders, 'mosaics', 'kenya')).toBe('2024 / Mosaics')
        expect(folderPathLabel(folders, 'kenya', 'kenya')).toBe('')
    })
})

describe('locationLabel', () => {
    it('is a bare slash at the root', () => {
        expect(locationLabel(folders, ROOT)).toBe('/')
    })

    it('starts the path of a folder from the root', () => {
        expect(locationLabel(folders, 'mosaics')).toBe('/ Kenya / 2024 / Mosaics')
    })

    it('ends with the names it is given, below the folder', () => {
        expect(locationLabel(folders, 'kenya', 'nairobi')).toBe('/ Kenya / nairobi')
        expect(locationLabel(folders, ROOT, 'loose_draft')).toBe('/ loose_draft')
    })

    // Where the tree shows a recipe whose folder is gone.
    it('starts at the root for a folder that is gone', () => {
        expect(locationLabel(folders, 'removed', 'orphan')).toBe('/ orphan')
    })
})

describe('locationPath', () => {
    it('is a bare slash at the root', () => {
        expect(locationPath(folders, ROOT)).toBe('/')
    })

    it('leaves out the spaces around the slashes, but not those in a name', () => {
        expect(locationPath(folders, 'mosaics', 'rift timeseries')).toBe('/Kenya/2024/Mosaics/rift timeseries')
        expect(locationPath(folders, ROOT, 'loose_draft')).toBe('/loose_draft')
    })
})

describe('folderCounts', () => {
    it('counts direct children only', () => {
        expect(folderCounts(folders, recipes, 'kenya')).toEqual({folders: 1, recipes: 1})
    })

    it('counts the root\'s own folders and loose recipes', () => {
        expect(folderCounts(folders, recipes, ROOT)).toEqual({folders: 2, recipes: 1})
    })
})

describe('isSelfOrDescendant', () => {
    it('is true for the folder itself', () => {
        expect(isSelfOrDescendant(folders, 'kenya', 'kenya')).toBe(true)
    })

    it('is true for a folder nested below it', () => {
        expect(isSelfOrDescendant(folders, 'mosaics', 'kenya')).toBe(true)
    })

    it('is false for a sibling', () => {
        expect(isSelfOrDescendant(folders, 'mozambique', 'kenya')).toBe(false)
    })

    it('is false for the root', () => {
        expect(isSelfOrDescendant(folders, ROOT, 'kenya')).toBe(false)
    })
})

describe('searchTree', () => {
    it('finds folders anywhere in the tree by name', () => {
        expect(ids(searchTree({folders, recipes, filterValues: ['mosa']}).folders)).toEqual(['mosaics'])
    })

    it('finds recipes anywhere in the tree by their own name', () => {
        expect(ids(searchTree({folders, recipes, filterValues: ['nairobi']}).recipes)).toEqual(['r2'])
    })

    it('finds a recipe by a segment of the folder path holding it', () => {
        expect(ids(searchTree({folders, recipes, filterValues: ['kenya']}).recipes)).toEqual(['r2', 'r3'])
    })

    it('requires every search term to match', () => {
        expect(ids(searchTree({folders, recipes, filterValues: ['kenya', 'rift']}).recipes)).toEqual(['r3'])
        expect(ids(searchTree({folders, recipes, filterValues: ['kenya', 'nosuch']}).recipes)).toEqual([])
    })

    it('returns everything when nothing is searched for', () => {
        const {folders: matched, recipes: found} = searchTree({folders, recipes, filterValues: []})
        expect(ids(matched)).toEqual(['2024', 'kenya', 'mosaics', 'mozambique'])
        expect(ids(found)).toEqual(['r1', 'r2', 'r3'])
    })

    it('reaches down from the folder it is given, but never sideways or up', () => {
        const fromKenya = searchTree({folders, recipes, filterValues: [], folderId: 'kenya'})
        expect(ids(fromKenya.folders)).toEqual(['2024', 'mosaics'])
        expect(ids(fromKenya.recipes)).toEqual(['r2', 'r3'])

        const from2024 = searchTree({folders, recipes, filterValues: [], folderId: '2024'})
        expect(ids(from2024.folders)).toEqual(['mosaics'])
        expect(ids(from2024.recipes)).toEqual(['r3'])
    })

    it('leaves the folder being searched out of its own results', () => {
        expect(ids(searchTree({folders, recipes, filterValues: ['kenya'], folderId: 'kenya'}).folders)).toEqual([])
    })

    it('matches a recipe on the part of its path below the folder searched', () => {
        expect(ids(searchTree({folders, recipes, filterValues: ['2024'], folderId: 'kenya'}).recipes)).toEqual(['r3'])
    })

    it('does not match a recipe on an ancestor of the folder searched', () => {
        expect(ids(searchTree({folders, recipes, filterValues: ['kenya'], folderId: '2024'}).recipes)).toEqual([])
    })
})

describe('canDropInto', () => {
    const recipe = {kind: 'recipe', id: 'r1', folderId: 'kenya'}
    const folder = {kind: 'folder', id: 'kenya', folderId: null}

    it('accepts another folder for a recipe', () => {
        expect(canDropInto({folders, dragged: recipe, targetFolderId: '2024'})).toBe(true)
    })

    it('refuses the folder the recipe is already in', () => {
        expect(canDropInto({folders, dragged: recipe, targetFolderId: 'kenya'})).toBe(false)
    })

    it('refuses the root for a recipe already there, whichever empty value it holds', () => {
        expect(canDropInto({folders, dragged: {...recipe, folderId: null}, targetFolderId: ROOT})).toBe(false)
        expect(canDropInto({folders, dragged: {...recipe, folderId: ''}, targetFolderId: ROOT})).toBe(false)
    })

    it('refuses a folder into itself', () => {
        expect(canDropInto({folders, dragged: folder, targetFolderId: 'kenya'})).toBe(false)
    })

    it('refuses a folder into one of its own subfolders', () => {
        expect(canDropInto({folders, dragged: folder, targetFolderId: 'mosaics'})).toBe(false)
    })

    it('accepts a folder into another branch of the tree', () => {
        expect(canDropInto({folders, dragged: folder, targetFolderId: 'mozambique'})).toBe(true)
    })
})

describe('splitByNameClash', () => {
    it('keeps back a folder whose name the destination already holds, whatever the case', () => {
        const kenyaElsewhere = {id: 'kenya-2', name: 'KENYA', parentId: 'mozambique'}

        const [movable, clashing] = splitByNameClash({folders: [...folders, kenyaElsewhere], moving: [kenyaElsewhere], targetFolderId: ROOT})

        expect(ids(movable)).toEqual([])
        expect(ids(clashing)).toEqual([kenyaElsewhere.id])
    })

    it('keeps back the second of two folders of one name moving to the same place', () => {
        const first = {id: 'q1-a', name: 'Q1', parentId: 'kenya'}
        const second = {id: 'q1-b', name: 'q1', parentId: '2024'}

        const [movable, clashing] = splitByNameClash({folders: [...folders, first, second], moving: [first, second], targetFolderId: 'mozambique'})

        expect(ids(movable)).toEqual([first.id])
        expect(ids(clashing)).toEqual([second.id])
    })

    it('lets a folder be moved to where it already is', () => {
        const [movable] = splitByNameClash({folders, moving: [Y2024], targetFolderId: 'kenya'})

        expect(ids(movable)).toEqual([Y2024.id])
    })
})
