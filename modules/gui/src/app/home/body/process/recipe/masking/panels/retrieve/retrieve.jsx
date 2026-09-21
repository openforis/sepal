import React from 'react'

import {submitMaskingRetrieve} from '~/app/home/body/process/recipe/masking/maskingRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {currentSourceEvidence} from '~/app/home/body/process/recipe/sourceEvidence'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'

const mapRecipeToProps = recipe => ({recipe})

// Two things decide what the resolution answers: this recipe's own execution configuration, and the current
// evidence about the source it inherits from - a producer can be reconfigured, or become unreadable, while the
// masking recipe itself is untouched. Evidence is held under `ui` because it is runtime state rather than saved
// content, which says nothing about whether it bears on validity: it does. Everything else in the record - the
// title, the server revision, the rest of `ui` - is presentation, and the store replaces only the nodes a write
// touches, so those leave both halves of this key alone. The resolver and submission still receive the whole
// current recipe.
class _Retrieve extends React.Component {
    render() {
        const {recipe, sourceRuntime} = this.props
        return (
            <MosaicRetrievePanel
                defaultScale={30}
                toSepal
                toEE
                toDrive
                imageOutputResolution={{
                    key: {model: recipe.model, evidence: currentSourceEvidence(recipe)},
                    state$: sourceRuntime.resolveImageOutput$({recipe})
                }}
                onRetrieve={(retrieveOptions, resolutionContext) =>
                    this.retrieve(retrieveOptions, resolutionContext)}
            />
        )
    }

    retrieve(retrieveOptions, {resolveImageOutput$} = {}) {
        const {recipe, sourceRuntime} = this.props
        return submitMaskingRetrieve({
            recipe,
            retrieveOptions,
            resolveImageOutput$: resolveImageOutput$ || sourceRuntime.resolveImageOutput$
        })
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps),
    withSourceRuntime()
)

Retrieve.propTypes = {}
