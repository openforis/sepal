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

var getSessionById = function ( sessionId ) {
    var session = null
    $.each( getSessions(), function ( i, s ) {
        if ( s.id === sessionId ) {
            session = s
            return false
        }
    } )
    return session
}

var getSpending = function () {
    return sandboxReport.spending
}

module.exports = {
    setUserSandboxReport: setUserSandboxReport
    , getSessions       : getSessions
    , getSpending       : getSpending
    , getSessionById    : getSessionById
}