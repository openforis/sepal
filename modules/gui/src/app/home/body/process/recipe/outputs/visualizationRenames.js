// A recipe's own visualizations as they read its bands once renamed, [{from, to}]: each band a visualization reads by a
// name before is read by its name after, every band looked up once, so names can be exchanged.
export const renamedVisualizationBands = (visualizations, renames) => renames.length
    ? visualizations.map(visualization => ({
        ...visualization,
        bands: visualization.bands.map(band => renames.find(({from}) => from === band)?.to ?? band)
    }))
    : visualizations
