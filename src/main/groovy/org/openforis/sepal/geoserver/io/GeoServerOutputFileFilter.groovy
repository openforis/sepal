package org.openforis.sepal.geoserver.io

class GeoServerOutputFileFilter implements FileFilter {
    Boolean reverseMode

    public GeoServerOutputFileFilter() {
        this(false)
    }

    public GeoServerOutputFileFilter(Boolean reverseMode) {
        this.reverseMode = reverseMode
    }

    private final String[] INPUT_EXTENSIONS = ["tif"] as String[]

    public boolean accept(File pathname) {
        Boolean allowed = Boolean.FALSE
        for (String inputExtension : INPUT_EXTENSIONS) {
            if (pathname.getName().toLowerCase().endsWith(inputExtension)) {
                allowed = Boolean.TRUE
                break
            }
        }
        return reverseMode ? (!allowed) : allowed
    }

}

