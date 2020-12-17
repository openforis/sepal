import {Form} from 'widget/form/form'
import {Subject, of} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getAvailableBands} from 'sources'
import {map, switchMap, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class RecipeSection extends React.Component {
    constructor(props) {
        super(props)
        this.recipeChanged$ = new Subject()
    }

    render() {
        const {recipes, inputs: {recipe}} = this.props
        const options = recipes
            .filter(({type}) => type === 'CCDC')
            .map(recipe => ({
                value: recipe.id,
                label: recipe.name
            }))
        return (
            <Form.Combo
                label={msg('process.classification.panel.inputImagery.form.recipe.label')}
                input={recipe}
                placeholder={msg('process.classification.panel.inputImagery.form.recipe.placeholder')}
                options={options}
                autoFocus
                onChange={({value}) => this.selectRecipe(value)}
                errorMessage
            />
        )
    }

    selectRecipe(recipeId) {
        const {inputs: {recipe}} = this.props
        recipe.set(null)
        this.recipeChanged$.next()
        const loadRecipe$ = api.recipe.load$(recipeId).pipe(
            switchMap(loadedRecipe => loadedRecipe.model.sources.classification
                ? api.recipe.load$(loadedRecipe.model.sources.classification).pipe(
                    map(classification => ({loadedRecipe, classification}))
                )
                : of({loadedRecipe})
            ),
            takeUntil(this.recipeChanged$)
        )
        this.props.stream('LOAD_RECIPE',
            loadRecipe$,
            ({loadedRecipe, classification}) => this.updateRecipe({loadedRecipe, classification}),
            error =>
                this.props.inputs.asset.setInvalid(
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('asset.failedToLoad')
                )
        )
    }

    updateRecipe({loadedRecipe, classification}) {
        const {inputs: {recipe, bands, dateFormat, startDate, endDate, surfaceReflectance}} = this.props
        const corrections = loadedRecipe.model.options.corrections
        const recipeBands = getAvailableBands({
            sources: loadedRecipe.model.sources.dataSets,
            corrections,
            timeScan: false,
            classification: classification
                ? {
                    classifierType: classification.model.classifier.type,
                    classificationLegend: classification.model.legend,
                    include: ['regression', 'probabilities']
                }
                : {}
        })
        recipe.set(loadedRecipe.id)
        bands.set(recipeBands)
        dateFormat.set(loadedRecipe.model.ccdcOptions.dateFormat)
        startDate.set(loadedRecipe.model.dates.startDate)
        endDate.set(loadedRecipe.model.dates.endDate)
        surfaceReflectance.set(corrections.includes('SR'))
    }
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired
}

export default compose(
    RecipeSection,
    connect(mapStateToProps)
)
