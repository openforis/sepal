/**
 * @author Mino Togna
 */

var isAdmin = function () {
    var isAdmin = false
    $.each( this.roles, function ( i, role ) {
        if ( role.toUpperCase() === 'ADMIN' ) {
            isAdmin = true
            return false
        }
    } )
    return isAdmin
}

var setUserDetails = function ( userDetails ) {
    $.extend( this, userDetails )
}

module.exports = {
    setUserDetails: setUserDetails
    , isAdmin     : isAdmin
}