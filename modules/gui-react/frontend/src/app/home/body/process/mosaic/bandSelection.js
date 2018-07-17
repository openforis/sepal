import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import _ from 'lodash'
import React from 'react'
import {msg} from 'translate'
import Checkbox from 'widget/checkbox'
import ComboBox from 'widget/comboBox'
import {Field, form} from 'widget/form'
import styles from './bandSelection.module.css'

const fields = {
    bands: new Field(),
    panSharpen: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
        source: Object.keys(recipeState('model.sources'))[0],
        surfaceReflectance: recipeState('model.compositeOptions').corrections.includes('SR'),
        values: {bands: recipeState('ui.bands')}
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
        this.recipe = new RecipeActions(props.recipeId)
        this.options.forEach(option => {
            if (option.options)
                option.options.forEach(option => this.optionByValue[option.value] = option)
            else
                this.optionByValue[option.value] = option
        })
    }

    render() {
        const {initialized, source, surfaceReflectance, inputs: {bands, panSharpen}} = this.props
        const canPanSharpen = source === 'landsat'
            && !surfaceReflectance
            && ['red, green, blue', 'nir, red, green'].includes(bands.value)
        if (initialized)
            return (
                <div className={styles.wrapper}>
                    <div className={styles.container}>
                        {this.state.showSelector
                            ? <BandSelector
                                recipe={this.recipe}
                                bands={bands}
                                options={this.options}
                                onChange={() => this.setSelectorShown(false)}/>
                            : <SelectedBands
                                recipe={this.recipe}
                                selectedOption={this.optionByValue[bands.value]}
                                canPanSharpen={canPanSharpen}
                                panSharpen={panSharpen}
                                onClick={() => this.setSelectorShown(true)}/>
                        }
                    </div>
                </div>
            )
        else
            return null
    }

    setSelectorShown(shown) {
        this.setState(prevState =>
            ({...prevState, showSelector: shown})
        )
    }
}

const BandSelector = ({recipe, bands, options, onChange}) =>
    <ComboBox
        input={bands}
        placeholder={msg('process.mosaic.bands.placeholder')}
        options={options}
        autoFocus={true}
        openMenuOnFocus={true}
        menuPlacement='top'
        maxMenuHeight='40rem'
        isClearable={false}
        showChevron={false}
        showCurrentSelection={false}
        controlClassName={styles.selector}
        menuClassName={styles.menu}
        onMenuClose={onChange}
        onChange={(option) => {
            recipe.setBands(option ? option.value : null).dispatch()
            onChange()
        }}>
        {() => null}
    </ComboBox>

const SelectedBands = ({recipe, selectedOption, canPanSharpen, panSharpen, onClick}) => {
    const bands = selectedOption.label
    if (!bands)
        return null
    const bandList = bands.split(', ')
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
                        recipe.setPanSharpen(enabled).dispatch()
                    }/>
                </div>
                : null
            }

        </div>
    )

}

export default form({fields, mapStateToProps})(BandSelection)