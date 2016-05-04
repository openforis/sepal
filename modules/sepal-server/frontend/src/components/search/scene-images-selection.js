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
// var btnPrev                = null
// var btnNext                = null
// var imagesSelectionIndex   = 0
// var imagesSelectionSize    = 0
var imagesSelectionSection = null
var imageSelectionSection  = null
var expandedImageSection   = null
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
            // btnPrev                = selectionSection.find( '.btn-prev' )
            // btnNext                = selectionSection.find( '.btn-next' )
            imageSelectionSection  = appSection.find( '.image-section' )
            expandedImageSection   = appSection.find( '.expanded-image-section' )
            //
            selectedSection = section.find( '.selected-section' )
            //

            // section.click( function ( e ) {
            //     imagesSelectionSection.find( '.image-section-4' )
            //         .velocity( "scroll", { duration: 800, easing: "easeInSine" , container: imagesSelectionSection} )
            // } )

            // bind events
            // btnNext.click( selectionNext )
            // btnPrev.click( selectionPrev )
        }
    }

}

// Functions for selecting the images

// var selectionPrev       = function () {
//     imagesSelectionIndex -= 4
//     navigateToSelection()
// }
// var selectionNext       = function () {
//     imagesSelectionIndex += 4
//     navigateToSelection()
// }
// var navigateToSelection = function () {
//
//     imagesSelectionSection.find( '.image-section-' + imagesSelectionIndex )
//         .velocity( "scroll", {
//             duration: 600
//             , delay: 100
//             , easing: "easeInSine"
//             , container: imagesSelectionSection
//             // , complete: updateNavigationBtns
//         } )
//
//     setTimeout( function () {
//         updateNavigationBtns()
//     }, 350 )
//
// }
//
// var updateNavigationBtns = function () {
//     if ( imagesSelectionIndex == 0 ) {
//         btnPrev.fadeOut( 100 )
//     } else {
//         btnPrev.fadeIn( 100 )
//     }
//
//     if ( imagesSelectionIndex + 4 > imagesSelectionSize ) {
//         btnNext.fadeOut( 100 )
//     } else {
//         btnNext.fadeIn( 100 )
//     }
// }

// var resetSelection = function ( size ) {
var resetSelection = function () {
    // imagesSelectionIndex = 0
    // imagesSelectionSize  = size
    imagesSelectionSection.empty()
    // btnPrev.hide()
    // btnNext.hide()
    
    expandedImageSection.velocity( 'slideUp', { delay: 0, duration: 0 } )

}

var update = function ( e, sceneImages ) {
    // resetSelection( sceneImages.length )
    resetSelection()

    $.each( sceneImages, function ( i, sceneImage ) {
        var imgSection = getImageSectionForSelection( sceneImage )
        imgSection.addClass( 'image-section-' + i )
        imagesSelectionSection.append( imgSection )
        imgSection.show()
    } )

    // navigateToSelection()
    // updateNavigationBtns()

}


var getImageSectionForSelection = function ( sceneImage ) {
    // console.log( sceneImage )
    var imgSection = imageSelectionSection.clone()

    var img = imgSection.find( 'img' )
    img.attr( 'src', sceneImage.browseUrl )
    img.click( function () {
        expandedImageSection.find( 'img' ).attr( 'src', sceneImage.browseUrl ).click(function (  ) {
            expandedImageSection.velocity("stop").velocity( 'fadeOut', { delay: 20, duration: 500 } )
        })
        expandedImageSection.find( '.cloud-cover' ).empty().append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
        expandedImageSection.find( '.sensor' ).empty().append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + sceneImage.sensor )
        expandedImageSection.velocity("stop").velocity( 'fadeIn', { delay: 20, duration: 500 } )
    } )
    imgSection.find( '.image' ).append( img )
//daysFromTargetDay
    imgSection.find( '.cloud-cover' ).append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
    imgSection.find( '.sensor' ).append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + sceneImage.sensor )

    return imgSection
}

EventBus.addEventListener( Events.SECTION.SCENE_IMAGES_SELECTION.UPDATE, update )
EventBus.addEventListener( Events.SECTION.SHOW, show )