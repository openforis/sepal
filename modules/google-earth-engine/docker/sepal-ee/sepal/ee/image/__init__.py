import ee
import math


def combine(image, bands, expression, name_template):
    """
    Evaluates the expression for all pair-wise combination of provided pairs.

    If a band doesn't exist in the image, it is ignored. If less than two of the provided bands are present in the
    image, an empty image is returned.


    Args:
        image: The ee.Image to combine bands on.

        bands: A Python list of bands to combine. Exis

        expression: A string passed to ee.Image.expression(). It has access to two variables: b1, and b2.

        name_template: A string to use as a template to name the combinations. ${b1} and ${b2} will be replaced with the
            actual band names for each combination.

    Returns:
        An ee.Image with a band for each band combination.

    Example:
        combine(image, ['blue', 'green', 'red'], 'b1 / b2', 'ratio_${b1}_${b2}')

        This returns an ee.Image with the following bands:
            ratio_blue_green, ratio_blue_red, ratio_green_red
    """
    existing_bands = find_existing_bands(image, bands)

    def combine_two(b1, b2):
        name = ee.String(name_template) \
            .replace('\\$\\{b1}', b1.bandNames().get(0)) \
            .replace('\\$\\{b2}', b2.bandNames().get(0))
        return b1.expression(expression, {
            'b1': b1,
            'b2': b2,
            'pi': math.pi
        }).rename(name)

    def combine_bands():
        return list_to_image(
            existing_bands \
            .slice(0, existing_bands.size().divide(existing_bands.size()).multiply(-1))
            .map(lambda band1:
                existing_bands \
                    .slice(existing_bands.indexOf(ee.String(band1)).add(1))
                    .map(lambda band2:
                        combine_two(
                            image.select([ee.String(band1)]),
                            image.select([ee.String(band2)])
                        )
                    )
            ) \
            .flatten()
        )

    return when(
        existing_bands.size().gte(2),
        combine_bands
    )


def evaluate(image, required_bands, expression, name):
    """
    Evaluates the expression if image contains all required bands. If not, an empty image is returned.

    All the required bands will be available within the expression.
    """

    def evaluate_image():
        # This code will only have any effect for images with required bands.
        # It will still be executed no matter what though, so we need to ensure
        # we have all the required bands when we evaluate the expression.
        image_with_all_bands = select_and_add_missing(image, required_bands)
        expression_map = to_dict_of_bands(image_with_all_bands, required_bands)
        return image \
            .expression(expression, expression_map) \
            .rename(name)

    existing_bands = find_existing_bands(image, required_bands)
    has_required_bands = existing_bands.length().eq(len(required_bands))
    return ee.Image(when(has_required_bands, evaluate_image))


def list_to_image(image_list):
    return ee.List(image_list).iterate(
        lambda image, acc: ee.Image(acc).addBands(ee.Image(image)),
        ee.Image().select([])
    )


def to_dict_of_bands(image, bands):
    """
    Creates a JavaScript client-side object where the keys are the
    band names, and the values are the corresponding ee.Image band.
    """
    dict_of_bands = {}
    for band in bands:
        dict_of_bands[band] = image.select(band)
    return dict_of_bands


def select_and_add_missing(image, bands):
    """
    Returns an image with the specified list of bands.
    If image doesn't contain any of the requested bands, constant
    images with those names will be added.
    """
    return ee.Image([ee.Image().rename(band) for band in bands]) \
        .addBands(image, None, True).select(bands)


def find_existing_bands(image, bands):
    """
    Selects the bands that image actually has of the provided list of bands.
    """
    return image.bandNames().filter(ee.Filter(
        ee.Filter.inList('item', bands)
    ))


def when(condition, true_callback):
    """
    Returns an image with result of callback when condition is true, otherwise an image without bands.
    """
    # Single element array if true, otherwise empty
    true_list = ee.List.sequence(
        0,
        condition.Not().Not().subtract(1)  # -1 if false, 0 if true
    )
    return true_list.iterate(lambda ignore1, ignore2: true_callback(), ee.Image().select([]))
