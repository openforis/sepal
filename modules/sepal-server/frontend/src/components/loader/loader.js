/**
 * Application loader
 *
 * @author Mino Togna
 */

require( '../loader/loader.css' )

var Loader = function () {
    this.container = $( '.app-loader' )

    this.container.velocity( 'fadeOut', {
        queue   : false,
        delay   : 0,
        duration: 0
    } );
}

Loader.prototype.show = function () {
    this.container.velocity( 'fadeIn', {
        queue   : false,
        delay   : 0,
        duration: 500
    } );

}

Loader.prototype.hide = function () {
    this.container.velocity( 'fadeOut', {
        queue   : false,
        delay   : 0,
        duration: 800
    } );

}

var loaderInstance = new Loader()

module.exports = loaderInstance