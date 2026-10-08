import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {assetEvidenceOfState} from '../sourceRuntime/assetEvidence'
import {recordStalenessOfState} from '../sourceRuntime/recordCurrency'
import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {OutputWatch} from './outputWatch'
import {IMAGE_OUTPUT, readRecipeOutput} from './recipeOutput'

// Gives a recipe editor what its output, as the common read answers it, says needs repair in each of its sections: one
// prop per mapper, named as it is, each mapping that read with `mapper({recipe, output, recipeNames})` - the inputs found
// lacking bands they include (bandMath/inputBandProblems.js, stack/inputBandProblems.js), or what needs repair in
// Stack's band names (stack/bandNamesProblems.js). It watches that question for as long as the editor is open, asking it to
// explain a refusal (recipeOutput.js): a recipe refused for its own configuration is refused at once, and read for its
// inputs too. The runtime shares any description with a map layer and a Retrieve, so what the editor adds is a
// description while neither does - its layer hidden, say - and the explanation, which only it asks.
//
// Needs the recipe's id.

const mapStateToProps = (state, {recipeId}) => {
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes')
    const recipe = loadedRecipes?.[recipeId]
    return {
        outputRecipe: recipe,
        outputGraph: recipe ? buildMapDependencyGraph({recipe, loadedRecipes}) : null,
        outputStaleness: recordStalenessOfState(state),
        outputAssets: assetEvidenceOfState(state),
        outputRecipeNames: selectFrom(state, 'process.recipes')
    }
}

export const withOutputProblems = mappers => WrappedComponent => {
    class OutputProblems extends React.Component {
        mounted = false
        watch = new OutputWatch({
            sourceRuntime: this.props.sourceRuntime,
            onChange: () => this.mounted && this.forceUpdate()
        })

        render() {
            const {
                outputRecipe: _outputRecipe, outputGraph: _outputGraph, outputStaleness: _outputStaleness,
                outputAssets: _outputAssets, outputRecipeNames: _outputRecipeNames, sourceRuntime: _sourceRuntime, ...props
            } = this.props
            return <WrappedComponent {...props} {...this.problems()}/>
        }

        componentDidMount() {
            this.mounted = true
            this.update()
        }

        componentDidUpdate() {
            this.update()
        }

        componentWillUnmount() {
            this.mounted = false
            this.watch.stop()
        }

        update() {
            const {recipeId} = this.props
            this.watch.update({recipeId, product: {name: IMAGE_OUTPUT}, explain: true})
        }

        problems() {
            const {outputRecipe: recipe, outputGraph: graph, outputStaleness, outputAssets, outputRecipeNames, sourceRuntime} = this.props
            if (!recipe) {
                return _.mapValues(mappers, () => [])
            }
            const output = readRecipeOutput({
                recipe,
                product: {name: IMAGE_OUTPUT},
                graph,
                heldFor: key => sourceRuntime.heldFor(key),
                currency: outputStaleness,
                assetEvidence: outputAssets,
                explain: true
            })
            const recipeNames = Object.fromEntries((outputRecipeNames || []).map(({id, name}) => [id, name]))
            return _.mapValues(mappers, mapper => mapper({recipe, output, recipeNames}))
        }
    }

    return compose(
        OutputProblems,
        connect(mapStateToProps),
        withSourceRuntime()
    )
}
