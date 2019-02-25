import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {countryFusionTable, setAoiLayer} from 'app/home/map/aoiLayer'
import {sepalMap} from 'app/home/map/map'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import PanelSections from 'widget/panelSections'
import styles from './aoi.module.css'
import CountrySection from './countrySection'
import FusionTableSection from './fusionTableSection'
import PolygonSection from './polygonSection'
import SectionSelection from './sectionSelection'

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
        this.initialBounds = sepalMap.getBounds()
        this.initialZoom = sepalMap.getZoom()
    }

    render() {
        const {recipeId, inputs} = this.props
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
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onApply={(values, model) => this.onApply(values, model)}
                onCancel={() => this.onCancel()}>
                <PanelSections inputs={inputs} selected={inputs.section} sections={sections}/>

                <FormPanelButtons/>
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

    componentWillUnmount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).showPreview().dispatch()
    }

    onApply(values, model) {
        this.updateLayer(model)
    }

    onCancel() {
        const {model} = this.props
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

export default recipeFormPanel({id: 'aoi', fields, modelToValues, valuesToModel})(Aoi)
