/**
 * @author Mino Togna
 */


var setUserDetails = function ( userDetails ) {
    $.extend( this, userDetails )
    
    console.log( this )
}

module.exports = {
    setUserDetails: setUserDetails
}