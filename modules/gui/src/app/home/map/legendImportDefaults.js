import Color from 'color'
import _ from 'lodash'

export const getValidMappings = (columns, rows) => {
    const toInts = column => {
        return rows
            .map(row => {
                const value = row[column]
                try {
                    return _.isInteger(value)
                        ? value
                        : _.isInteger(parseInt(value))
                            ? parseInt(value)
                            : null
                } catch (_error) {
                    return false
                }
            })
            .filter(i => _.isInteger(i))
    }
    const valueColumn = columns.filter(column =>
        _.uniq(toInts(column)).length === rows.length
    )
    const labelColumn = columns.filter(column =>
        _.uniq(rows
            .map(row => _.isNaN(row[column])
                ? null
                : _.isNil(row[column]) ? null : row[column].toString().trim()
            )
            .filter(value => value)
        ).length === rows.length
    )
    const colorColumn = columns.filter(column =>
        _.uniq(rows
            .map(row => {
                try {
                    return Color(row[column].trim()).hex()
                } catch (_error) {
                    return false
                }
            })
            .filter(value => value)
        ).length === rows.length
    )
    const colorChannel = columns.filter(column =>
        toInts(column).length === rows.length
    )
    return ({valueColumn, labelColumn, colorColumn, redColumn: colorChannel, greenColumn: colorChannel, blueColumn: colorChannel})
}

export const getDefaults = validMappings => {
    const mappings = _.cloneDeep(validMappings)
    const selectedColumn = column => {
        if (!column) return
        Object.keys(mappings).forEach(key =>
            mappings[key] = mappings[key].filter(c => c !== column)
        )
    }

    const firstContaining = (columns, strings) =>
        columns.find(column => strings.find(s => column.toLowerCase().includes(s.toLowerCase())))

    const colorColumnType = mappings.colorColumn.length
        ? 'single'
        : (mappings.redColumn.length >= 4 &&
            mappings.greenColumn.length >= 4 &&
            mappings.blueColumn.length >= 4)
            ? 'multiple'
            : null

    const colorColumn = mappings.colorColumn.length
        ? mappings.colorColumn[0]
        : null
    selectedColumn(colorColumn)

    const valueColumn = mappings.valueColumn.length
        ? colorColumnType === 'single'
            ? mappings.valueColumn[0]
            : firstContaining(mappings.valueColumn, ['class', 'value', 'type'])
        : null
    selectedColumn(valueColumn)

    const labelColumn = mappings.labelColumn.length
        ? firstContaining(mappings.labelColumn, ['desc', 'label', 'name'])
        : null
    selectedColumn(labelColumn)

    const redColumn = mappings.redColumn.length
        ? firstContaining(mappings.redColumn, ['red'])
        : null
    selectedColumn(redColumn)

    const greenColumn = mappings.greenColumn.length
        ? firstContaining(mappings.greenColumn, ['green'])
        : null
    selectedColumn(greenColumn)

    const blueColumn = mappings.blueColumn.length
        ? firstContaining(mappings.blueColumn, ['blue'])
        : null
    selectedColumn(blueColumn)

    return _.transform({
        valueColumn,
        labelColumn,
        colorColumnType,
        colorColumn,
        redColumn,
        greenColumn,
        blueColumn
    }, (defaults, value, key) => {
        if (value) {
            defaults[key] = value
        }
        return defaults
    })
}
