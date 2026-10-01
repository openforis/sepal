import {TRANSIENT} from '../sourceRuntime/assetEvidence'
import {ASSET_UNAVAILABLE} from './recipeOutput'

// What a consumer tells the user about the sources an output read (recipeOutput.js) reads from, judged from the
// session's asset evidence (assetEvidence.js):
//
//   checking     an asset read failed or was made stale by a mutation, and is being read again
//   unavailable  the id of an asset found missing or unreadable: the output is withheld
//   failing      the id of an asset the latest read could not reach, and none is being read: what was drawn may stay,
//                but nothing is described or authorized from it until a read succeeds
//
// Each is null when it does not apply.
export const sourceStatus = ({output, assetEvidence = {}}) => {
    const assets = output?.assets || []
    const unavailable = output?.diagnostics?.find(({code}) => code === ASSET_UNAVAILABLE)?.assetId || null
    const entries = assets.map(id => [id, assetEvidence[id]])
    const checking = entries.some(([_id, entry]) => entry?.checking && (entry.failure || entry.stale))
    const failing = entries.find(([_id, entry]) => entry?.failure?.kind === TRANSIENT && !entry.checking)?.[0] || null
    return {checking, unavailable, failing}
}
