/**
 * @author Mino Togna
 */

(function ( $ ) {
    
    $.isEmptyString = function ( str ) {
        return !str || 0 === $.trim( str ).length
    }
    
    $.isNotEmptyString = function ( str ) {
        return !$.isEmptyString( str )
    }
    
    $.containsString        = function ( string, substring ) {
        return string.indexOf( substring ) !== -1
    }
    
    $.capitalize = function ( str ) {
        return str.charAt( 0 ).toUpperCase() + str.slice( 1 )
    }
    
}( jQuery ))