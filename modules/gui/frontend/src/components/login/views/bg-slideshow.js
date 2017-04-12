/**
 * @author Mino Togna
 */
require( '../../kenburnsy/kenburnsy' )
require( '../../kenburnsy/kenburnsy.css' )

var bg01 = require( './img/bg-01.jpg' )
var bg02 = require( './img/bg-02.jpg' )

var show = function () {
    var bgImg = $( '.site-bg-img' )
    
    var img = $( '<img src="' + bg01 + '"/>' )
    bgImg.append( img )
    
    img = $( '<img src="' + bg02 + '"/>' )
    bgImg.append( img )
    
    bgImg.kenburnsy( {
        fullscreen    : true,
        duration      : 5000,
        fadeInDuration: 1500
    } )
}

var hide = function () {
    
}

module.exports = {
    show  : show
    , hide: hide
}