import {Field, form} from 'widget/form'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Checkbox from 'widget/checkbox'
import ComboBox from 'widget/comboBox'
import React from 'react'
import _ from 'lodash'
import styles from './bandSelection.module.css'

const fields = {
    selection: new Field(),
    panSharpen: new Field()
}

const mapRecipeToProps = recipe => {
    const values = selectFrom(recipe, 'ui.bands') || {}
    const compositeOptions = selectFrom(recipe, 'model.compositeOptions')
    return {
        recipeId: recipe.id,
        sources: selectFrom(recipe, 'model.sources'),
        surfaceReflectance: compositeOptions.corrections.includes('SR'),
        median: compositeOptions.compose === 'MEDIAN',
        values
    }
}

class BandSelection extends React.Component {
    state = {}
    options = [
        {
            label: msg('process.mosaic.bands.combinations'),
            options: [
                {value: 'red, green, blue', label: 'RED, GREEN, BLUE'},
                {value: 'nir, red, green', label: 'NIR, RED, GREEN'},
                {value: 'nir, swir1, red', label: 'NIR, SWIR1, RED'},
                {value: 'swir2, nir, red', label: 'SWIR2, NIR, RED'},
                {value: 'swir2, swir1, red', label: 'SWIR2, SWIR1, RED'},
                {value: 'swir2, nir, green', label: 'SWIR2, NIR, GREEN'},
            ]
        },
        {
            label: msg('process.mosaic.bands.metadata'),
            options: [
                {value: 'unixTimeDays', label: msg('bands.unixTimeDays')},
                {value: 'dayOfYear', label: msg('bands.dayOfYear')},
                {value: 'daysFromTarget', label: msg('bands.daysFromTarget')}
            ]
        }
    ]
    optionByValue = {}

    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
        this.options.forEach(option => {
            if (option.options)
                option.options.forEach(option => this.optionByValue[option.value] = option)
            else
                this.optionByValue[option.value] = option
        })
    }

    render() {
        const {sources, surfaceReflectance, median, inputs: {selection, panSharpen}} = this.props
        console.log({sources})
        const canPanSharpen = sources.LANDSAT
            && !surfaceReflectance
            && ['red, green, blue', 'nir, red, green'].includes(selection.value)
        const options = median
            ? this.options[0].options
            : this.options
        return (
            <div className={styles.wrapper}>
                <div className={styles.container}>
                    {this.state.showSelector
                        ? <BandSelector
                            recipeActions={this.recipeActions}
                            selection={selection}
                            options={options}
                            onChange={() => this.setSelectorShown(false)}/>
                        : <SelectedBands
                            recipeActions={this.recipeActions}
                            selectedOption={this.optionByValue[selection.value]}
                            canPanSharpen={canPanSharpen}
                            panSharpen={panSharpen}
                            onClick={() => this.setSelectorShown(true)}/>
                    }
                </div>
            </div>
        )
    }

    setSelectorShown(shown) {
        this.setState(prevState =>
            ({...prevState, showSelector: shown})
        )
    }
}

const BandSelector = ({recipeActions, selection, options, onChange}) =>
    <ComboBox
        input={selection}
        placeholder={msg('process.mosaic.bands.placeholder')}
        options={options}
        autoFocus={!isMobile()}
        menuIsOpen={true}
        openMenuOnFocus
        menuPlacement='top'
        maxMenuHeight='40rem'
        isClearable={false}
        showChevron={false}
        showCurrentSelection={false}
        controlClassName={styles.selector}
        menuClassName={styles.menu}
        onMenuClose={onChange}
        onChange={option => {
            recipeActions.setBands(option ? option.value : null).dispatch()
            onChange()
        }}>
        {() => null}
    </ComboBox>

const SelectedBands = ({recipeActions, selectedOption, canPanSharpen, panSharpen, onClick}) => {
    const selection = selectedOption.label
    if (!selection)
        return null
    const bandList = selection.split(', ')
    const bandClasses = bandList.length === 1
        ? ['single']
        : ['red', 'green', 'blue']

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

            {canPanSharpen
                ?
                <div className={styles.panSharpen}>
                    <Checkbox label={msg('process.mosaic.bands.panSharpen')} input={panSharpen} onChange={enabled =>
                        recipeActions.setPanSharpen(enabled).dispatch()
                    }/>
                </div>
                : null
            }

        </div>
    )

}

export default withRecipe(mapRecipeToProps)(
    form({fields})(
        BandSelection
    )
)
