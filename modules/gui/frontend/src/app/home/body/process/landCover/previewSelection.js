import _ from 'lodash'
import React from 'react'
import {msg} from 'translate'
import ComboBox from 'widget/comboBox'
import {Field, form} from 'widget/form'
import {RecipeActions, RecipeState, Status} from './landCoverRecipe'
import styles from './previewSelection.module.css'

const fields = {
    type: new Field(),
    year: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    const recipeActions = RecipeActions(recipeId)

    const period = recipeState('model.period')
    let values = recipeState('ui.preview') || {}
    if (!values.type) {
        values.type = 'red,green,blue'
        recipeActions.setPreviewType('composite', 'red,green,blue').dispatch()
    }

    const startYear = period && period.startYear && values.year
    if (!startYear) {
        values.year = period.startYear
        recipeActions.setPreviewYear(period.startYear).dispatch()
    }
    return {
        status: recipeState('model.status'),
        period: recipeState('model.period'),
        primitiveTypes: recipeState('model.typology.primitiveTypes'),
        values
    }
}

class PreviewSelection extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {status, primitiveTypes, period: {startYear, endYear}, inputs: {type, year}} = this.props
        const compositeOptions = {
            label: 'Composite',
            options: [
                {value: 'red,green,blue', label: 'RED, GREEN, BLUE', group: 'composite'},
                {value: 'swir2,nir,red', label: 'SWIR2, NIR, RED', group: 'composite'}
            ]
        }

        const options = [Status.LAND_COVER_MAP_CREATED].includes(status)
            ? [
                {
                    label: 'Results',
                    options: [
                        {value: 'classification', label: 'Land cover map', group: 'assembly'},
                        {value: 'confidence', label: 'Confidence', group: 'assembly'}
                    ]
                },
                {
                    label: 'Primitives',
                    options: primitiveTypes
                        .map(primitiveType => ({
                            value: primitiveType.id,
                            label: primitiveType.label,
                            group: 'primitive'
                        }))
                },
                compositeOptions
            ]
            : [compositeOptions]
        const yearOptions = _.range(startYear, endYear + 1)
            .map(year => ({value: year, label: '' + year}))
        return (
            <div className={styles.container}>
                <div className={styles.wrapper}>
                    <Select
                        input={type}
                        options={options}
                        placeholder={msg('process.mosaic.bands.placeholder')}
                        listClassName={styles.selector}
                        onChange={option =>
                            option
                                ? this.recipeActions.setPreviewType(option.group, option.value).dispatch()
                                : this.recipeActions.setPreviewType().dispatch()}>
                        {option =>
                            <SelectedPreview selection={option}/>
                        }
                    </Select>
                    <Select
                        input={year}
                        options={yearOptions}
                        placeholder='Pick year'
                        listClassName={styles.yearList}
                        onChange={option =>
                            this.recipeActions.setPreviewYear(option ? option.value : null).dispatch()}>
                        {option =>
                            <div className={styles.yearPreview}>{option.label}</div>
                        }
                    </Select>
                </div>
            </div>
        )
    }

    componentDidUpdate() {
    }
}

class Select extends React.Component {
    state = {}

    render() {
        const {input, options, placeholder, listClassName, onChange, children} = this.props
        const optionByValue = {} // TODO: Do this differently
        options.forEach(option => {
            if (option.options)
                option.options.forEach(option => optionByValue[option.value] = option)
            else
                optionByValue[option.value] = option
        })
        return (
            <React.Fragment>
                {this.state.showList
                    ? <OptionList
                        input={input}
                        options={options}
                        placeholder={placeholder}
                        className={listClassName}
                        onChange={(option) => {
                            onChange(option)
                            this.setListShown(false)
                        }}/>
                    : <div onClick={() => this.setListShown(true)}>
                        {children(optionByValue[input.value])}
                    </div>
                }
            </React.Fragment>
        )
    }

    setListShown(shown) {
        this.setState(prevState =>
            ({...prevState, showList: shown})
        )
    }
}

const OptionList = ({input, options, placeholder, className, onChange}) =>
    <div className={styles.list}>
        <ComboBox
            input={input}
            placeholder={placeholder}
            options={options}
            autoFocus={true}
            openMenuOnFocus={true}
            menuPlacement='top'
            maxMenuHeight='40rem'
            isClearable={false}
            showChevron={false}
            showCurrentSelection={false}
            controlClassName={className}
            menuClassName={styles.menu}
            onMenuClose={onChange}
            onChange={option => onChange(option)}>
            {() => null}
        </ComboBox>
    </div>

const SelectedPreview = ({selection}) => {
    const label = selection && selection.label
    if (!label)
        return null
    const bandList = label.split(', ')
    const bandClasses = bandList.length === 1
        ? ['single']
        : ['red', 'green', 'blue']

    const previewElements = _.zip(bandList, bandClasses).map(([band, className]) =>
        <div key={className} className={styles[className]}>
            {band}
        </div>
    )
    return (
        <div className={styles.selection}>
            <div className={styles.selectedBands}>
                {previewElements}
            </div>

        </div>
    )

}

export default form({fields, mapStateToProps})(PreviewSelection)
