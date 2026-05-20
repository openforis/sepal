const {of} = require('rxjs')
const {aFakeGuiRequests} = require('../../harness')

function metadataFor(metadata) {
    return aFakeGuiRequests(() => of(metadata))
}

const mosaicMetadata = {id: 'r1', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'}
const unspeccedMetadata = {id: 'r-other', type: 'NOT_IN_REGISTRY', name: 'Other', projectId: 'p1'}

module.exports = {metadataFor, mosaicMetadata, unspeccedMetadata}
