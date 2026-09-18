import _ from 'lodash'

import {simplifyString} from '~/string'

import {PATH_SEPARATOR} from './recipeListConstants'

// A folder with no parent, and a recipe with no folder, both live here.
export const ROOT = null

const byName = folder => folder.name.toUpperCase()

// Stored ids say "no parent" as an empty string as often as null, so falsiness, not nullishness, is
// what puts something at the root.
const at = folderId => folderId || ROOT

export const childFolders = (folders, folderId) =>
    _.sortBy(folders.filter(folder => at(folder.parentId) === at(folderId)), byName)

export const folderRecipes = (recipes, folderId) =>
    recipes.filter(recipe => at(recipe.folderId) === at(folderId))

// Ids already seen end the walk: a parent chain that revisits one is broken, and a path is worth more
// than a hang.
export const folderPath = (folders, folderId) => {
    const byId = new Map(folders.map(folder => [folder.id, folder]))
    const path = []
    const visited = new Set()
    let current = folderId
    while (current && !visited.has(current)) {
        visited.add(current)
        const folder = byId.get(current)
        if (!folder) {
            return []
        }
        path.unshift({id: folder.id, name: folder.name})
        current = folder.parentId
    }
    return path
}

// Read from `fromFolderId` rather than the root, so a search result names where it sits relative to
// the folder being searched. Callers that want the absolute path leave `fromFolderId` at the root.
export const folderPathLabel = (folders, folderId, fromFolderId = ROOT) =>
    folderPath(folders, folderId)
        .slice(folderPath(folders, fromFolderId).length)
        .map(({name}) => name)
        .join(PATH_SEPARATOR)

export const folderCounts = (folders, recipes, folderId) => ({
    folders: childFolders(folders, folderId).length,
    recipes: folderRecipes(recipes, folderId).length
})

export const isSelfOrDescendant = (folders, candidateId, folderId) =>
    !!candidateId && folderPath(folders, candidateId).some(({id}) => id === folderId)

const searchable = value => simplifyString(value ?? '', {removeNonAlphanumeric: true, removeAccents: true})

const matchesEvery = (matchers, values) =>
    matchers.every(matcher => values.some(value => matcher.test(searchable(value))))

// The root holds everything, and folderPath never yields the root itself, so it cannot answer this.
const within = (folders, candidateId, folderId) =>
    at(folderId) === ROOT || isSelfOrDescendant(folders, candidateId, folderId)

// A search reaches down from the folder you are standing in, never sideways or up: matching is over
// each candidate's name and the part of its path below that folder. The folder itself is not a
// result — you are already in it.
export const searchTree = ({folders, recipes, filterValues, folderId = ROOT}) => {
    const matchers = filterValues.map(value => RegExp(value, 'i'))
    return {
        folders: _.sortBy(
            folders.filter(folder =>
                at(folder.id) !== at(folderId)
                && within(folders, folder.id, folderId)
                && matchesEvery(matchers, [folder.name])
            ),
            byName
        ),
        recipes: recipes.filter(recipe =>
            within(folders, recipe.folderId, folderId)
            && matchesEvery(matchers, [recipe.name, folderPathLabel(folders, recipe.folderId, folderId)])
        )
    }
}
