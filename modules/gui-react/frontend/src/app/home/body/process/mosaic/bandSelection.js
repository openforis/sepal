import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import _ from 'lodash'
import React from 'react'
import {msg} from 'translate'
import ComboBox from 'widget/comboBox'
import {Constraints, form} from 'widget/form'
import styles from './bandSelection.module.css'

const inputs = {
    bands: new Constraints()
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        initialized: recipe('ui.initialized'),
        source: Object.keys(recipe('sources'))[0],
        values: {bands: recipe('ui.bands')}
    }
}

class BandSelection extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = new RecipeActions(props.recipeId)
    }

    render() {
        const {initialized, inputs: {bands}} = this.props
        const options = [
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
                    {value: 'unixTimeDays', label: 'Date'},
                    {value: 'dayOfYear', label: 'Day of year'},
                    {value: 'daysFromTarget', label: 'Days from target'}
                ]
            }
        ]
        // if (initialized)
        return (
            <div className={styles.container}>
                <div className={styles.selection}>
                    <ComboBox
                        input={bands}
                        placeholder={msg('process.mosaic.bands.placeholder')}
                        options={options}
                        menuPlacement='top'
                        maxMenuHeight='40rem'
                        isClearable={false}
                        showChevron={false}
                        onChange={(option) =>
                            this.recipe.setBands(option ? option.value : null).dispatch()
                        }>
                        {
                            (props) => {
                                console.log(props)
                                return <SelectedBands bands={props.getValue()[0].label}/>
                            }
                        }

                    </ComboBox>
                </div>
            </div>
        )
        // else
        //     return null
    }
}

const SelectedBands = ({bands}) => {
    if (!bands)
        return null
    console.log({bands})
    const bandList = bands.split(', ')
    const bandClasses = bandList.length === 1
        ? ['single']
        : ['red', 'green', 'blue']

    const bandElements = _.zip(bandList, bandClasses).map(([band, className]) =>
        <div key={className} className={styles[className]}>
            {band}
        </div>
    )
    return (
        <div className={styles.selectedBands}>
            {bandElements}
        </div>
    )

}

export default form(inputs, mapStateToProps)(BandSelection)