import math


def format_number(value, scale='', min_scale='', precision_digits=3, prefix='', suffix='', unit=''):
    def modulo_3(n):
        return ((n % 3) + 3) % 3

    unit_padding = ' ' if len(unit) else ''

    def formatted_value(normalized_value_, magnitude_, decimals_):
        return '{}{}{}{}{}{}'.format(
            prefix, round(normalized_value_, decimals_), unit_padding, magnitudes[magnitude_], unit, suffix
        )

    magnitudes = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
    # handle case when value is zero
    if value == 0:
        return prefix + '0' + unit_padding + unit + suffix

    # handle unsupported precision
    if precision_digits < 3:
        raise ValueError('Unsupported number of precision digits (less than 3).')

    scale_magnitude = magnitudes.index(scale)
    # handle unsupported scale
    if scale_magnitude == -1:
        raise ValueError('Unsupported scale.')

    value_digits = math.floor(math.log10(value))
    shift_left = precision_digits - value_digits - 1
    shift_right = precision_digits - modulo_3(value_digits) - 1
    normalized_value = round(value * math.pow(10, shift_left)) / math.pow(10, shift_right)
    value_magnitude = math.floor(value_digits / 3)
    magnitude = scale_magnitude + value_magnitude
    min_magnitude = magnitudes.index(min_scale)
    if magnitude > len(magnitudes) - 1:
        raise ValueError('Value too large')
    elif magnitude < min_magnitude:
        return formatted_value(
            normalized_value / math.pow(10, 3 * (min_magnitude - magnitude)),
            min_magnitude,
            precision_digits - 1
        )
    elif normalized_value < 1000:
        return formatted_value(normalized_value, magnitude, shift_right)
    else:
        return formatted_value(normalized_value / 1000, magnitude + 1, precision_digits - 1)


def format_bytes(size):
    return format_number(size, unit='B')
