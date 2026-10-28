// The OPTICAL_COLLECTION_DEFAULTS capability: which recipe or asset states the optical collection
// configuration a consumer can copy defaults from - the data sets, cloud threshold, compositing options and
// the window they cover.
//
// It says what can be DERIVED, never what can be executed. A source declaring none is configured by hand.

export const OPTICAL_COLLECTION_DEFAULTS = {
    name: 'OPTICAL_COLLECTION_DEFAULTS',
    // Where the configuration lives when it lives in an asset's export properties, and null when the
    // recipe's own model states it.
    declaration: 'opticalCollectionDefaults'
}
