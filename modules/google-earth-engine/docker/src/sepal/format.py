def format_bytes(number_of_bytes):
    step = 1024.

    amount = float(number_of_bytes) / step
    unit = 'KB'

    if (amount / step) >= 1:
        amount /= step
        unit = 'MB'

    if (amount / step) >= 1:
        amount /= step
        unit = 'GB'

    if (amount / step) >= 1:
        amount /= step
        unit = 'TB'
    amount = int(round(amount))

    return str(amount) + ' ' + unit
