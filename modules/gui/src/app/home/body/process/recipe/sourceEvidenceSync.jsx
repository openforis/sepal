import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'

import {withRecipe} from '../recipeContext'
import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'

// A recipe editor's watch on the evidence about its source, for as long as the editor is open.
//
// The source runtime keeps the evidence current and shares it with every other consumer of the recipe
// (evidenceRegistry.js). What the editor adds is the observation it names - what the recipe's panels present - and
// what only an open editor may do with an answer: apply the defaults its observation proposes, and announce a failure.

const mapRecipeToProps = recipe => ({recipeId: recipe.id})

class _SourceEvidenceSync extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        const {recipeId, observation, sourceRuntime} = this.props
        this.watch = sourceRuntime?.watchEvidence$({recipeId, observation}).subscribe()
    }

    componentWillUnmount() {
        this.watch?.unsubscribe()
    }
}

export const SourceEvidenceSync = compose(
    _SourceEvidenceSync,
    withRecipe(mapRecipeToProps),
    withSourceRuntime()
)

SourceEvidenceSync.propTypes = {
    // {
    //     sourceReference: recipe => reference | null,
    //     observe$: ({recipe, graph, recipesById}) => Observable,
    //     applyAccepted?: ({recipe, evidence, previous}) => [{path, value, merge?}],
    //     reportUnavailable?: ({recipe, error}) => void,
    //     savedLayerSource?: true - record the source the saved layers were styled for (evidenceRegistry.js)
    // }
    observation: PropTypes.object.isRequired
}
