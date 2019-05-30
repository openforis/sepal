/* eslint-disable react/jsx-key */
import {Field, form} from 'widget/form'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {compose} from 'compose'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Combo from 'widget/combo'
import React from 'react'
import _ from 'lodash'
import styles from './bandSelection.module.css'

const fields = {
    selection: new Field()
}

const mapRecipeToProps = recipe => {
    const values = selectFrom(recipe, 'ui.bands') || {}
    const timeScan = !selectFrom(recipe, 'model.dates').targetDate
    return {
        recipeId: recipe.id,
        timeScan,
        values
    }
}

class BandSelection extends React.PureComponent {
    state = {}
    bandOptions = [{
        value: 'VV, VH, ratio_VV_VH',
        bandLabels: [
            'VV',
            'VH',
            'VV/VH'
        ],
        searchableText: 'VV VH ratio_VV_VH VV/VH',
        timeScan: false,
        pointInTime: true
    }, {
        value: 'VV_max, VH_min, NDCV',
        bandLabels: [
            <span>VV<sub>max</sub></span>,
            <span>VH<sub>min</sub></span>,
            <span>NDCV</span>
        ],
        timeScan: true,
        pointInTime: false
    }, {
        value: 'VV_median, VH_median, VV_stdDev',
        bandLabels: [
            <span>VV<sub>med</sub></span>,
            <span>VH<sub>med</sub></span>,
            <span>VV<sub>sd</sub></span>
        ],
        searchableText: 'VV_median VH_median VV_stdDev median stdDev sd',
        timeScan: true,
        pointInTime: false
    }, {
        value: 'VV_median, VH_median, ratio_VV_median_VH_median',
        bandLabels: [
            <span>VV<sub>med</sub></span>,
            <span>VH<sub>med</sub></span>,
            <span>VV<sub>med</sub>/VH<sub>med</sub></span>
        ],
        searchableText: 'VV_median VH_median ratio_VV_median_VH_median median',
        timeScan: true,
        pointInTime: false
    }, {
        value: 'VV_max, VV_min, VV_stdDev',
        bandLabels: [
            <span>VV<sub>max</sub></span>,
            <span>VV<sub>min</sub></span>,
            <span>VV<sub>sd</sub></span>
        ],
        searchableText: 'VV_max VV_min VV_stdDev max min stdDev sd',
        timeScan: true,
        pointInTime: false
    }, {
        value: 'VV_min, VH_min, VV_stdDev',
        bandLabels: [
            <span>VV<sub>min</sub></span>,
            <span>VH<sub>min</sub></span>,
            <span>VV<sub>sd</sub></span>
        ],
        searchableText: 'VV_min VH_min VV_stdDev min stdDev sd',
        timeScan: true,
        pointInTime: false
    }, {
        value: 'VV_phase, VV_amplitude, VV_residuals',
        bandLabels: [
            <span>VV<sub>phase, amp, residuals</sub> (HSV)</span>
        ],
        searchableText: 'VV Harmonics',
        timeScan: true,
        pointInTime: false
    }, {
        value: 'VH_phase, VH_amplitude, VH_residuals',
        bandLabels: [
            <span>VH<sub>phase, amp, residuals</sub> (HSV)</span>
        ],
        searchableText: 'VH Harmonics',
        timeScan: true,
        pointInTime: false
    }]
    metaDataOptions = [
        {value: 'dayOfYear', label: msg('bands.dayOfYear'), timeScan: true, pointInTime: true},
        {value: 'daysFromTarget', label: msg('bands.daysFromTarget'), timeScan: true, pointInTime: true}
    ]
    optionByValue = {}

    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        const options = [...this.bandOptions, ...this.metaDataOptions]
        options.forEach(option => {
            this.optionByValue[option.value] = option
        })
    }

    render() {
        const {timeScan, inputs: {selection}} = this.props
        if (!selection.value)
            return null
        const bandOptions = this.getBandOptions()
        const options = timeScan
            ? bandOptions
            : [
                {label: msg('process.mosaic.bands.combinations'), options: bandOptions},
                {label: msg('process.mosaic.bands.metadata'), options: this.metaDataOptions},
            ]
        return (
            <div className={styles.wrapper}>
                <div className={styles.container}>
                    {this.state.showSelector
                        ? <BandSelector
                            recipeActions={this.recipeActions}
                            selection={selection}
                            options={options}
                            onChange={() => this.setSelectorShown(false)}
                            onCancel={() => this.setSelectorShown(false)}/>
                        : <SelectedBands
                            selectedOption={this.optionByValue[selection.value]}
                            onClick={() => this.setSelectorShown(true)}/>
                    }
                </div>
            </div>
        )
    }

    componentDidUpdate() {
        const {timeScan, inputs: {selection}} = this.props
        const option = this.optionByValue[selection.value]
        const validOption = option && (timeScan ? option.timeScan : option.pointInTime)
        if (!validOption) {
            const bandOptions = this.getBandOptions()
            const value = bandOptions[0].value
            selection.set(value)
            this.recipeActions.setBands(value).dispatch()
        }
    }

    getBandOptions() {
        const {timeScan} = this.props
        const bandOptions = this.bandOptions
            .filter(option => timeScan ? option.timeScan : option.pointInTime)
        bandOptions.forEach(option => {
            option.label =
                option.bandLabels.map((bandLabel, i) =>
                    <React.Fragment key={i}>{bandLabel}{i < option.bandLabels.length - 1 ? ', ' : ''}</React.Fragment>
                )
        })
        return bandOptions
    }

    setSelectorShown(showSelector) {
        this.setState({showSelector})
    }
}

const BandSelector = ({recipeActions, selection, options, onChange, onCancel}) =>
    <form>
        <Combo
            className={styles.combo}
            input={selection}
            placeholder={msg('process.mosaic.bands.placeholder')}
            options={options}
            autoFocus={!isMobile()}
            placement='above'
            standalone
            onChange={option => {
                recipeActions.setBands(option.value).dispatch()
                onChange()
            }}
            onCancel={onCancel}/>
    </form>

const SelectedBands = ({selectedOption, onClick}) => {
    const selection = selectedOption.label
    if (!selection)
        return null
    const bandList = selectedOption.bandLabels || [selectedOption.label]
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
