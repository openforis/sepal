import _ from 'lodash'
import {concat, EMPTY, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {select} from '~/store'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {moveRecipes$} from '../recipe'
import {offerMoveUndo} from './moveNotification'
import {at, locationLabel, splitByNameClash} from './recipeTree'

export const updateFolder$ = folder =>
    api.folder.save$(folder).pipe(
        tap(folders => {
            actionBuilder('UPDATE_FOLDER', {folder})
                .set('process.folders', folders)
                .dispatch()
        })
    )

export const updateFolder = folder =>
    updateFolder$(folder)
        .subscribe({error: folderUpdateFailed})

// A move is easy to make by accident, so one that lands offers its own way back. Each item returns where it
// came from, which is not one folder when a search moved several at once. An item is a recipe or a folder as
// a drag carries it, {kind, id, folderId}, where folderId is the folder holding it.
export const moveItems = (items, folderId) => {
    const recipes = items.filter(({kind}) => kind === 'recipe')
    const folders = foldersFreeToMove(items.filter(({kind}) => kind === 'folder').map(({id}) => id), folderId)
    if (!recipes.length && !folders.length) {
        return
    }
    const message = movedMessage(recipes, folders, folderId)
    concat(
        recipes.length
            ? moveRecipes$(recipes.map(({id}) => id), folderId).pipe(tap({error: recipeMoveFailed}))
            : EMPTY,
        foldersMoved$(folders.map(folder => ({folder, parentId: folderId})))
    ).subscribe({
        complete: () => offerMoveUndo(message, () => undoMove(recipes, folders)),
        // Each part has already reported its own failure.
        error: _.noop
    })
}

const undoMove = (recipes, folders) => {
    _.forEach(
        _.groupBy(recipes, ({folderId}) => at(folderId)),
        moved => moveRecipes(moved.map(({id}) => id), at(moved[0].folderId))
    )
    foldersMoved$(_.flatMap(
        _.groupBy(folders, ({parentId}) => at(parentId)),
        moved => foldersFreeToMove(moved.map(({id}) => id), at(moved[0].parentId))
            .map(folder => ({folder, parentId: at(moved[0].parentId)}))
    )).subscribe({error: _.noop})
}

const moveRecipes = (recipeIds, folderId) =>
    moveRecipes$(recipeIds, folderId)
        .subscribe({error: recipeMoveFailed})

// A folder moves as it is now, so a rename made since is kept, and one no longer there is left alone. One
// whose name the destination already holds stays where it is, and says so; the rest of the move goes on.
const foldersFreeToMove = (folderIds, folderId) => {
    const folders = select('process.folders') ?? []
    const [movable, clashing] = splitByNameClash({
        folders,
        moving: folders.filter(({id}) => folderIds.includes(id)),
        targetFolderId: folderId
    })
    if (clashing.length) {
        Notifications.warning({
            message: msg('process.folder.move.nameTaken', {
                folder: locationLabel(folders, folderId),
                names: clashing.map(({name}) => name).join(', ')
            })
        })
    }
    return movable
}

// One save at a time: each answers with the whole folder list, and the answer applied last has to hold every
// move.
const foldersMoved$ = moves =>
    concat(...moves.map(({folder, parentId}) =>
        updateFolder$({...folder, parentId}).pipe(tap({error: folderUpdateFailed}))
    ))

const movedMessage = (recipes, folders, folderId) => {
    const folder = locationLabel(select('process.folders'), folderId)
    if (!recipes.length && folders.length === 1) {
        return msg('process.folder.move.done', {name: folders[0].name, folder})
    }
    return folders.length
        ? msg('process.recipeList.moved', {count: recipes.length + folders.length, folder})
        : msg('process.recipe.move.done', {count: recipes.length, folder})
}

const recipeMoveFailed = error => {
    if (error.response?.code === 'FOLDER_NOT_FOUND') {
        Notifications.error({message: msg('process.recipe.move.folderNotFound'), error})
    } else {
        Notifications.error({message: msg('process.recipe.move.error'), error})
    }
}

const folderUpdateFailed = error => {
    const code = error.response?.code
    if (code === 'FOLDER_CYCLE') {
        Notifications.error({message: msg('process.folder.update.cycle'), error})
    } else if (code === 'FOLDER_PARENT_NOT_FOUND') {
        Notifications.error({message: msg('process.folder.update.parentNotFound'), error})
    } else if (code === 'FOLDER_NAME_INVALID') {
        Notifications.error({message: msg('process.folder.update.nameInvalid'), error})
    } else {
        Notifications.error({message: msg('process.folder.update.error'), error})
    }
}
