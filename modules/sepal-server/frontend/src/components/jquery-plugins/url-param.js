/**
 * @author Mino Togna
 */

(function ( $ ) {
    
    $.urlParam = function ( paramName ) {
        var pageURL      = decodeURIComponent( window.location.search.substring( 1 ) )
        var urlVariables = pageURL.split( '&' )
        
        for ( var i = 0; i < urlVariables.length; i++ ) {
            var nameValuePair = urlVariables[ i ].split( '=' )
            var name          = nameValuePair[ 0 ]
            var value         = nameValuePair[ 1 ]
            if ( name === paramName ) {
                return value === undefined ? true : value
            }
        }
    }
    
    
}( jQuery ))