/**
 * Application loader
 *
 * @author Mino Togna
 */
require( '../velocity/velocity' )
require( '../loader/loader.css' )

var Loader = function () {
    this.container = $( '.app-loader' )
    
    this.container.velocity( 'fadeOut', {
        queue   : false,
        delay   : 0,
        duration: 0
    } );
}

Loader.prototype.show = function ( options ) {
    var defaultOptions = {
        queue   : false,
        delay   : 0,
        duration: 500
    }
    defaultOptions     = $.extend( defaultOptions, options )
    
    this.container.velocity( 'fadeIn', defaultOptions );
}

Loader.prototype.hide = function ( options ) {
    
    var defaultOptions = {
        queue   : false,
        delay   : 0,
        duration: 500
    }
    defaultOptions     = $.extend( defaultOptions, options )
    
    this.container.velocity( 'fadeOut', defaultOptions );
    
}

var loaderInstance = new Loader()

module.exports = loaderInstance