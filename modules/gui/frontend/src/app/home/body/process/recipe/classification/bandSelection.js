/* eslint-disable react/jsx-key */
import {Form, form} from 'widget/form/form'
import {RecipeActions} from 'app/home/body/process/recipe/mosaic/mosaicRecipe'
import {compose} from 'compose'
import {getBandOptions} from './classificationRecipe'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import styles from './bandSelection.module.css'

const fields = {
    selection: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    values: selectFrom(recipe, 'ui.bands') || {},
    legend: selectFrom(recipe, 'model.legend') || {},
    classifierType: selectFrom(recipe, 'model.classifier.type')
})

class BandSelection extends React.Component {
    state = {
        bandOptions: [],
        optionByValue: {}
    }

    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {inputs: {selection}} = this.props
        const {bandOptions, optionByValue} = this.state
        if (!selection.value)
            return null
        return (
            <div className={styles.wrapper}>
                <div className={styles.container}>
                    {this.state.showSelector
                        ? <BandSelector
                            recipeActions={this.recipeActions}
                            selection={selection}
                            options={bandOptions}
                            onChange={() => this.setSelectorShown(false)}
                            onCancel={() => this.setSelectorShown(false)}/>
                        : <SelectedBands
                            selectedOption={optionByValue[selection.value]}
                            onClick={() => this.setSelectorShown(true)}/>
                    }
                </div>
            </div>
        )
    }

    componentDidUpdate(prevProps) {
        const {inputs: {selection}} = this.props
        const {bandOptions, optionByValue} = this.state
        const changed = !_.isEqual(
            [prevProps.legend, prevProps.classifierType],
            [this.props.legend, this.props.classifierType])
        if (changed || !bandOptions.length) {
            this.updateBandOptions()
        }

        if (bandOptions.length) {
            const option = optionByValue[selection.value]
            if (!option) {
                const value = bandOptions[0].value
                selection.set(value)
                this.recipeActions.setBands(value).dispatch()
            }
        }
    }

    updateBandOptions() {
        const {legend, classifierType} = this.props
        const bandOptions = getBandOptions(legend, classifierType)
        const optionByValue = {}
        bandOptions.forEach(option => {
            optionByValue[option.value] = option
        })
        this.setState({bandOptions, optionByValue})
    }

    setSelectorShown(showSelector) {
        this.setState({showSelector})
    }
}

const BandSelector = ({recipeActions, selection, options, onChange, onCancel}) =>
    <form>
        <Form.Combo
            className={styles.combo}
            input={selection}
            placeholder={msg('process.mosaic.bands.placeholder')}
            options={options}
            autoFocus
            placement='above'
            standalone
            onChange={option => {
                recipeActions.setBands(option.value).dispatch()
                onChange()
            }}
            onCancel={onCancel}/>
    </form>

const SelectedBands = ({selectedOption, onClick}) => {
    const selection = selectedOption && selectedOption.label
    if (!selection)
        return null
    const bandList = selectedOption.bandLabels || [selectedOption.label]
    const bandClasses = ['single']
    const bandElements = _.zip(bandList, bandClasses).map(([band, className]) =>
        <div key={className} className={styles[className]} onClick={onClick}>
            {band}
        </div>
    )
    return (
        <div className={styles.selection}>
            <div className={styles.selectedBands}>
                {bandElements}
            </div>
        </div>
    )

}

export default compose(
    BandSelection,
    form({fields}),
    withRecipe(mapRecipeToProps)
)
