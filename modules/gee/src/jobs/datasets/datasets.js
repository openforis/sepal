const {of} = require('rxjs')
const _ = require('lodash')

const {getDatasets: getGeeDatasets} = require('./geeDatasets')
const {getDatasets: getCommunityDatasets} = require('./communityDatasets')

const MAX_RESULTS = 10

const moreResults = datasets =>
    Math.max(0, datasets.length - MAX_RESULTS)

const worker$ = ({text, allowedTypes}) => {
    if (_.isEmpty(text)) {
        return of([])
    }

    const geeDatasets = getGeeDatasets(text, allowedTypes)
    const communityDatasets = getCommunityDatasets(text, allowedTypes)

    const matchingResults = geeDatasets.length + communityDatasets.length

    return of({
        matchingResults,
        gee: {
            matchingResults: geeDatasets.length,
            moreResults: moreResults(geeDatasets),
            datasets: geeDatasets.slice(0, MAX_RESULTS)
        },
        community: {
            matchingResults: communityDatasets.length,
            moreResults: moreResults(communityDatasets),
            datasets: communityDatasets.slice(0, MAX_RESULTS)
        }
    })
}

module.exports = ctx => worker$(ctx.request.query)
