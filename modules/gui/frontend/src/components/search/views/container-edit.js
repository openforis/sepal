/**
 * @author Mino Togna
 */
var EventBus = require( './../../event/event-bus' )
var Events   = require( './../../event/events' )
var Form     = require( './search-form' )

var menu = null

var sectionSearchForm      = null
var sectionClassify        = null
var sectionChangeDetection = null
var state                  = {}

var init = function ( container ) {
    
    menu                   = container.find( '.menu-container' )
    sectionSearchForm      = container.find( '.section-search-form' )
    sectionClassify        = container.find( '.section-classify' )
    sectionChangeDetection = container.find( '.section-change-detection' )
    
    Form.init( sectionSearchForm.find( 'form' ) )
    
    var initOpts = { delay: 0, duration: 0 }
    showSection( sectionSearchForm, initOpts )
    hideSection( sectionClassify, initOpts )
    hideSection( sectionChangeDetection, initOpts )
    
    var btns = menu.find( 'button' )
    btns.click( function ( e ) {
        e.preventDefault()
        var btn = $( this )
        if ( !btn.hasClass( "active" ) ) {
            hideSection( sectionSearchForm )
            hideSection( sectionClassify )
            hideSection( sectionChangeDetection )
            
            btns.removeClass( 'active' )
            btn.addClass( 'active' )
            
            var target = btn.data( 'target' )
            showSection( container.find( '.' + target ) )
        }
    } )
}

var showSection = function ( section, opts ) {
    section.velocityFadeIn( opts )
}

var hideSection = function ( section, opts ) {
    section.velocityFadeOut( opts )
}

var setState = function ( e, s ) {
    state = s
}

EventBus.addEventListener( Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState )

module.exports = {
    init: init
    //deprecated
    // , setSensorGroup: Form.setSensorGroup
}