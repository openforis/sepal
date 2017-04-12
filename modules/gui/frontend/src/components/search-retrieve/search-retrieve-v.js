/**
 * @author Mino Togna
 */
require( './search-retrieve.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var SectionScenes = require( './views/section-scenes' )
var SectionMosaic = require( './views/section-mosaic' )

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
        
        var btnsToggleSection = html.find( '.btn-toggle-section' )
        btnsToggleSection.click( function () {
            var btn = $( this )
            
            btnsToggleSection.not( btn ).removeClass( 'active' )
            
            btn.toggleClass( 'active' ).addClass('disabling').disable()
            
            setTimeout( function () {
                btn.removeClass('disabling').enable()
            }, 500 )
        } )
        
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
    disableScenesRequiredButtons()
    
    SectionScenes.reset()
    SectionMosaic.reset()
}

var collapse = function () {
    var defaultSlideOpts = { delay: 50, duration: 500 }
    SectionScenes.collapse( defaultSlideOpts )
    SectionMosaic.collapse( defaultSlideOpts )
}

var setSelectedScenesNumber = function ( landsatScenesNo, sentinelScenesNo ) {
    if ( landsatScenesNo > 0 || sentinelScenesNo > 0 ) {
        enableScenesRequiredButtons()
    } else {
        disableScenesRequiredButtons()
    }
    SectionScenes.setSelectedScenesNumber( landsatScenesNo, sentinelScenesNo )
    SectionMosaic.setSelectedScenesNumber( landsatScenesNo, sentinelScenesNo )
}

var enableScenesRequiredButtons = function () {
    html.find( '.btn-scenes-required' ).enable()
}

var disableScenesRequiredButtons = function () {
    html.find( '.btn-scenes-required' ).disable()
}

module.exports = {
    init                     : init
    , show                   : show
    , hide                   : hide
    , reset                  : reset
    , collapse               : collapse
    , setSelectedScenesNumber: setSelectedScenesNumber
    , setSortWeight          : SectionScenes.setSortWeight
    , setOffsetToTargetDay   : SectionScenes.setOffsetToTargetDay
    , setSelectedSensors     : SectionScenes.setSelectedSensors
}