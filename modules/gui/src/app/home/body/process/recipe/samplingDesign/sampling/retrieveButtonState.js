import {retrieveCapabilityError} from '#sepal/recipe/samplingDesign/retrieveCapability'

import {validateRetrieve} from './validateRetrieve'

// `gate` is what holds the design's samples on the evidence of its areas and proportions (freshnessRequirements.js).
export const retrieveButtonState = ({model, googleAccount, assetRoots, gate}) => {
    const [modelError] = validateRetrieve(model)
    if (modelError) {
        return {disabled: true, kind: 'model', code: modelError.code, args: modelError.args}
    }
    if (gate) {
        return {disabled: true, kind: 'freshness', code: gate.code, gate}
    }
    const capabilityError = retrieveCapabilityError({model, googleAccount, assetRoots})
    if (capabilityError) {
        return {disabled: true, kind: 'capability', code: capabilityError.code}
    }
    return {disabled: false, kind: null, code: null}
}
