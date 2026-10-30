// @google/earthengine loads googleapis, at a cost of some 60 MB of heap in every thread, only for
// ee.data.authenticateViaPrivateKey. SEPAL never calls it: Earth Engine gets a token from elsewhere.
exports.google = {
    get auth() {
        throw new Error('googleapis is stubbed out in sepal-ee: authenticate Earth Engine with ee.data.setAuthToken')
    }
}
