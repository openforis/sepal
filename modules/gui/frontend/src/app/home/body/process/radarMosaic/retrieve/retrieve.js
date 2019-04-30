import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../radarMosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {currentUser} from 'widget/user'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import Buttons from 'widget/buttons'
import React from 'react'
import Slider from 'widget/slider'
import styles from './retrieve.module.css'

const fields = {
    bands: new Field()
        .predicate(bands => bands && bands.length, 'process.radarMosaic.panel.retrieve.form.bands.atLeastOne'),
    scale: new Field(),
    destination: new Field()
        .notEmpty('process.radarMosaic.panel.retrieve.form.destination.required')
}

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'model.sources'),
    timeScan: !selectFrom(recipe, 'model.dates.targetDate'),
    user: currentUser()
})

const option = band => ({value: band, label: msg(['bands', band])})

class Retrieve extends React.Component {
    timeScanBandOptions = [
        {
            options: [
                {value: 'VV_min', label: <span>VV<sub>min</sub></span>},
                {value: 'VV_mean', label: <span>VV<sub>mean</sub></span>},
                {value: 'VV_median', label: <span>VV<sub>med</sub></span>},
                {value: 'VV_max', label: <span>VV<sub>max</sub></span>},
                {value: 'VV_stdDev', label: <span>VV<sub>sd</sub></span>},
                {value: 'VV_CV', label: <span>VV<sub>cv</sub></span>}
            ]
        },
        {
            options: [
                {value: 'VH_min', label: <span>VH<sub>min</sub></span>},
                {value: 'VH_mean', label: <span>VH<sub>mean</sub></span>},
                {value: 'VH_median', label: <span>VH<sub>med</sub></span>},
                {value: 'VH_max', label: <span>VH<sub>max</sub></span>},
                {value: 'VH_stdDev', label: <span>VH<sub>sd</sub></span>},
                {value: 'VH_CV', label: <span>VH<sub>cv</sub></span>}
            ]
        }
    ]

    pointInTimeOptions = [
        {
            options: [
                {value: 'VV', label: 'VV'},
                {value: 'VH', label: 'VH'},
                {value: 'VV_VH', label: 'VV/VH'},
            ]
        },
        {
            options: [
                option('unixTimeDays'),
                option('dayOfYear'),
                option('daysFromTarget')
            ]
        }
    ]

    constructor(props) {
        super(props)
        const {inputs: {scale}} = this.props
        if (!scale.value)
            scale.set(20)
    }

    renderContent() {
        const {user, timeScan, inputs: {bands, scale, destination}} = this.props

        const bandOptions = timeScan ? this.timeScanBandOptions : this.pointInTimeOptions
        const destinationOptions = [
            {
                value: 'SEPAL',
                label: msg('process.radarMosaic.panel.retrieve.form.destination.SEPAL'),
                disabled: !user.googleTokens
            },
            {
                value: 'GEE',
                label: msg('process.radarMosaic.panel.retrieve.form.destination.GEE')
            }
        ].filter(({value}) => user.googleTokens || value !== 'GEE')

        return (
            <React.Fragment>
                <Buttons
                    label={msg('process.radarMosaic.panel.retrieve.form.bands.label')}
                    input={bands}
                    multiple={true}
                    options={bandOptions}/>
                <Buttons
                    label={msg('process.radarMosaic.panel.retrieve.form.destination.label')}
                    input={destination}
                    multiple={false}
                    options={destinationOptions}/>
                <Slider
                    label={msg('process.radarMosaic.panel.retrieve.form.scale.label')}
                    info={scale => msg('process.radarMosaic.panel.retrieve.form.scale.info', {scale})}
                    input={scale}
                    minValue={10}
                    maxValue={50}
                    ticks={[10, 15, 20, 30, 40, 50]}
                    snap
                    range='none'
                />
            </React.Fragment>
        )
    }

    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => RecipeActions(recipeId).retrieve(values).dispatch()}>
                <PanelHeader
                    icon='cloud-download-alt'
                    title={msg('process.radarMosaic.panel.retrieve.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons
                    applyLabel={msg('process.radarMosaic.panel.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }

    componentDidUpdate() {
        const {user, timeScan, inputs: {bands, destination}} = this.props
        if (!user.googleTokens && destination.value !== 'SEPAL')
            destination.set('SEPAL')

        const validBands = (timeScan ? this.timeScanBandOptions : this.pointInTimeOptions)
            .map(group => group.options.map(option => option.value))
            .flat()
        const invalidBand = (bands.value || []).find(band => !validBands.includes(band))
        const selectedInvalid = !!invalidBand
        if (selectedInvalid)
            bands.set([])
    }
}

Retrieve.propTypes = {}

export default recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})(Retrieve)
