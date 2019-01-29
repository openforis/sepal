import {Field, form} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import {countryFusionTable, setAoiLayer} from 'app/home/map/aoiLayer'
import {initValues, withRecipePath} from 'app/home/body/process/recipe'
import {msg} from 'translate'
import {sepalMap} from 'app/home/map/map'
import CountrySection from './countrySection'
import FusionTableSection from './fusionTableSection'
import Panel from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PanelSections from 'widget/panelSections'
import PolygonSection from './polygonSection'
import PropTypes from 'prop-types'
import React from 'react'
import SectionSelection from './sectionSelection'
import _ from 'lodash'
import styles from './aoi.module.css'

const fields = {
    section: new Field()
        .notBlank('process.mosaic.panel.areaOfInterest.form.section.required'),
    country: new Field()
        .skip((value, {section}) => section !== 'COUNTRY')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    area: new Field(),
    fusionTable: new Field()
        .skip((value, {section}) => section !== 'FUSION_TABLE')
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.required'),
    allowWholeFusionTable: new Field(),
    fusionTableColumn: new Field()
        .skip((value, {section}) => section !== 'FUSION_TABLE')
        .skip((_, {allowWholeFusionTable}) => allowWholeFusionTable)
        .skip((value, {fusionTable}) => !fusionTable)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.column.required'),
    fusionTableRow: new Field()
        .skip((value, {section}) => section !== 'FUSION_TABLE')
        .skip((_, {allowWholeFusionTable}) => allowWholeFusionTable)
        .skip((value, {fusionTableColumn}) => !fusionTableColumn)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.row.required'),
    polygon: new Field()
        .skip((value, {section}) => section !== 'POLYGON')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required')
}

class Aoi extends React.Component {
    constructor(props) {
        super(props)
        const {values, recipeId} = props
        this.aoiUnchanged = true
        this.initialAoi = values
        this.initialBounds = sepalMap.getBounds()
        this.initialZoom = sepalMap.getZoom()
        this.recipeActions = RecipeActions(recipeId)
    }

    onApply(values) {
        const {recipeId, componentWillUnmount$} = this.props
        this.recipeActions.setAoi({values, model: valuesToModel(values)}).dispatch()
        const aoi = RecipeState(recipeId)('ui.aoi')
        this.aoiUnchanged = _.isEqual(aoi, this.initialAoi)
        setAoiLayer({
            contextId: recipeId,
            aoi: aoi,
            fill: false,
            destroy$: componentWillUnmount$
        })
    }

    render() {
        const {recipeId, recipePath, form, inputs} = this.props
        const sections = [
            {
                icon: 'cog',
                title: msg('process.mosaic.panel.areaOfInterest.title'),
                component: <SectionSelection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'COUNTRY',
                title: msg('process.mosaic.panel.areaOfInterest.form.country.title'),
                component: <CountrySection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'FUSION_TABLE',
                title: msg('process.mosaic.panel.areaOfInterest.form.fusionTable.title'),
                component: <FusionTableSection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'POLYGON',
                title: msg('process.mosaic.panel.areaOfInterest.form.polygon.title'),
                component: <PolygonSection recipeId={recipeId} inputs={inputs}/>
            },
        ]
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath + '.ui'}
                onApply={values => this.onApply(values)}>
                <PanelSections inputs={inputs} selected={inputs.section} sections={sections}/>

                <PanelButtons/>
            </Panel>
        )
    }

    componentDidUpdate() {
        let input = this.props.inputs.allowWholeFusionTable
        let allowWholeFusionTable = this.props.allowWholeFusionTable
        input.set(allowWholeFusionTable)
    }

    componentWillUnmount() {
        const {recipeId} = this.props
        const recipeState = RecipeState(recipeId)
        setAoiLayer({
            contextId: recipeId,
            aoi: recipeState && recipeState('model.aoi'),
            fill: false
        }
        )
        if (this.aoiUnchanged) {
            sepalMap.fitBounds(this.initialBounds)
            sepalMap.setZoom(this.initialZoom)
        }
    }
}

Aoi.propTypes = {
    recipeId: PropTypes.string.isRequired,
    allowWholeFusionTable: PropTypes.any
}

const valuesToModel = values => {
    switch (values.section) {
    case 'COUNTRY':
        return {
            type: 'FUSION_TABLE',
            id: countryFusionTable,
            keyColumn: 'id',
            key: values.area || values.country,
            level: values.area ? 'AREA' : 'COUNTRY'
        }
    case 'FUSION_TABLE':
        return {
            type: 'FUSION_TABLE',
            id: values.fusionTable,
            keyColumn: values.fusionTableColumn,
            key: values.fusionTableRow,
            bounds: values.bounds
        }
    case 'POLYGON':
        return {
            type: 'POLYGON',
            path: values.polygon
        }
    default:
        throw new Error('Invalid aoi section: ' + values.section)
    }
}

const modelToValues = (model = {}) => {
    if (model.type === 'FUSION_TABLE')
        if (model.id === countryFusionTable)
            return {
                section: 'COUNTRY',
                [model.level.toLowerCase()]: model.key
            }
        else
            return {
                section: 'FUSION_TABLE',
                fusionTable: model.id,
                fusionTableColumn: model.keyColumn,
                fusionTableRow: model.key
            }
    else if (model.type === 'POLYGON')
        return {
            section: 'POLYGON',
            polygon: model.path
        }
    else
        return {}
}

export default withRecipePath()(
    initValues({
        getModel: props => RecipeState(props.recipeId)('model.aoi'),
        getValues: props => RecipeState(props.recipeId)('ui.aoi'),
        modelToValues,
        onInitialized: ({model, values, props}) =>
            RecipeActions(props.recipeId)
                .setAoi({values, model})
                .dispatch()
    })(
        form({fields})(Aoi)
    )
)
