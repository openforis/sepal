/**
 * @author Mino Togna
 */
var EventBus = require( '../../../event/event-bus' )
var Events   = require( '../../../event/events' )

require( 'devbridge-autocomplete' )

var parentContainer = null
var template        = require( './form-mosaic-preview.html' )
var html            = $( template( {} ) )

var formNotify = null
var btnSubmit  = null

var bands         = require( './bands.js' )
var selectedBands = null

var init = function ( parent ) {
    parentContainer = parent
    var container   = parentContainer.find( '.mosaic-preview' )
    container.append( html )
    
    formNotify = html.find( '.form-notify' )
    btnSubmit  = html.find( '.btn-submit' )
    
    var bandsInput = html.find( 'input[name=bands]' )
    bandsInput.sepalAutocomplete( {
        lookup    : bands
        , onChange: function ( selection ) {
            selectedBands = (selection) ? selection.data : null
        }
    } )
    
    btnSubmit.click( function ( e ) {
        e.preventDefault()
        formNotify.empty().velocitySlideUp( { delay: 0, duration: 100 } )
        
        if ( selectedBands ) {
            EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_MOSAIC, null, selectedBands )
        } else {
            formNotify.html( 'A valid band must be selected' ).velocitySlideDown( { delay: 20, duration: 400 } )
        }
    } )
}

var hide = function ( options ) {
    parentContainer.velocitySlideUp( options )
}

var toggleVisibility = function ( options ) {
    parentContainer.velocitySlideToggle( options )
}

var reset = function () {
    selectedBands = null
    html.find( 'input[name=bands]' ).val( '' )
}

module.exports = {
    init              : init
    , hide            : hide
    , toggleVisibility: toggleVisibility
    , reset           : reset
}