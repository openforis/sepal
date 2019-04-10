import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import Label from 'widget/label'
import {PanelContent, PanelHeader} from 'widget/panel'
import {currentUser} from 'widget/user'
import {RecipeActions} from '../radarMosaicRecipe'
import styles from './retrieve.module.css'
import Slider from 'widget/slider'

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

class Retrieve extends React.Component {
    timeScanBandOptions = [
        {
            options: [
                {value: 'VV_p20', label: <span>VV<sub>20</sub></span>},
                {value: 'VV_p50', label: <span>VV<sub>50</sub></span>},
                {value: 'VV_p80', label: <span>VV<sub>80</sub></span>}
            ]
        },
        {
            options: [
                {value: 'VH_p20', label: <span>VH<sub>20</sub></span>},
                {value: 'VH_p50', label: <span>VH<sub>50</sub></span>},
                {value: 'VH_p80', label: <span>VH<sub>80</sub></span>}
            ]
        },
        {
            options: [
                {value: 'VV_p80_p20', label: <span>VV<sub>80</sub>/VV<sub>20</sub></span>},
                {value: 'VH_p80_p20', label: <span>VH<sub>80</sub>/VH<sub>20</sub></span>},
                {value: 'VV_p50_VH_p50', label: <span>VV<sub>50</sub>/VH<sub>50</sub></span>}
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
            <div className={styles.form}>
                <div>
                    <Label msg={msg('process.radarMosaic.panel.retrieve.form.bands.label')}/>
                    <Buttons
                        input={bands}
                        multiple={true}
                        options={bandOptions}/>
                </div>

                <div>
                    <Label msg={msg('process.radarMosaic.panel.retrieve.form.destination.label')}/>
                    <Buttons
                        input={destination}
                        multiple={false}
                        options={destinationOptions}/>
                </div>

                <div>
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
                </div>
            </div>
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
        const {user, inputs: {destination}} = this.props
        if (!user.googleTokens && destination.value !== 'SEPAL')
            destination.set('SEPAL')
    }
}

const option = band => ({value: band, label: msg(['bands', band])})

Retrieve.propTypes = {}

export default recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})(Retrieve)
