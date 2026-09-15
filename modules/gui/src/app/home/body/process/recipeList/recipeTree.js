import _ from 'lodash'

import {simplifyString} from '~/string'

import {PROJECT_RECIPE_SEPARATOR} from './recipeListConstants'

// A project with no parent, and a recipe with no project, both live here.
export const ROOT = null

const byName = project => project.name.toUpperCase()

// Stored ids say "no parent" as an empty string as often as null, so falsiness, not nullishness, is
// what puts something at the root.
const at = folderId => folderId || ROOT

export const childFolders = (projects, folderId) =>
    _.sortBy(projects.filter(project => at(project.parentId) === at(folderId)), byName)

export const folderRecipes = (recipes, folderId) =>
    recipes.filter(recipe => at(recipe.projectId) === at(folderId))

// Ids already seen end the walk: a parent chain that revisits one is broken, and a path is worth more
// than a hang.
export const folderPath = (projects, folderId) => {
    const byId = new Map(projects.map(project => [project.id, project]))
    const path = []
    const visited = new Set()
    let current = folderId
    while (current && !visited.has(current)) {
        visited.add(current)
        const project = byId.get(current)
        if (!project) {
            return []
        }
        path.unshift({id: project.id, name: project.name})
        current = project.parentId
    }
    return path
}

// Read from `fromFolderId` rather than the root, so a search result names where it sits relative to
// the folder being searched. Callers that want the absolute path leave `fromFolderId` at the root.
export const folderPathLabel = (projects, folderId, fromFolderId = ROOT) =>
    folderPath(projects, folderId)
        .slice(folderPath(projects, fromFolderId).length)
        .map(({name}) => name)
        .join(PROJECT_RECIPE_SEPARATOR)

export const folderCounts = (projects, recipes, folderId) => ({
    folders: childFolders(projects, folderId).length,
    recipes: folderRecipes(recipes, folderId).length
})

export const isSelfOrDescendant = (projects, candidateId, folderId) =>
    !!candidateId && folderPath(projects, candidateId).some(({id}) => id === folderId)

const searchable = value => simplifyString(value ?? '', {removeNonAlphanumeric: true, removeAccents: true})

const matchesEvery = (matchers, values) =>
    matchers.every(matcher => values.some(value => matcher.test(searchable(value))))

// The root holds everything, and folderPath never yields the root itself, so it cannot answer this.
const within = (projects, candidateId, folderId) =>
    at(folderId) === ROOT || isSelfOrDescendant(projects, candidateId, folderId)

// A search reaches down from the folder you are standing in, never sideways or up: matching is over
// each candidate's name and the part of its path below that folder. The folder itself is not a
// result — you are already in it.
export const searchTree = ({projects, recipes, filterValues, folderId = ROOT}) => {
    const matchers = filterValues.map(value => RegExp(value, 'i'))
    return {
        folders: _.sortBy(
            projects.filter(project =>
                at(project.id) !== at(folderId)
                && within(projects, project.id, folderId)
                && matchesEvery(matchers, [project.name])
            ),
            byName
        ),
        recipes: recipes.filter(recipe =>
            within(projects, recipe.projectId, folderId)
            && matchesEvery(matchers, [recipe.name, folderPathLabel(projects, recipe.projectId, folderId)])
        )
    }
}
