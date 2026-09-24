import {defer, filter, take} from 'rxjs'

import {isUndeclaredOutputOnly} from '#sepal/recipe/output/diagnostic'
import {VALID} from '#sepal/recipe/source/dependencyValidity'
import {submitRetrieveRecipeTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {getLogger} from '~/log'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Notifications} from '~/widget/notifications'

// Composes runtime output resolution with generic task submission; owns no Redux catalogue or recipe-type dispatch.
const log = getLogger('observedRetrieve')
const forbiddenTaskConfigKeys = [
    'pyramidingPolicy',
    'imageOutputDescription',
    'fallbackPyramidingPolicy',
    'customizeImage'
]
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

const isValidFallbackPyramidingPolicy = policy =>
    policy === undefined
    || typeof policy === 'function'
    || (typeof policy === 'object' && policy !== null && !Array.isArray(policy))

const validateFallbackPyramidingPolicy = policy => {
    if (!isValidFallbackPyramidingPolicy(policy)) {
        throw new Error('Fallback pyramiding policy must be a function or policy object')
    }
}

// Only UNDECLARED_OUTPUT is a temporary migration gap; missing dependencies, unavailable evidence,
// malformed output, and runtime failures must block.
export const canUseRetrieveFallback = isUndeclaredOutputOnly

export const submitObservedRetrieve = args => {
    const {
        recipe,
        retrieveOptions,
        taskConfig = {},
        fallbackPyramidingPolicy,
        resolveImageOutput$
    } = args

    forbiddenTaskConfigKeys.forEach(key => {
        if (hasOwn(taskConfig, key)) {
            throw new Error(`Observed Retrieve taskConfig cannot provide ${key}`)
        }
    })

    // Resolved output remains authoritative; fallback is temporary migration authority for unresolved scalars.
    validateFallbackPyramidingPolicy(fallbackPyramidingPolicy)

    const blockForError = error => {
        log.error(`Retrieve blocked for recipe ${recipe.id}:`, error)
        Notifications.error({message: toUserErrorMessage(error)})
    }

    const blockForOutput = cause => {
        log.error(`Retrieve blocked for recipe ${recipe.id}:`, cause)
        Notifications.error({message: msg('process.retrieve.error.imageOutput')})
    }

    const submit = config => {
        try {
            submitRetrieveRecipeTask(recipe, config)
        } catch (error) {
            blockForOutput(error)
        }
    }

    // Structural dependency validity is one condition of running, and neither a description nor a fallback
    // stands in for it: a description reads only what its providers need. Unknown blocks as surely as invalid.
    const handleTerminal = ({description, diagnostics = [], error, dependencyValidity}) => {
        if (error) {
            blockForError(error)
        } else if (dependencyValidity?.status !== VALID) {
            blockForOutput(dependencyValidity?.diagnostics || 'dependency validity unknown')
        } else if (description) {
            submit({
                ...taskConfig,
                retrieveOptions,
                imageOutputDescription: description,
                fallbackPyramidingPolicy
            })
        } else if (fallbackPyramidingPolicy !== undefined && canUseRetrieveFallback(diagnostics)) {
            submit({
                ...taskConfig,
                retrieveOptions,
                pyramidingPolicy: fallbackPyramidingPolicy
            })
        } else {
            blockForOutput(diagnostics)
        }
    }

    return defer(() => resolveImageOutput$({recipe}))
        .pipe(
            filter(({status}) => status !== 'PENDING' && status !== 'LOADING'),
            take(1)
        )
        .subscribe({
            next: handleTerminal,
            error: blockForError
        })
}
