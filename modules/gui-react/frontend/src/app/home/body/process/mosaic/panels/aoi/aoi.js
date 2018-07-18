import {countryFusionTable, setAoiLayer} from 'app/home/map/aoiLayer'
import {sepalMap} from 'app/home/map/map'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {Field, form} from 'widget/form'
import {Panel} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PanelSections from 'widget/panelSections'
import {RecipeActions, recipePath, RecipeState} from '../../mosaicRecipe'
import styles from './aoi.module.css'
import CountrySection from './countrySection'
import FusionTableSection from './fusionTableSection'
import PolygonSection from './polygonSection'
import SectionSelection from './sectionSelection'

const fields = {
    section: new Field()
        .notBlank('process.mosaic.panel.areaOfInterest.form.section.required'),
    country: new Field()
        .skip((value, {section}) => section !== 'country')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    area: new Field(),
    fusionTable: new Field()
        .skip((value, {section}) => section !== 'fusionTable')
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.fusionTable.required'),
    fusionTableColumn: new Field()
        .skip((value, {section}) => section !== 'fusionTable')
        .skip((value, {fusionTable}) => !fusionTable)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.column.required'),
    fusionTableRow: new Field()
        .skip((value, {section}) => section !== 'fusionTable')
        .skip((value, {fusionTableColumn}) => !fusionTableColumn)
        .notBlank('process.mosaic.panel.areaOfInterest.form.fusionTable.row.required'),
    polygon: new Field()
        .skip((value, {section}) => section !== 'polygon')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    bounds: new Field()
        .notBlank('process.mosaic.panel.areaOfInterest.form.bounds.required')
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    const model = recipeState('model.aoi')
    let values = recipeState('ui.aoi')
    if (!values) {
        values = modelToValues(model)
        RecipeActions(recipeId).setAoi({values, model}).dispatch()
    }
    return {model, values}
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
        this.initialBounds = values.bounds
        this.recipeActions.setAoi({values, model: valuesToModel(values)}).dispatch()
        const aoi = RecipeState(recipeId)('ui.aoi')
        this.aoiUnchanged = _.isEqual(aoi, this.initialAoi)
        setAoiLayer({
                contextId: recipeId,
                aoi: aoi,
                fill: false,
                destroy$: componentWillUnmount$
            }
        )
    }

    render() {
        const {recipeId, form, inputs} = this.props
        const sections = [
            {
                icon: 'cog',
                title: msg('process.mosaic.panel.areaOfInterest.title'),
                component: <SectionSelection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'country',
                title: msg('process.mosaic.panel.areaOfInterest.form.country.title'),
                component: <CountrySection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'fusionTable',
                title: msg('process.mosaic.panel.areaOfInterest.form.fusionTable.title'),
                component: <FusionTableSection recipeId={recipeId} inputs={inputs}/>
            },
            {
                value: 'polygon',
                title: msg('process.mosaic.panel.areaOfInterest.form.polygon.title'),
                component: <PolygonSection recipeId={recipeId} inputs={inputs}/>
            },
        ]
        return (
            <Panel className={styles.panel}>
                <PanelSections inputs={inputs} selected={inputs.section} sections={sections}/>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={(values) => this.onApply(values)}/>
            </Panel>
        )
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
    recipeId: PropTypes.string.isRequired
}

export default form({fields, mapStateToProps})(Aoi)

const valuesToModel = (values) => {
    switch (values.section) {
        case 'country':
            return {
                type: 'fusionTable',
                id: countryFusionTable,
                keyColumn: 'id',
                key: values.area || values.country,
                level: values.area ? 'area' : 'country',
                bounds: values.bounds
            }
        case 'fusionTable':
            return {
                type: 'fusionTable',
                id: values.fusionTable,
                keyColumn: values.fusionTableColumn,
                key: values.fusionTableRow,
                bounds: values.bounds
            }
        case 'polygon':
            return {
                type: 'polygon',
                path: values.polygon,
                bounds: values.bounds
            }
        default:
            throw new Error('Invalid aoi section: ' + values.section)
    }
}

const modelToValues = (model = {}) => {
    if (model.type === 'fusionTable')
        if (model.id === countryFusionTable)
            return {
                section: 'country',
                [model.level]: model.key,
                bounds: model.bounds
            }
        else
            return {
                section: 'fusionTable',
                fusionTable: model.id,
                fusionTableColumn: model.keyColumn,
                fusionTableRow: model.key,
                bounds: model.bounds
            }
    else if (model.type === 'polygon')
        return {
            section: 'polygon',
            polygon: model.path,
            bounds: model.bounds
        }
    else
        return {}
}