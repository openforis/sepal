/**
 * @author Mino Togna
 */

(function ( $ ) {
    
    $.fn.enable = function () {
        return this.each( function () {
            var elem = $( this )
            return elem.prop( 'disabled', false )
        } )
    }
    
    $.fn.disable = function () {
        return this.each( function () {
            var elem = $( this )
            return elem.prop( 'disabled', true )
        } )
    }
    
    
}( jQuery ))