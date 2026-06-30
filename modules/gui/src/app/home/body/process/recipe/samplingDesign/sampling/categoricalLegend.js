// A valid categorical target class is numeric (class value 0 is valid); rejects blank/non-numeric text
// from the numeric-input fallback and any malformed persisted value. The backend uses Number(value).
export const isNumericClassValue = value =>
    value != null && String(value).trim() !== '' && Number.isFinite(Number(value))

// Categorical class options ({value, label}) for a band, extracted from a recipe/asset's visualizations.
// Returns [] when the band has no categorical visualization, so the caller can fall back to a numeric
// class input. Pure - no GUI/EE deps.
export const categoricalLegendEntries = (visualizations, band) => {
    if (!visualizations || !band) {
        return []
    }
    const visualization = visualizations.find(({type, bands}) => type === 'categorical' && bands?.[0] === band)
    if (!visualization) {
        return []
    }
    return (visualization.values || []).map((value, i) => {
        const label = visualization.labels?.[i]
        return {value, label: label != null && label !== '' ? `${value} - ${label}` : String(value)}
    })
}
