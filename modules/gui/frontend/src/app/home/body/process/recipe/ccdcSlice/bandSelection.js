/* eslint-disable react/jsx-key */
import {Form, form} from 'widget/form/form'
import {RecipeActions} from './ccdcSliceRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import styles from './bandSelection.module.css'

const fields = {
    selection: new Form.Field()
}

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id,
        assetBands: selectFrom(recipe, 'model.source.bands')
    }
}

class BandSelection extends React.PureComponent {
    state = {}
    bandCombinations = [
        {bands: ['VV', 'VH', 'ratio_VV_VH'], label: 'VV, VH, VV/VH'},
        {bands: ['red', 'green', 'blue'], label: 'RED, GREEN, BLUE'},
        {bands: ['nir', 'red', 'green'], label: 'NIR, RED, GREEN'},
        {bands: ['nir', 'swir1', 'red'], label: 'NIR, SWIR1, RED'},
        {bands: ['swir2', 'nir', 'red'], label: 'SWIR2, NIR, RED'},
        {bands: ['swir2', 'swir1', 'red'], label: 'SWIR2, SWIR1, RED'},
        {bands: ['swir2', 'nir', 'green'], label: 'SWIR2, NIR, GREEN'},
        {bands: ['brightness', 'greenness', 'wetness'], label: 'Brightness, Greenness, Wetness'}
    ]
    allBands = [
        'VV', 'VH', 'ratio_VV_VH',
        'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
        'ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui',
        'brightness', 'greenness', 'wetness'
    ]
    individualBands = [
        'ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui'
    ]

    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {inputs: {selection}} = this.props
        const {showSelector, bandOptions, optionByValue} = this.state
        if (!selection.value)
            return null
        return (
            <div className={styles.wrapper}>
                <div className={styles.container}>
                    {showSelector
                        ? <BandSelector
                            selection={selection}
                            options={bandOptions}
                            onChange={option => {
                                this.recipeActions.setBands(option.value, option.baseBands)
                                this.setSelectorShown(false)
                            }}
                            onCancel={() => this.setSelectorShown(false)}/>
                        : <SelectedBands
                            selectedOption={optionByValue[selection.value]}
                            onClick={() => this.setSelectorShown(true)}/>
                    }
                </div>
            </div>
        )
    }

    componentDidMount() {
        this.updateBandOptions()
    }

    componentDidUpdate(prevProps) {
        const {assetBands, inputs: {selection}} = this.props
        const assetBandsChanged = !_.isEqual(prevProps.assetBands, assetBands)
        const {bandOptions, optionByValue} = assetBandsChanged
            ? this.updateBandOptions()
            : this.state
        const validOption = optionByValue[selection.value]
        if (!validOption) {
            const defaultOption = bandOptions[0].options[0]
            const value = defaultOption.value
            selection.set(value)
            this.recipeActions.setBands(value, defaultOption.baseBands)
        }
    }

    updateBandOptions() {
        const {assetBands} = this.props
        const bandOptions = [
            {
                label: msg('process.mosaic.bands.combinations'),
                options: this.bandCombinations
                    .filter(({bands}) => bands.every(band => assetBands.includes(band)))
                    .map(({bands, label}) => ({value: bands.join(', '), label, baseBands: bands}))
            },
            {
                label: 'Individual bands', // TODO: Use message bundle
                options: this.individualBands
                    .filter(band => assetBands.includes(band))
                    .map(band => ({value: band, label: band.toUpperCase(), baseBands: [band]}))
            },
            {
                label: 'Harmonics', // TODO: Use message bundle
                options: this.allBands
                    .filter(band => assetBands.includes(band))
                    .map(band => ({
                        value: `${band}_phase_1, ${band}_amplitude_1, ${band}_rmse`,
                        label: `${band.toUpperCase()} harmonics`, // TODO: Use message bundle
                        baseBands: [band]
                    }))
            }
        ].filter(({options}) => options.length)
        const optionByValue = {}
        bandOptions.forEach(({options}) =>
            options.forEach(option =>
                optionByValue[option.value] = option)
        )
        this.setState({bandOptions, optionByValue})
        return {bandOptions, optionByValue}
    }

    setSelectorShown(showSelector) {
        this.setState({showSelector})
    }
}

const BandSelector = ({selection, options, onChange, onCancel}) =>
    <form>
        <Form.Combo
            className={styles.combo}
            input={selection}
            placeholder={msg('process.mosaic.bands.placeholder')}
            options={options}
            autoFocus
            placement='above'
            standalone
            onChange={option => onChange(option)}
            onCancel={onCancel}/>
    </form>

const SelectedBands = ({selectedOption, onClick}) => {
    const selection = selectedOption && selectedOption.label
    if (!selection)
        return null
    const bandList = selectedOption.label.split(', ')
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
        </div>
    )

}

export default compose(
    BandSelection,
    form({fields}),
    withRecipe(mapRecipeToProps)
)
