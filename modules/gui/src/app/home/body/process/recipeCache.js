import {isDraft} from './draftAgreement'

// What the session's recipe cache (`process.loadedRecipes`) accepts from a read of storage. A response is judged when
// it arrives, against what the session holds then:
//
//   DRAFT    the entry is a draft - open, or closed with its saves unsettled (draftAgreement.js) - whose unsaved
//            model no persisted read may replace
//   ABSENT   nothing holds it; only a reader that retains entries (recipeAccess) may add one
//   REPLACE  the response is newer than the cached copy, or the copy's revision is not known
//   KEEP     the cached copy is as new or newer, so an older response changes nothing
//
// Entries are owned by the consumers that retain them. A reader that does not retain entries only ever replaces one
// that is present, so it can neither add an entry nobody releases nor keep one alive after its owners let go.

export const DRAFT = 'DRAFT'
export const ABSENT = 'ABSENT'
export const REPLACE = 'REPLACE'
export const KEEP = 'KEEP'

export const saveStatePath = recipeId =>
    ['process.saveStates', recipeId]

export const initializeRecipe = recipe => ({
    ...recipe,
    ui: {initialized: true}
})

export const cacheAcceptance = ({record, cached, open, saveState}) => {
    if (isDraft({open, saveState})) {
        return DRAFT
    }
    if (!cached) {
        return ABSENT
    }
    return isNewer(record, cached) ? REPLACE : KEEP
}

const isNewer = ({revision}, cached) =>
    !Number.isInteger(revision) || !Number.isInteger(cached.revision) || revision > cached.revision
