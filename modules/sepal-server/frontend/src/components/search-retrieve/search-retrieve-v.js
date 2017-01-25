/**
 * @author Mino Togna
 */
require( './search-retrieve.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var SectionScenes  = require( './views/section-scenes' )
var SectionMosaic  = require( './views/section-mosaic' )
var SensorFamilies = require( './views/sensor-families/sensor-families-v' )

var html = null

var init = function () {
    var template = require( './search-retrieve.html' )
    html         = $( template( {} ) )
    var id       = html.attr( 'id' )
    
    var app = $( '.app' )
    if ( app.find( '#' + id ).children().length <= 0 ) {
        
        $( '.app' ).append( html )
        
        SectionScenes.init( html )
        SectionMosaic.init( html )
        // SensorFamilies.init( html.find( '.row-sensor-families' ) )
        
        reset()
    }
}

var show = function () {
    if ( !html.is( ':visible' ) ) {
        html.velocitySlideDown( { delay: 300, duration: 800 } )
    }
}

var hide = function ( opts ) {
    var options = { delay: 100, duration: 800 }
    options     = $.extend( options, opts )
    html.velocitySlideUp( options )
}

var reset = function () {
    disableToggleLayerButtons()
    disableScenesSelectionRequiredButtons()
    
    SectionScenes.reset()
    SectionMosaic.reset()
}

var collapse = function () {
    var defaultSlideOpts = { delay: 50, duration: 500 }
    SectionScenes.collapse( defaultSlideOpts )
    SectionMosaic.collapse( defaultSlideOpts )
}

var enableToggleLayerButtons = function () {
    html.find( '.btn-toggle-layer-visibility' ).addClass( 'active' ).enable()
}

var disableToggleLayerButtons = function () {
    html.find( '.btn-toggle-layer-visibility' ).removeClass( 'active' ).disable()
}

var enableScenesSelectionRequiredButtons = function () {
    html.find( '.btn-scenes-required' ).enable()
}

var disableScenesSelectionRequiredButtons = function () {
    html.find( '.btn-scenes-required' ).disable()
}

module.exports = {
    init                                   : init
    , show                                 : show
    , hide                                 : hide
    , reset                                : reset
    , collapse                             : collapse
    , enableToggleLayerButtons             : enableToggleLayerButtons
    , disableToggleLayerButtons            : disableToggleLayerButtons
    , enableScenesSelectionRequiredButtons : enableScenesSelectionRequiredButtons
    , disableScenesSelectionRequiredButtons: disableScenesSelectionRequiredButtons
    
    , setSortWeight          : SectionScenes.setSortWeight
    , setOffsetToTargetDay   : SectionScenes.setOffsetToTargetDay
    , setSelectedSensors     : SectionScenes.setSelectedSensors
    , setSelectedScenesNumber: SectionScenes.setSelectedScenesNumber
}