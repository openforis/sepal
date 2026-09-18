import {describe, expect, it} from 'vitest'

import {
    childFolders, folderCounts, folderPath, folderPathLabel, folderRecipes,
    isSelfOrDescendant, ROOT, searchTree
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
