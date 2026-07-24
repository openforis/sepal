import {retrieveCapabilityError} from '#sepal/recipe/samplingDesign/retrieveCapability'

import {validateRetrieve} from './validateRetrieve'

export const retrieveButtonState = ({model, googleAccount, assetRoots}) => {
    const [modelError] = validateRetrieve(model)
    if (modelError) {
        return {disabled: true, kind: 'model', code: modelError.code, args: modelError.args}
    }
    const capabilityError = retrieveCapabilityError({model, googleAccount, assetRoots})
    if (capabilityError) {
        return {disabled: true, kind: 'capability', code: capabilityError.code}
    }
    return {disabled: false, kind: null, code: null}
}
