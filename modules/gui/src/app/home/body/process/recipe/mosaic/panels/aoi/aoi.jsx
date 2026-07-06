import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import styles from './aoi.module.css'
import {modelToValues, valuesToModel} from './aoiModel'
import {AssetBoundsSection} from './assetBoundsSection'
import {CountrySection} from './countrySection'
import {EETableSection} from './eeTableSection'
import {PolygonSection} from './polygonSection'
import {SectionSelection} from './sectionSelection'
import {SourceSection} from './sourceSection'

const fields = {
    section: new Form.Field()
        .notBlank('process.mosaic.panel.areaOfInterest.form.section.required'),
    country: new Form.Field()
        .skip((value, {section}) => section !== 'COUNTRY')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required')
        .notEmpty('process.mosaic.panel.areaOfInterest.form.country.required'),
    area: new Form.Field(),
    eeTable: new Form.Field()
        .skip((value, {section}) => section !== 'EE_TABLE')
        .notBlank('process.mosaic.panel.areaOfInterest.form.eeTable.eeTable.required'),
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
    buffer: new Form.Field()
        .skip((value, {section}) => !['EE_TABLE', 'COUNTRY'].includes(section))
        .int(),
    polygon: new Form.Field()
        .skip((value, {section}) => section !== 'POLYGON')
        .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
    sourceType: new Form.Field()
        .skip((value, {section}) => section !== 'SOURCE')
        .notBlank('process.mosaic.panel.areaOfInterest.form.source.type.required'),
    assetId: new Form.Field()
        .skip((value, {section, sourceType}) => !(section === 'SOURCE' && sourceType === 'ASSET'))
        .notBlank('process.mosaic.panel.areaOfInterest.form.asset.required'),
    recipeId: new Form.Field()
        .skip((value, {section, sourceType}) => !(section === 'SOURCE' && sourceType === 'RECIPE'))
        .notBlank('process.mosaic.panel.areaOfInterest.form.recipe.required')
}

class _Aoi extends React.Component {
    constructor(props) {
        super(props)
        this.state = {canceled: false}
    }

    render() {
        const {assetBounds, recipeId, inputs, layerIndex = 1} = this.props
        const sections = [
            {
                component: <SectionSelection recipeId={recipeId} inputs={inputs} assetBounds={assetBounds}/>
            },
            assetBounds ? {
                value: 'ASSET_BOUNDS',
                label: msg('process.mosaic.panel.areaOfInterest.form.assetBounds.title'),
                title: 'ASSET BOUNDS',
                component: <AssetBoundsSection recipeId={recipeId} inputs={inputs} layerIndex={layerIndex}/>
            } : null,
            {
                value: 'COUNTRY',
                label: msg('process.mosaic.panel.areaOfInterest.form.country.title'),
                title: 'COUNTRY/PROVINCE',
                component: <CountrySection recipeId={recipeId} inputs={inputs} layerIndex={layerIndex}/>
            },
            {
                value: 'EE_TABLE',
                label: msg('process.mosaic.panel.areaOfInterest.form.eeTable.title'),
                title: 'EE TABLE',
                component: <EETableSection
                    recipeId={recipeId}
                    inputs={inputs}
                    layerIndex={layerIndex}/>
            },
            {
                value: 'SOURCE',
                label: msg('process.mosaic.panel.areaOfInterest.form.source.title'),
                title: 'ASSET / RECIPE',
                component: <SourceSection recipeId={recipeId} inputs={inputs} layerIndex={layerIndex}/>
            },
            {
                value: 'POLYGON',
                label: msg('process.mosaic.panel.areaOfInterest.form.polygon.title'),
                title: 'POLYGON',
                component: <PolygonSection recipeId={recipeId} inputs={inputs} layerIndex={layerIndex}/>
            },
        ].filter(option => option)
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <PanelSections
                    inputs={inputs}
                    sections={sections}
                    selected={inputs.section}
                    icon='globe'
                    label={msg('process.mosaic.panel.areaOfInterest.title')}
                />
            </RecipeFormPanel>
        )
    }
}

export const Aoi = compose(
    _Aoi,
    recipeFormPanel({id: 'aoi', fields, modelToValues, valuesToModel})
)
