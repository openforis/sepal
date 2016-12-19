/**
 * @author Mino Togna
 */

(function ( $ ) {
    
    var fade = function ( element, fadeDir, options ) {
        var options = $.extend( {}, { delay: 0, duration: 500 }, options )
        
        element.velocity( fadeDir, options )
        
        return element
    }
    
    $.fn.velocityFadeIn = function ( options ) {
        return fade( this, "fadeIn", options )
    }
    
    $.fn.velocityFadeOut = function ( options ) {
        return fade( this, "fadeOut", options )
    }
    
    $.fn.velocityFadeToggle = function ( options ) {
        return this.each( function ( i, el ) {
            
            var elem     = $( this )
            var isOpen   = elem.is( ':visible' )
            var fadeDir = isOpen ? 'fadeOut' : 'fadeIn'
            
            fade( elem, fadeDir, options )
        } )
    }
    
}( jQuery ))