/**
 * @author Mino Togna
 */
require( './scene-images-selection.css' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var template = require( './scene-images-selection.html' )
var html     = $( template( {} ) )

var section                = null
// section for selecting images
var selectionSection       = null
var imagesSelectionSection = null
var imageSelectionSection  = null
// section of selected images
var selectedSection        = null

var show = function ( e, type ) {

    if ( type == 'scene-images-selection' ) {
        var appSection = $( '#app-section' ).find( '.scene-images-selection' )
        if ( appSection.children().length <= 0 ) {
            appSection.append( html )

            section                = appSection.find( '#scene-images-selection' )
            selectionSection       = section.find( '.selection-section' )
            imagesSelectionSection = selectionSection.find( '.images-section' )
            imageSelectionSection  = appSection.find( '.image-section' )
            //
            selectedSection        = section.find( '.selected-section' )

            // section.click( function ( e ) {
            //     imagesSelectionSection.find( '.image-section-4' )
            //         .velocity( "scroll", { duration: 800, easing: "easeInSine" , container: imagesSelectionSection} )
            // } )
        }
    }

}

var update = function ( e, sceneImages ) {
    // console.log( sceneImages )

    resetSelection()
    $.each( sceneImages, function ( i, sceneImage ) {
        var imgSection = getImageSectionForSelection( sceneImage )
        imgSection.addClass( 'image-section-' + i )
        imagesSelectionSection.append( imgSection )
        setTimeout( function () {
            imgSection.fadeIn()
        }, (i + 1) * 150 )
    } )

}

var resetSelection = function () {

    imagesSelectionSection.empty()
}

var getImageSectionForSelection = function ( sceneImage ) {
    console.log( sceneImage )
    var imgSection = imageSelectionSection.clone()

    var img = $( '<img />' )
    img.attr( 'src', sceneImage.browseUrl )

    imgSection.find( '.image' ).append( img )

    return imgSection
}

EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, update )
EventBus.addEventListener( Events.SECTION.SHOW, show )