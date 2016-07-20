/**
 * @author Mino Togna
 */

require( './search-retrieve.scss' )

var EventBus             = require( '../event/event-bus' )
var Events               = require( '../event/events' )
var ScenesAutoSelectForm = require( './scenes-autoselection-form-v' )

// html
var template = require( './search-retrieve.html' )
var html     = $( template( {} ) )

var btnRetrieveScenes = null
var btnBestScenes     = null
var btnPreviewMosaic  = null
var btnRetrieveMosaic = null

var formBestScenes = null

var init = function () {
    $( '.app' ).append( html )
    
    // buttons
    btnBestScenes     = html.find( '.btn-best-scenes' )
    btnRetrieveScenes = html.find( '.btn-retrieve-scenes' )
    btnPreviewMosaic  = html.find( '.btn-preview-mosaic' )
    btnRetrieveMosaic = html.find( '.btn-retrieve-mosaic' )
    // best scenes form
    formBestScenes    = html.find( '.row-best-scenes-form' )
    
    ScenesAutoSelectForm.init( html.find( '.scenes-selection-filter' ) )
    
    initEventHandlers()
    reset()
    
}

var initEventHandlers = function () {
    
    btnBestScenes.click( function ( e ) {
        e.preventDefault()
        // show options
        var isOpen   = formBestScenes.is( ':visible' )
        var slideDir = isOpen ? 'slideUp' : 'slideDown'
        formBestScenes.velocity( slideDir, { delay: 50, duration: 500 } )
    } )
    btnRetrieveScenes.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_SCENES )
    } )
    
    btnPreviewMosaic.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.PREVIEW_MOSAIC )
    } )
    btnRetrieveMosaic.click( function ( e ) {
        e.preventDefault()
        EventBus.dispatch( Events.SECTION.SEARCH_RETRIEVE.RETRIEVE_MOSAIC )
    } )
    
}

var show = function () {
    if ( !html.is( ':visible' ) ) {
        html.velocity( 'slideDown', { delay: 200, duration: 1000 } )
    }
}

var hide = function ( opts ) {
    var options = { delay: 200, duration: 1000 }
    options     = $.extend( options, opts )
    html.velocity( 'slideUp', options )
}

var reset = function () {
    btnRetrieveScenes.prop( 'disabled', true )
    btnRetrieveMosaic.prop( 'disabled', true )
    formBestScenes.velocity( 'slideUp', { delay: 0, duration: 0 } )
}

var collapse = function () {
    formBestScenes.velocity( "slideUp", { delay: 50, duration: 500 } )
}

module.exports = {
    init      : init
    , show    : show
    , hide    : hide
    , reset   : reset
    , collapse: collapse
}