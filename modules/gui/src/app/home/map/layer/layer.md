Hierarchy

    Layer
        OverlayMapTypeLayer
            * GoogleLabelsLayer
            TileLayer
                EarthEngineLayer
                    * EarthEngineTableLayer
                    * EarthEngineImageLayer
                * GoogleSatelliteLayer
                WMTSLayer
                    * PlanetLayer

Concrete implementations

    * EarthEngineImageLayer
    * EarthEngineTableLayer
    * GoogleLabelsLayer
    * GoogleSatelliteLayer
    * PlanetLayer

OverlayMapTypeLayer owns every write to googleMap.overlayMapTypes: mounting an overlay at its index,
moving a mounted overlay (swapping with whatever it displaces) and detaching one by identity rather than
by a recorded index. Disposal stays with the subclass - TileLayer closes its overlay's tile provider,
GoogleLabelsLayer has nothing to close.
