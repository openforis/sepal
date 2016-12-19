/**
 * @author Mino Togna
 */

var User = function ( userDetails ) {
    $.extend( this, userDetails )
    this.sandboxReport = null
}

User.prototype.isAdmin = function () {
    var isAdmin = false
    $.each( this.roles, function ( i, role ) {
        if ( role.toUpperCase() === 'APPLICATION_ADMIN' ) {
            isAdmin = true
            return false
        }
    } )
    return isAdmin
}

User.prototype.isActive = function () {
    if ( this.status && this.status.toUpperCase() === 'ACTIVE' ) {
        return true
    }
    return false
}

User.prototype.setUserSandboxReport = function ( data ) {
    this.sandboxReport = data
}

User.prototype.getSessions = function () {
    return this.sandboxReport.sessions
}

User.prototype.getSessionById = function ( sessionId ) {
    var session = null
    $.each( this.getSessions(), function ( i, s ) {
        if ( s.id === sessionId ) {
            session = s
            return false
        }
    } )
    return session
}

User.prototype.getSpending = function () {
    return this.sandboxReport.spending
}


module.exports = function ( userDetails ) {
    return new User( userDetails )
}