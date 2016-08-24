/**
 * @author Mino Togna
 */

(function ( $ ) {
    
    var slide = function ( element, slideDir, options ) {
        var options = $.extend( {}, { delay: 0, duration: 500 }, options )
        
        element.velocity( slideDir, options )
        
        return element
    }
    
    $.fn.velocitySlideUp = function ( options ) {
        return slide( this, "slideUp", options )
    }
    
    $.fn.velocitySlideDown = function ( options ) {
        return slide( this, "slideDown", options )
    }
    
    $.fn.velocitySlideToggle = function ( options ) {
        return this.each( function ( i, el ) {
            
            var elem     = $( this )
            var isOpen   = elem.is( ':visible' )
            var slideDir = isOpen ? 'slideUp' : 'slideDown'
            
            slide( elem, slideDir, options )
        } )
    }
    
}( jQuery ))