export const isWithinBounds = ({lat, lng}, bounds) => {
    if (!bounds?.[0] || !bounds?.[1]) {
        return null
    }
    const [[west, south], [east, north]] = bounds
    const withinLongitude = west <= east
        ? lng >= west && lng <= east
        : lng >= west || lng <= east
    return lat >= south && lat <= north && withinLongitude
}

export const rankCoordinateCandidates = ({candidates, bounds}) => {
    const ranked = candidates.map(candidate => ({
        candidate,
        withinBounds: isWithinBounds(candidate, bounds)
    }))
    const withinBounds = ranked.filter(candidate => candidate.withinBounds)
    const uniquelyWithinBounds = ranked.length > 1 && withinBounds.length === 1
    return {
        candidates: uniquelyWithinBounds
            ? [withinBounds[0], ...ranked.filter(candidate => !candidate.withinBounds)]
            : ranked,
        autoHighlight: ranked.length === 1 || uniquelyWithinBounds
    }
}
