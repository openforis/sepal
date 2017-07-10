/**
 * @author Mino Togna
 */
( function ( $ ) {
    
    require( 'devbridge-autocomplete' )
    
    var defaultParams = {
        minChars                   : 0
        , autoSelectFirst          : true
        , triggerSelectOnValidInput: false
        , tabDisabled              : true
    }
    
    
    var createResetButton = function ( elem ) {
        var resetBtn = $( '<button class="btn btn-base autocomplete-reset"><i class="fa fa-times-circle" aria-hidden="true"></i></button>' )
        
        resetBtn.click( function ( e ) {
            e.preventDefault()
            e.stopImmediatePropagation()
            
            elem.val( null )
            
            elem.data('autocomplete').options.onSelect(null)
            elem.trigger( 'focus', $.Event( "focus" ) )
        } )
        elem.after( resetBtn )
        
        resetBtn.disable()
        
        return resetBtn
    }
    
    $.fn.sepalAutocomplete = function ( opts ) {
        return this.each( function ( i, el ) {
            var elem = $( this )
            
            if ( opts === 'reset' ) {
                
                var resetBtn = elem.data( 'reset-btn' )
                elem.val( '' )
                resetBtn.disable()
                
            } else {
                
                var resetBtn = createResetButton( elem )
                elem.data( 'reset-btn', resetBtn )
                var onChange = function ( selection ) {
                    var val = elem.val()
                    
                    if ( $.isEmptyString( val ) ) {
                        resetBtn.disable()
                    } else {
                        resetBtn.enable()
                    }
                    
                    if ( opts.onChange ) {
                        // console.debug( 'changed value ' + JSON.stringify( selection ) )
                        opts.onChange( selection )
                    }
                    
                }
                
                var options                   = $.extend( {}, defaultParams, opts )
                options.onSelect              = onChange
                options.onInvalidateSelection = onChange
                
                elem.autocomplete( options )
            }
            
        } )
    }
    
}( jQuery ) )