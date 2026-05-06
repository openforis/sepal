// Cross-field validators for classChange.

const checkLegendValuesUnique = (entries, path) => {
    const seen = new Map()
    for (let i = 0; i < entries.length; i++) {
        const value = entries[i]?.value
        if (value === undefined) continue
        if (seen.has(value)) {
            return [{
                path: `${path}/${i}/value`,
                message: `duplicate class value ${value} (already used at entry ${seen.get(value)})`
            }]
        }
        seen.set(value, i)
    }
    return []
}

const rules = [
    {
        name: 'fromImageLegendValuesUnique',
        description: 'fromImage.legendEntries[*].value must be unique — the transition encoding indexes into the sorted unique value list and would collide on duplicates.',
        validate: model => checkLegendValuesUnique(
            model?.fromImage?.legendEntries || [],
            '/fromImage/legendEntries'
        )
    },
    {
        name: 'toImageLegendValuesUnique',
        description: 'toImage.legendEntries[*].value must be unique — same reason as fromImage.',
        validate: model => checkLegendValuesUnique(
            model?.toImage?.legendEntries || [],
            '/toImage/legendEntries'
        )
    },
    {
        name: 'legendValuesUnique',
        description: 'legend.entries[*].value must be unique when present.',
        validate: model => checkLegendValuesUnique(
            model?.legend?.entries || [],
            '/legend/entries'
        )
    },
    {
        name: 'fromAndToBandConsistent',
        description: 'fromImage.band and toImage.band normally reference the same band name (typically `class`) — different bands almost always indicate a configuration error since a transition between two different categorical schemes is rarely meaningful.',
        validate: model => {
            const from = model?.fromImage?.band
            const to = model?.toImage?.band
            if (!from || !to || from === to) return []
            return [{
                path: '/toImage/band',
                message: `fromImage.band='${from}' and toImage.band='${to}' should normally be the same. If this is intentional, ignore.`
            }]
        }
    }
]

module.exports = {rules}
