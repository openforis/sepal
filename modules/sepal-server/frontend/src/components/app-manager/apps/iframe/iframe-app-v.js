/**
 * @author Mino Togna
 */
var html   = null
var iframe = null

var show = function ( container, path ) {
    if ( container.find( '.iframe-app' ).length <= 0 ) {
        initHtml( container )
    }
    // path = '/sandbox/demo/rstudio'
    iframe.attr( 'src', path )
    html.show()
}

var initHtml = function ( container ) {
    html = $( '<div class="row sepal-app iframe-app height100">' +
        '<div class="col-sm-12 height100"><iframe width="100%" height="100%"></iframe> ' +
        '</div>' +
        '</div>' )
    
    container.append( html )
    
    iframe = html.find( 'iframe' )
}

module.exports = {
    show: show
}