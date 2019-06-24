import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {currentUser} from 'widget/user'
import {dataSetById} from 'sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import React from 'react'
import _ from 'lodash'
import styles from './retrieve.module.css'

const fields = {
    bands: new Form.Field()
        .predicate(bands => bands && bands.length, 'process.mosaic.panel.retrieve.form.bands.atLeastOne'),
    scale: new Form.Field(),
    destination: new Form.Field()
        .notEmpty('process.mosaic.panel.retrieve.form.destination.required')
}

const mapRecipeToProps = recipe => {
    const sources = selectFrom(recipe, 'model.sources')
    const props = {
        sources,
        compositeOptions: selectFrom(recipe, 'model.compositeOptions'),
        user: currentUser(),
    }
    if (!selectFrom(recipe, 'ui.retrieve.scale')) {
        const sentinel2 = Object.keys(sources).includes('SENTINEL_2')
        props.values = {scale: sentinel2 ? 10 : 30}
    }
    return props
}

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        this.allBandOptions = [
            {
                options: [
                    option('blue'),
                    option('green'),
                    option('red'),
                    option('nir'),
                    option('swir1'),
                    option('swir2')
                ]
            },
            {
                options: [
                    option('redEdge1'),
                    option('redEdge2'),
                    option('redEdge3'),
                    option('redEdge4')
                ]
            },
            {
                options: [
                    option('aerosol'),
                    option('waterVapor'),
                    option('pan'),
                    option('cirrus'),
                    option('thermal'),
                    option('thermal2')
                ]
            },
            {
                options: [
                    option('brightness'),
                    option('greenness'),
                    option('wetness'),
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
                    title={msg('process.mosaic.panel.retrieve.title')}/>
                <PanelContent>
                    {this.renderContent()}
                </PanelContent>
                <Form.PanelButtons
                    applyLabel={msg('process.mosaic.panel.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {user, sources, compositeOptions, inputs: {bands, scale, destination}} = this.props
        const correction = compositeOptions.corrections.includes('SR') ? 'SR' : 'TOA'
        const bandsForEachDataSet = _.flatten(Object.values(sources))
            .map(dataSetId => dataSetById[dataSetId][correction].bands)
        const availableBands = new Set(
            _.intersection(...bandsForEachDataSet)
        )

        if (compositeOptions.compose !== 'MEDIAN')
            ['unixTimeDays', 'dayOfYear', 'daysFromTarget'].forEach(band => availableBands.add(band))

        const bandOptions = this.allBandOptions
            .map(group => ({
                ...group,
                options: group.options.filter(option => availableBands.has(option.value))
            })
            )
            .filter(group =>
                group.options.length
            )
        const destinationOptions = [
            {
                value: 'SEPAL',
                label: msg('process.mosaic.panel.retrieve.form.destination.SEPAL'),
                disabled: !user.googleTokens
            },
            {
                value: 'GEE',
                label: msg('process.mosaic.panel.retrieve.form.destination.GEE')
            }
        ].filter(({value}) => user.googleTokens || value !== 'GEE')

        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.mosaic.panel.retrieve.form.bands.label')}
                    input={bands}
                    multiple={true}
                    options={bandOptions}/>
                <Form.Slider
                    label={msg('process.radarMosaic.panel.retrieve.form.scale.label')}
                    info={scale => msg('process.radarMosaic.panel.retrieve.form.scale.info', {scale})}
                    input={scale}
                    minValue={10}
                    maxValue={100}
                    scale={'log'}
                    ticks={[10, 15, 20, 30, 60, 100]}
                    snap
                    range='none'
                />
                <Form.Buttons
                    label={msg('process.mosaic.panel.retrieve.form.destination.label')}
                    input={destination}
                    multiple={false}
                    options={destinationOptions}/>
            </Layout>
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

export default compose(
    Retrieve,
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)
