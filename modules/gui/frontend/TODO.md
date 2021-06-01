√ map area menu width
√ slow map scale
√ map scale copy bounds EE format (Rectangle, Point) lng/lat

combo flashing
safari map overlay




mobile
	visParams color tooltip not triggering
	layers panel - drag and drop in iOS

aoi selection
	polygon drawing

map area menu
√	rename mapControl to mapAreaMenu
√	open with clickq

	close a tooltip
		menu stays open when opening visParams panel
		close with escape


combo
√	order of match shouldn't matter
    in the visParams panel the error overlay flashes when selecting a band.

tile loading priorities
	it seems like one map area loads at a time

google geo search



√ Slider initial behavior drag
√ Map area menu button disappearing in grid mode
√ Google attribution - static map sync?
√ Scene area markers dragging slightly off

Combo progress bar in the wrong position

add another recipe image layer source
	wrong description

aoi selection
	polygon drawing

tile loading priorities
	it seems like one map area loads at a time

combo
	order of match shouldn't matter
		'k u' should match 'United Kingdom'

map area menu
	rename mapControl to mapAreaMenu
		that's what we're calling it
	close with escape
	menu stays open when opening visParams panel

Grid - map area buttons not showing up properly
	z-index

image layer progress
	thin bar at the bottom of the map area
	initializing
		bouncing bar
		waiting for scene areas

layers panel
	removal of last (center) area
		crash
	use message keys
	add drag'n'drop inline help

remove hard-coded initializeLayers() inside optical mosaic

migrate all recipe types

reference data collection

classification input images as input layers

map area menu
	hover vs click

google geo search






Overlay with semi-transparent black, to make the Google logo a bit less in the face (Luca)
	compare with sepal.io
	should apply that to all maps
	including the static map and AOI thummbnail map

aoi selection (Luca)
	polygon drawing

hide image layer when opening panels?

layers panel
	add recipe source title
		can pick it from the recipe list
		would be good to have it dynamic, so it changes when renamed
	remove additional sources breaks (fixed?)
	use message keys

store/restore/reuse image layer config

tile loading priorities
	it seems like one map area loads at a time
	verify

image layer progress
	thin bar at the bottom of the map area
	initializing - bouncing bar

mouse location with cross hair on other maps in grid-mode

map area menu styling (Luca)
	source selection, form, feature layers
	make button more visible
	use message keys for type

scene area markers layer

migrate all recipe types

reference data collection

additional image layer sources
	planet with different API key

asset map
	band selection guess
	additional image layer source

advanced band selection/stretching

classification input images as input layers

google geo search

zoom to layer (inside the map area menu)



BUGS

- !zoom area bug

- renaming a process tab reloads preview
- cancelling AOI panel reloads preview
- when opening AOI panel scene area markers should be hidden

TODO

reimplement splitcontent lifecycle

aoi selection
√	disable all operations for the thumbnail map
	polygon drawing

bar with semi-transparent black covering the Google logo
	compare with sepal.io should apply that to all maps including the static map and AOI thummbnail map

map area menu styling
	opticalMosaicMap.js, planetMap.js, mapControls.js
	make menu button more visible
	use message keys for source type

√ mouse location with cross hair on other maps in grid-mode

I'm having some trouble with the split content after updating the map layout.
* The map area menus disappear - managed to fix that with z-index on .area.full and .area.partial.

* The dragging of the split stops working. Not sure how to sort that out.
Maybe you can have a look? I didn't commit the z-index fix, since I don't understand the code completely. I figured I'll wait for you
The good part is that once I could access the map area menus, they work properly
The layers panel do close when updating the map layout, so there's something else going on too...
I found, but didn't fix, the closing problem. When we add (or remove?) areas, map.js is not initialized anymore. All layer areas doesn't have corresponding maps, for a while. That causes our rendering of the map children (the recipe), to be skipped, and the recipe is unmounted, and all panels are closed.


- cleanup 
- implement detailed Google analytics
- implement overlay aoi map
- implement polygon drawing
- improve split handles
- aoi geo lookup
- cleanup ? <
- cleanup mapAreaLayer

NOTES


recipe.layers.overlay


Layers panel
------------
The one Luca already started on
Sources - same as in the layers menu, without the feature layers (no labels, aoi, scene areas, training data points)
Naming - the actual layer on a map vs source
	Layer and Image source? Do we need to worry?
	Maybe we call sources maps?

Later:
	Add additional sources (and remove)
		from asset, recipe, other tile services like Bing etc


Map rendering
-------------
Rendering layout
	grid or "swipe" (we need a name for that)
Layer selection
	same as the sources in layers panel
		only one at a time per map
	overlays
		labels, aoi, scene areas, training data points
Layer configuration
	band selection for imagery from our recipe
	date for planet
Feedback on what is being rendered
	which map
	which configuration
		differs based on type of layer
Show where the mouse is on the other maps (if grid)


Interaction with the rest of the recipe
---------------------------------------
AOI
	hide/show
	draw polygon
Hide/show recipe preview
Training data collection
Scene areas
Chart a pixel

-----
More flexible band selection
	custom band combos/stretching/palettes
	histogram stretching
	needed to render custom assets
	storing presets
		at least remenbering recent ones
		maybe name them and persist them
		display stored presets, filter by available bands
	classification input imagery bands really could use this









    TODO

Mar 10 13:49:28 ip-172-31-40-65.us-west-2.compute.internal email[4067]: [2021-03-10T13:49:28.682] [DEBUG] cache - Getting email notifications preference for address <daniel.wiell@fao.org>
Mar 10 13:49:28 ip-172-31-40-65.us-west-2.compute.internal email[4067]: [2021-03-10T13:49:28.683] [DEBUG] cache - Getting email notifications preference for address <luca.paolini@fao.org>
Mar 10 13:49:28 ip-172-31-40-65.us-west-2.compute.internal email[4067]: [2021-03-10T13:49:28.698] [DEBUG] emailQueue - Cannot send email to daniel.wiell@fao.org,luca.paolini@fao.org, will retry: [Error: 139859577403200:error:1408F10B:SSL routines:ssl3_get_record:wrong version number:../deps/openssl/openssl/ssl/record/ssl3_record.c:332:
]

{
  library: 'SSL routines',  function: 'ssl3_get_record', reason: 'wrong version number', code: 'ESOCKET',
  command: 'CONN'
}


ImageLayerType
--------------
Examples: Recipe, Asset, Planet, GoogleSatellite
Got a (translated) name


ImageLayerSource
--------------
Got an ImageLayerType
Got configuration
	differs for different ImageLayerTypes
		Recipe contains recipeId
		Asset contains assetId
		Planet maybe contains API key and the name of the account
		GoogleSatellite has no config
Got a (translated) name
	dependent on ImageLayerType and configuration
Creates ImageLayer instances
Persisted as part of recipe


ImageLayer
----------
Produced by ImageLayerSource
The thing being put on a map
	only one ImageLayer per map
Got configuration
	differs for different ImageLayerSources
		OpticalMosaic Recipe could maybe have bandSelection, panSharpening
		Planet could maybe have a date and optical/ir
Operations:
	things related to rendering the map
		including progress
	render description 
		to identify what renders on a map
		would typically include data from ImageLayerSource and ImageLayer configuration
	render config form
		maybe in two ways
			light-weight, inlined as overlay on the Google Map
				e.g. quick band selection, like now
			separate panel
				exposes all config options
Maybe keep configurations of these layers
	so user don't need to reconfigure it from scratch when temporarily removing one from map layout
	ImageLayerType is already persisted in the recipe
	don't want this to become a chore/maintainance burden for the user
		explicitly storing layers and giving them a name could be annoying
	keep stack of removed layers?
		when adding to layout, configure it like the last removed of same type


FeatureLayer
------------
Some are fixed
	Labels
Some are dependent on recipe
	AOI - almost all recipes
	Scene Areas - optical mosaic with certain config
	Training Data - classification
No support to add additional sources like we do for ImageLayers
	for now, at least
	what would the use-case for that be?
	could maybe still use a similar structure like ImageLayers, with FeatureLayerSource?





map.split(areas)
    // map.split(['top', 'bottom-left', 'bottom-right'])
    // map.split()

map.select(area)
    // map.select('top')

map.fitBounds(bounds, padding)
map.getBounds()
map.getZoom()
map.setZoom(zoom)
map.zoomIn()
map.zoomOut()
map.isMaxZoom()
map.isMinZoom()
map.zoomArea()
map.cancelZoomArea()
map.isLayerInitialized()
map.toggleLinked()
map.fromGoogleBounds(bounds)
map.setLayer({id, layer, destroy$, onInitialized, onError})
map.hideLayer(id, hidden)
map.removeLayer(id)
map.fitLayer(id)
map.toggleableLayers()
map.drawPolygon(id, callback)
map.disableDrawingMode()
map.onClick(listener)
map.onOneClick(listener)
map.clearClickListeners()

map.google
map.googleMapsApiKey
map.norwayPlanetApiKey
map.googleMap()
