/**
 * @author Mino Togna
 */
require( './login.scss' )

var Form        = require( './views/login-form' )
var BgSlideshow = require( './views/bg-slideshow' )
var BgStars     = require( './views/bg-stars' )

var template = require( './login.html' )
var html     = $( template( {} ) )

var show = function () {
    $( "body" ).find( '.app' ).append( html )
    
    Form.show( html.find( 'form' ) )
    
    setTimeout( function () {
        BgSlideshow.show()
        BgStars.show()
    }, 100 )
    
}

var hide = function () {
    html.remove()
}

module.exports = {
    show  : show
    , hide: hide
}
