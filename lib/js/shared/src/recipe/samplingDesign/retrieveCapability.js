import {isStratificationSkipped} from './stratificationSkip.js'

// Only unstratified Random draws directly (randomPoints) with no temporary asset; stratified Random and every
// Systematic design materialize temporary candidate/selection tables.
export const requiresTempAssets = model =>
    model?.sampleArrangement?.arrangementStrategy === 'SYSTEMATIC'
        || !isStratificationSkipped(model?.stratification)

// A temporary-asset design needs a linked Google/EE account WITH an asset root, or tempTableAssetId$ fails late
// with "EE account has no asset roots". Readiness is conclusive only once roots have loaded: an unresolved list
// is a blocking `pending` state, distinct from a confirmed empty `noAssetRoot`, and never treated as success.
export const retrieveCapabilityError = ({model, googleAccount, assetRoots}) => {
    if (!requiresTempAssets(model)) {
        return null
    }
    if (!googleAccount) {
        return {code: 'noAccount'}
    }
    if (assetRoots === undefined) {
        return {code: 'pending'}
    }
    return assetRoots.length ? null : {code: 'noAssetRoot'}
}
