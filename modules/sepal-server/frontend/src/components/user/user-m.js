/**
 * @author Mino Togna
 */
var sandboxReport        = null
var setUserSandboxReport = function ( data ) {
    sandboxReport = data
}

var getSessions = function () {
    return sandboxReport.sessions
}

var getSpending = function () {
    return sandboxReport.spending
}

module.exports = {
    setUserSandboxReport: setUserSandboxReport
    , getSessions       : getSessions
    , getSpending       : getSpending
}