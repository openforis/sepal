/**
 * @author Mino Togna
 */
require( './search.scss' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

// html
var html = null

// ui components
var section               = null
// var ContainerModeSelector = null
var ContainerEdit         = require( './views/container-edit' )
var ContainerList         = require( './views/container-list' )

var init = function () {
    var template = require( './search.html' )
    html         = $( template( {} ) )
    
    var appSection = $( '#app-section' ).find( '.search' )
    if ( appSection.children().length <= 0 ) {
        appSection.append( html )
        
        section = appSection.find( '#search' )
        
        // ContainerModeSelector = section.find( '.mode-selection-container' )
        ContainerEdit.init( section.find( '.mode-edit-container' ).show() )
        ContainerList.init( section.find( '.mode-list-container' ).hide() )
        
        // var btns = ContainerModeSelector.find( 'button' )
        // btns.click( function ( e ) {
        //     e.preventDefault()
        //     var btn = $( this )
        //     if ( !btn.hasClass( "active" ) ) {
        //         var target = btn.data( 'target' )
        //
        //         hideSection( section.find( '.mode-container' ).not( '.' + target ) )
        //
        //         btns.removeClass( 'active' )
        //         btn.addClass( 'active' )
        //
        //         showSection( section.find( '.' + target ) )
        //     }
        // } )
        
    }
    ContainerList.show()
    ContainerEdit.hide()
}

var showSection = function ( section, opts ) {
    section.velocityFadeIn( opts )
}

var hideSection = function ( section, opts ) {
    section.velocityFadeOut( opts )
}

module.exports = {
    init            : init
    , setEditState  : ContainerEdit.setState
    // deprecated
    // , setSensorGroup: ContainerEdit.setSensorGroup
}