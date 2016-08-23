/**
 * @author Mino Togna
 */

(function ( $ ) {
    
    var slideOptions = { delay: 0, duration: 500 }
    
    var slide = function ( element, slideDir, options ) {
        options = $.extend( slideOptions, options )
        
        element.velocity( slideDir, slideOptions )
        
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