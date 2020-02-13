import {Form} from 'widget/form/form'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {countryEETable, setAoiLayer} from 'app/home/map/aoiLayer'
import {msg} from 'translate'
import {sepalMap} from 'app/home/map/map'
import CountrySection from './countrySection'
import EETableSection from './eeTableSection'
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
    eeTable: new Form.Field()
        .skip((value, {section}) => section !== 'EE_TABLE')
        .notBlank('process.mosaic.panel.areaOfInterest.form.eeTable.eeTable.required'),
    allowWholeEETable: new Form.Field(),
    eeTableRowSelection: new Form.Field(),
    eeTableColumn: new Form.Field()
        .skip((value, {section}) => section !== 'EE_TABLE')
        .skip((_, {eeTableRowSelection}) => eeTableRowSelection === 'INCLUDE_ALL')
        .skip((value, {eeTable}) => !eeTable)
        .notBlank('process.mosaic.panel.areaOfInterest.form.eeTable.column.required'),
    eeTableRow: new Form.Field()
        .skip((value, {section}) => section !== 'EE_TABLE')
        .skip((_, {eeTableRowSelection}) => eeTableRowSelection === 'INCLUDE_ALL')
        .skip((value, {eeTableColumn}) => !eeTableColumn)
        .notBlank('process.mosaic.panel.areaOfInterest.form.eeTable.row.required'),

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
        const {recipeId, allowWholeEETable, inputs} = this.props
        const sections = [{
            component: <SectionSelection recipeId={recipeId} inputs={inputs}/>
        }, {
            value: 'COUNTRY',
            label: msg('process.mosaic.panel.areaOfInterest.form.country.title'),
            title: 'COUNTRY/PROVINCE',
            component: <CountrySection recipeId={recipeId} inputs={inputs}/>
        }, {
            value: 'EE_TABLE',
            label: msg('process.mosaic.panel.areaOfInterest.form.eeTable.title'),
            title: 'EE TABLE',
            component: <EETableSection
                recipeId={recipeId}
                inputs={inputs}
                allowWholeEETable={allowWholeEETable}/>
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
        const {inputs, allowWholeEETable = ''} = this.props
        inputs.allowWholeEETable.set(allowWholeEETable)
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
    allowWholeEETable: PropTypes.any
}

const valuesToModel = values => {
    switch (values.section) {
    case 'COUNTRY':
        return {
            type: 'EE_TABLE',
            id: countryEETable,
            keyColumn: 'id',
            key: values.area || values.country,
            level: values.area ? 'AREA' : 'COUNTRY'
        }
    case 'EE_TABLE':
        return {
            type: 'EE_TABLE',
            id: values.eeTable,
            keyColumn: values.eeTableRowSelection === 'FILTER' ? values.eeTableColumn : null,
            key: values.eeTableRowSelection === 'FILTER' ? values.eeTableRow : null,
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
    if (model.type === 'EE_TABLE')
        if (model.id === countryEETable) // TODO: Add EE Table for countries
            return {
                section: 'COUNTRY',
                [model.level ? model.level.toLowerCase() : 'COUNTRY']: model.key
            }
        else
            return {
                section: 'EE_TABLE',
                eeTable: model.id,
                eeTableColumn: model.keyColumn,
                eeTableRow: model.key,
                eeTableRowSelection: model.keyColumn ? 'FILTER' : 'INCLUDE_ALL'
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
