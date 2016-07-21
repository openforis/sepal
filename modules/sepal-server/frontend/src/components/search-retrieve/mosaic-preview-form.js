/**
 * @author Mino Togna
 */
var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

require( 'devbridge-autocomplete' )

var template = require( './mosaic-preview-form.html' )
var html     = $( template( {} ) )

var formNotify = null
var btnSubmit  = null

var bands         = require( './bands.js' )
var selectedBands = null
var init          = function ( container ) {
    
    container.append( html )
    
    formNotify = html.find( '.form-notify' )
    btnSubmit  = html.find( '.btn-submit' )
    
    var bandsInput = html.find( 'input[name=bands]' )
    bandsInput.autocomplete( {
        lookup                     : bands
        , minChars                 : 0
        , autoSelectFirst          : true
        , triggerSelectOnValidInput: false
        , tabDisabled              : true
        , onSelect                 : function ( selection ) {
            if ( selection ) {
                selectedBands = selection.data
                // var cName = selection.value
            }
        }, onInvalidateSelection   : function () {
            selectedBands = null
        }
    } )
    
    
    btnSubmit.click( function ( e ) {
        e.preventDefault()
        formNotify.empty().velocity( 'slideUp', { delay: 0, duration: 100 } )
        
        if ( selectedBands ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_MOSAIC, null, selectedBands )
        } else {
            formNotify.html( 'A valid band must be selected' ).velocity( 'slideDown', { delay: 20, duration: 400 } )
        }
    } )
}

module.exports = {
    init: init
}