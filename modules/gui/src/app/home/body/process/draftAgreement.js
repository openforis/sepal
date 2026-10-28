import {getHash, isEqual} from '~/hash'

import {CONFLICTED, FAILED, SAVED, SAVING, UNRESOLVED} from './saveCoordinator'

// Whether an open recipe's draft is what storage holds: its saves' published state (saveCoordinator.js) and the newest
// revision this session knows of. Only an AGREED draft is the record a dependency is executed from.
//
// Being open is not a disagreement, and neither is an acknowledged revision alone: a newer edit can be queued behind
// it. A wait is not a failure, and an unconfirmed wait is still a wait; only the coordinator's outcomes are failures.

export const AGREED = 'AGREED'
export const UNSAVED = 'UNSAVED'
export const SAVE_PENDING = 'SAVE_PENDING'
export const SAVE_UNCONFIRMED = 'SAVE_UNCONFIRMED'
export const SAVE_FAILED = 'SAVE_FAILED'
export const SAVE_CONFLICT = 'SAVE_CONFLICT'
export const SAVE_UNRESOLVED = 'SAVE_UNRESOLVED'
export const REMOTE_NEWER = 'REMOTE_NEWER'

// A record is a draft while it is open, and while its saves have not settled even once its tab is closed: closing a tab
// does not make storage hold what was edited. No read of storage replaces a draft.
export const isDraft = ({open, saveState}) => open || (Boolean(saveState) && saveState.status !== SAVED)

export const draftAgreement = ({draft, saveState, knownRevision}) => {
    switch (saveState?.status) {
        case CONFLICTED:
            return SAVE_CONFLICT
        case UNRESOLVED:
            return SAVE_UNRESOLVED
        case SAVING:
            return saveState.unconfirmed ? SAVE_UNCONFIRMED : SAVE_PENDING
    }
    if (!Number.isInteger(saveState?.revision) || !isAcknowledged(saveState, draft.model)) {
        return saveState?.status === FAILED ? SAVE_FAILED : UNSAVED
    }
    return Number.isInteger(knownRevision) && knownRevision > saveState.revision ? REMOTE_NEWER : AGREED
}

// The acknowledged model is published as its change identifier (~/hash), which every copy of it keeps and every edit
// replaces, so a draft agrees with it without comparing content. Load, acknowledgement, recovery and equivalence all
// acknowledge the draft's own model object; only a model that never had an identifier is published, and compared by
// content.
const isAcknowledged = ({modelHash, model}, draftModel) =>
    modelHash ? getHash(draftModel) === modelHash : isEqual(model, draftModel)
