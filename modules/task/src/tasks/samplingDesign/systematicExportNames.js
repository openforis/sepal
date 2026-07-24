import {sanitizeEarthEngineTaskName} from '#sepal/earthEngineExportNames'

// Plain, user-facing EE task descriptions and temporary asset IDs for the systematic candidate exports.
// Users see these in the Earth Engine Code Editor task list and asset browser, so they must not expose
// implementation details (unfiltered / densityOffset / base / repair jargon). Internal density offsets stay
// in the sampling code and logs, not in these names.

const CANDIDATE_ASSET_SUFFIX = {
    base: '_candidates',
    repair: '_additional_candidates'
}

// Temporary candidate asset id for a kind ('base' | 'repair'), derived from the shared temp prefix (which
// already carries a timestamp / task id), so it's deterministic, unique and clearly temporary.
export const candidateAssetId = (tempAssetId, kind) => `${tempAssetId}${CANDIDATE_ASSET_SUFFIX[kind]}`

const CANDIDATE_DESCRIPTION = {
    base: 'Prepare sample candidates',
    repair: 'Prepare additional sample candidates'
}

// Plain EE Code Editor task description for a candidate export.
export const candidateDescription = (description, kind) =>
    sanitizeEarthEngineTaskName(`${CANDIDATE_DESCRIPTION[kind]}: ${description}`)
