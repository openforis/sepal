
Open questions

    - Why EarthEngineLayer.create() factory method?
    - Why SepalMap.removeAllLayers() is not used?
    - TileManager? GoogleMapsLayer?
    - Introduce base class for
        EarthEngineLayer
        GoogleSatelliteLayer
        WMTSLayer
    √ DelegatingTileProvider implementations super calling?
    √ turn TileLayer into class
    - getImageLayerSource is never called with map!
    - EarthEngineLayer.create() static method should probably be named createPreview()

TileLayer
    m add()
    m remove()
    m hide(hidden)

@ RecipeImageLayer
    u EarthEngineLayer
        u TileLayer

@ GoogleSatelliteImageLayer
    u GoogleSatelliteLayer
        u TileLayer

@ PlanetImageLayer
    u WMTSLayer
        u TileLayer

TileProvider (defines abstract close())
    x GoogleSatelliteTileProvider
    x WMTSTileProvider
        x EarthEngineTileProvider (implements close())
        x EarthEngineTableTileProvider
            u EarthEngineLayer
