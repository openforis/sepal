/**
 * @author Mino Togna
 */

(function ( $ ) {
    
    $.isEmptyString = function (str) {
        return !str || 0 === $.trim(str).length
    }
    
    $.isNotEmptyString = function (str) {
        return ! $.isEmptyString(str)
    }
    
    
}( jQuery ))