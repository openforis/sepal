import _ from 'lodash'

import {simplifyString, splitString} from '~/string'

import {PATH_SEPARATOR, ROOT_LABEL} from './recipeListConstants'

// A folder with no parent, and a recipe with no folder, both live here.
export const ROOT = null

const byName = folder => folder.name.toUpperCase()

// Stored ids say "no parent" as an empty string as often as null, so falsiness, not nullishness, is
// what puts something at the root.
export const at = folderId => folderId || ROOT

export const childFolders = (folders, folderId) =>
    _.sortBy(folders.filter(folder => at(folder.parentId) === at(folderId)), byName)

export const folderRecipes = (recipes, folderId) =>
    recipes.filter(recipe => at(recipe.folderId) === at(folderId))

// A recipe whose folder is not among the folders shows at the root rather than nowhere. Folders that have not
// loaded yet show nothing missing, so while they are undefined every recipe stays where it says it is.
export const placedFolderId = (folders, folderId) =>
    folders && isLost(folderIds(folders), folderId) ? ROOT : at(folderId)

// The recipes, each where placedFolderId puts it. A recipe already in place keeps its identity, and so do the
// recipes when every one is.
export const placedRecipes = (folders, recipes) => {
    if (!folders || !recipes) {
        return recipes
    }
    const known = folderIds(folders)
    return recipes.some(({folderId}) => isLost(known, folderId))
        ? recipes.map(recipe => isLost(known, recipe.folderId) ? {...recipe, folderId: ROOT} : recipe)
        : recipes
}

const folderIds = folders => new Set(folders.map(({id}) => id))

const isLost = (knownFolderIds, folderId) => !!at(folderId) && !knownFolderIds.has(folderId)

// The root answers for a folder that sits there, and for one that is no longer there at all.
export const parentFolderId = (folders, folderId) =>
    at(folders.find(({id}) => id === at(folderId))?.parentId)

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

// Where a folder is, or what is in it, from the root: "/" alone, "/ Kenya", "/ Kenya / 2024 / mosaic".
export const locationLabel = (folders = [], folderId, ...names) =>
    [ROOT_LABEL, locationNames(folders, folderId, names).join(PATH_SEPARATOR)]
        .filter(part => part)
        .join(' ')

// The same place without the spacing that makes it readable, to be pasted where a path is expected:
// "/Kenya/2024/mosaic".
export const locationPath = (folders = [], folderId, ...names) =>
    ROOT_LABEL + locationNames(folders, folderId, names).join(ROOT_LABEL)

const locationNames = (folders, folderId, names) =>
    [...folderPath(folders, folderId).map(({name}) => name), ...names]

export const folderCounts = (folders, recipes, folderId) => ({
    folders: childFolders(folders, folderId).length,
    recipes: folderRecipes(recipes, folderId).length
})

export const isSelfOrDescendant = (folders, candidateId, folderId) =>
    !!candidateId && folderPath(folders, candidateId).some(({id}) => id === folderId)

// What a drag of a navigator row carries: {kind, id, folderId}, where folderId is the folder holding it —
// for a folder, its parent. A folder carries itself as well, for the move to update.
export const asDragged = item => item.kind === 'folder'
    ? {kind: 'folder', id: item.folder.id, folderId: item.folder.parentId, folder: item.folder}
    : {kind: 'recipe', id: item.recipe.id, folderId: item.recipe.folderId}

// A move has to change something, and a folder can go neither into itself nor below itself. `dragged`
// is what asDragged gives.
export const canDropInto = ({folders, dragged, targetFolderId}) =>
    at(dragged.folderId) !== at(targetFolderId)
        && !(dragged.kind === 'folder' && isSelfOrDescendant(folders, targetFolderId, dragged.id))

// Two folders of one name cannot sit side by side: nothing would tell them apart. A folder whose name the
// destination already holds, or one moving with it has just claimed there, stays where it is. Returns
// [movable, clashing].
export const splitByNameClash = ({folders, moving, targetFolderId}) => {
    const movingIds = moving.map(({id}) => id)
    const taken = new Set(
        childFolders(folders, targetFolderId)
            .filter(({id}) => !movingIds.includes(id))
            .map(({name}) => name.toLowerCase())
    )
    return _.partition(moving, ({name}) => {
        const key = name.toLowerCase()
        if (taken.has(key)) {
            return false
        }
        taken.add(key)
        return true
    })
}

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

// What a search box holds, as the separate words searchTree and searchHighlight look for.
export const searchValues = filterValue =>
    splitString(simplifyString(filterValue))

export const searchHighlight = filterValues =>
    filterValues.length
        ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
        : ''

// The rows a navigator shows: the folders in the open folder, or every match below it while searching,
// then the recipes, sorted.
export const navigatorItems = ({folders, recipes, folderId, filterValues, sortingOrder = 'updateTime', sortingDirection = -1}) => {
    const matched = filterValues.length ? searchTree({folders, recipes, filterValues, folderId}) : null
    const shown = matched ? matched.folders : childFolders(folders, folderId)
    const found = matched ? matched.recipes : folderRecipes(recipes, folderId)
    const sorted = _.orderBy(
        found,
        recipe => sortingOrder === 'name' ? recipe.name.toUpperCase() : recipe.updateTime,
        sortingDirection === 1 ? 'asc' : 'desc'
    )
    return [
        ...shown.map(folder => ({kind: 'folder', id: folder.id, folder})),
        ...sorted.map(recipe => ({kind: 'recipe', id: recipe.id, recipe}))
    ]
}
