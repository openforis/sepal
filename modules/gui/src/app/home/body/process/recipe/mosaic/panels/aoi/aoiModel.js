import {countryEETable} from '~/app/home/map/aoiLayer'

// The 'SOURCE' section combines asset and recipe AOIs behind a sourceType toggle. The persisted model
// keeps the explicit 'ASSET'/'RECIPE' types; 'SOURCE' is a UI-only section.
export const valuesToModel = values => {
    switch (values.section) {
        case 'ASSET_BOUNDS':
            return {
                type: 'ASSET_BOUNDS'
            }
        case 'COUNTRY':
            return {
                type: 'EE_TABLE',
                id: countryEETable,
                keyColumn: 'id',
                key: values.area || values.country,
                level: values.area ? 'AREA' : 'COUNTRY',
                buffer: values.buffer
            }
        case 'EE_TABLE':
            return {
                type: 'EE_TABLE',
                id: values.eeTable,
                keyColumn: values.eeTableRowSelection === 'FILTER' ? values.eeTableColumn : null,
                key: values.eeTableRowSelection === 'FILTER' ? values.eeTableRow : null,
                bounds: values.bounds,
                buffer: values.buffer
            }
        case 'POLYGON':
            return {
                type: 'POLYGON',
                path: values.polygon
            }
        case 'SOURCE':
            switch (values.sourceType) {
                case 'ASSET':
                    return {type: 'ASSET', id: values.assetId}
                case 'RECIPE':
                    return {type: 'RECIPE', id: values.recipeId}
                default:
                    throw Error(`Invalid aoi source type: ${values.sourceType}`)
            }
        default:
            throw Error(`Invalid aoi section: ${values.section}`)
    }
}

export const modelToValues = (model = {}) => {
    if (model.type === 'ASSET_BOUNDS') {
        return {section: 'ASSET_BOUNDS'}
    } else if (model.type === 'EE_TABLE') {
        if (model.id === countryEETable) {
            return {
                section: 'COUNTRY',
                [model.level ? model.level.toLowerCase() : 'country']: model.key,
                buffer: model.buffer
            }
        } else {
            return {
                section: 'EE_TABLE',
                eeTable: model.id,
                eeTableColumn: model.keyColumn,
                eeTableRow: model.key,
                eeTableRowSelection: model.keyColumn ? 'FILTER' : 'INCLUDE_ALL',
                buffer: model.buffer
            }
        }
    } else if (model.type === 'POLYGON') {
        return {
            section: 'POLYGON',
            polygon: model.path
        }
    } else if (model.type === 'ASSET') {
        return {
            section: 'SOURCE',
            sourceType: 'ASSET',
            assetId: model.id
        }
    } else if (model.type === 'RECIPE') {
        return {
            section: 'SOURCE',
            sourceType: 'RECIPE',
            recipeId: model.id
        }
    } else {
        return {}
    }
}
