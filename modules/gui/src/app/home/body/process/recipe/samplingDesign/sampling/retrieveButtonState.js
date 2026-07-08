import {validateRetrieve} from './validateRetrieve'

// Pure Retrieve toolbar-button state from the persisted model, using the SAME preflight as submit
// (validateRetrieve), so the button can't be opened for a design that would be rejected on submit. `code` is
// the first preflight error's code (for the disabled tooltip detail), or null when the design is retrievable.
export const retrieveButtonState = model => {
    const [firstError] = validateRetrieve(model)
    return {
        disabled: !!firstError,
        code: firstError ? firstError.code : null
    }
}
