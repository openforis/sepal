import {Form} from 'widget/form/form'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {countryFusionTable, setAoiLayer} from 'app/home/map/aoiLayer'
import {msg} from 'translate'
import {sepalMap} from 'app/home/map/map'
import CountrySection from './countrySection'
import FusionTableSection from './fusionTableSection'
import PanelSections from 'widget/panelSections'
import PolygonSection from './polygonSection'
import PropTypes from 'prop-types'
import React from 'react'
import SectionSelection from './sectionSelection'
import styles from './aoi.module.css'

const fields = {
    section: new Form.Field()
        .notBlank('process.mosaic.panel.areaOfInterest.form.section.required'),
    country: new Form.Field()
        .skip((value, {section}) => section !== 'COUNTRY')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    area: new Form.Field(),
    fusionTable: new Form.Field()
        .skip((value, {section}) => section !== 'FUSION_TABLE')
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.required'),
    allowWholeFusionTable: new Form.Field(),
    fusionTableRowSelection: new Form.Field(),
    fusionTableColumn: new Form.Field()
        .skip((value, {section}) => section !== 'FUSION_TABLE')
        .skip((_, {fusionTableRowSelection}) => fusionTableRowSelection === 'INCLUDE_ALL')
        .skip((value, {fusionTable}) => !fusionTable)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.column.required'),
    fusionTableRow: new Form.Field()
        .skip((value, {section}) => section !== 'FUSION_TABLE')
        .skip((_, {fusionTableRowSelection}) => fusionTableRowSelection === 'INCLUDE_ALL')
        .skip((value, {fusionTableColumn}) => !fusionTableColumn)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.row.required'),
    polygon: new Form.Field()
        .skip((value, {section}) => section !== 'POLYGON')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required')
}

class Aoi extends React.Component {
    constructor(props) {
        super(props)
        this.initialBounds = sepalMap.getBounds()
        this.initialZoom = sepalMap.getZoom()
    }

    render() {
        const {recipeId, allowWholeFusionTable, inputs} = this.props
        const sections = [{
            component: <SectionSelection recipeId={recipeId} inputs={inputs}/>
        }, {
            value: 'COUNTRY',
            label: msg('process.mosaic.panel.areaOfInterest.form.country.title'),
            title: 'COUNTRY/PROVINCE',
            component: <CountrySection recipeId={recipeId} inputs={inputs}/>
        }, {
            value: 'FUSION_TABLE',
            label: msg('process.mosaic.panel.areaOfInterest.form.fusionTable.title'),
            title: 'FUSION TABLE',
            component: <FusionTableSection
                recipeId={recipeId}
                inputs={inputs}
                allowWholeFusionTable={allowWholeFusionTable}/>
        }, {
            value: 'POLYGON',
            label: msg('process.mosaic.panel.areaOfInterest.form.polygon.title'),
            title: 'POLYGON',
            component: <PolygonSection recipeId={recipeId} inputs={inputs}/>
        }]
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onApply={(values, model) => this.onApply(values, model)}
                onCancel={() => this.onCancel()}>
                <PanelSections
                    inputs={inputs}
                    sections={sections}
                    selected={inputs.section}
                    icon='globe'
                    label={msg('process.mosaic.panel.areaOfInterest.title')}
                />
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }

    componentDidUpdate() {
        const {inputs, allowWholeFusionTable = ''} = this.props
        inputs.allowWholeFusionTable.set(allowWholeFusionTable)
    }

    showPreview() {
        const {recipeId} = this.props
        RecipeActions(recipeId).showPreview().dispatch()
    }

    onApply(values, model) {
        this.showPreview()
        this.updateLayer(model)
    }

    onCancel() {
        const {model} = this.props
        this.showPreview()
        this.updateLayer(model)
        sepalMap.fitBounds(this.initialBounds)
        sepalMap.setZoom(this.initialZoom)
    }

    updateLayer(model) {
        const {recipeId} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi: model,
            fill: false,
        })
    }
}

Aoi.propTypes = {
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
            keyColumn: values.fusionTableRowSelection === 'FILTER' ? values.fusionTableColumn : null,
            key: values.fusionTableRowSelection === 'FILTER' ? values.fusionTableRow : null,
            bounds: values.bounds
        }
    case 'POLYGON':
        return {
            type: 'POLYGON',
            path: values.polygon
        }
    default:
        throw Error('Invalid aoi section: ' + values.section)
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
                fusionTableRow: model.key,
                fusionTableRowSelection: model.keyColumn ? 'FILTER' : 'INCLUDE_ALL'
            }
    else if (model.type === 'POLYGON')
        return {
            section: 'POLYGON',
            polygon: model.path
        }
    else
        return {}
}

export default compose(
    Aoi,
    recipeFormPanel({id: 'aoi', fields, modelToValues, valuesToModel})
)
