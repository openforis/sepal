/**
 * @author Mino Togna
 */


var setUserDetails = function ( userDetails ) {
    $.extend( this, userDetails )
}

module.exports = {
    setUserDetails: setUserDetails
}