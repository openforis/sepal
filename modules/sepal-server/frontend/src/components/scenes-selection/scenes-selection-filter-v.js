/**
 * @author Mino Togna
 */
require( './scenes-selection-filter.scss' )

var noUiSlider = require( 'nouislider' )
require( './nouislider.css' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var template      = require( './scenes-selection-filter.html' )
var html          = $( template( {} ) )
//ui elements
var container     = null
var sectionBtns   = null
var sectionAction = null

var init = function ( uiContainer ) {
    container = $( uiContainer )
    
    container.prepend( html )
    sectionBtns   = container.find( '.section-btn' )
    sectionAction = container.find( '.section-options' )
    
    sectionAction.velocity( 'slideUp', { delay: 0, duration: 0 } )
    sectionBtns.find( '.row > div' ).click( function ( e ) {

        sectionAction.find( '> .row' ).hide()
        var target = $( this ).data( 'target' )
        sectionAction.find( '.' + target ).show()

        sectionBtns.velocity( 'slideUp', { delay: 100, duration: 500 } )
        sectionAction.velocity( 'slideDown', { delay: 100, duration: 500 } )
    } )
    
    sectionAction.find( '.btn-close-filter' ).click( function ( e ) {
        sectionBtns.velocity( 'slideDown', { delay: 100, duration: 500 } )
        sectionAction.velocity( 'slideUp', { delay: 100, duration: 500 } )
    } )
    
    var sortSlider = sectionAction.find( '.sort-slider' ).get( 0 )
    noUiSlider.create( sortSlider, {
        start: [ 0.5 ],
        step : 0.05,
        range: {
            'min': [ 0 ],
            'max': [ 1 ]
        }
    } )
    sortSlider.noUiSlider.on( 'change', function () {
        console.log( sortSlider.noUiSlider.get() )
    } )
}


module.exports = {
    init: init
}