/**
 * @author Mino Togna
 */

require( './sensor-families.scss' )


var $container = null
var init       = function ( container ) {
    
    $container = $( container )
}

module.exports = {
    init: init
}