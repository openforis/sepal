/**
 * @author Mino Togna
 */
var container = null
var state     = {}

var init = function ( c ) {
    container = $( c )
}


var show = function () {
    if ( !container.is( ":visible" ) ) {
        container.velocityFadeIn()
    }
}

var hide = function () {
    if ( container.is( ":visible" ) ) {
        container.velocityFadeOut()
    }
}

var setActiveState = function ( activeState ) {
    state = activeState
}

module.exports = {
    init            : init
    , show          : show
    , hide          : hide
    , setActiveState: setActiveState
}