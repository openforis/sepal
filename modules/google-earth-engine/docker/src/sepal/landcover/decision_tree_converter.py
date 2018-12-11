def convert(decision_tree):
    result = {}

    def convert_key(tree, key):
        current_key = 'key' + str(key)
        value = {
            'band': tree['primitive'],
            'threshold': tree['threshold']
        }
        true_value = tree.get('true')
        if type(true_value) is dict:
            key = key + 1
            value['left'] = convert_key(true_value, key)
        else:
            value['left'] = 'terminal'
            value['leftName'] = 'other' if true_value is None else true_value

        false_value = tree.get('false')
        if type(false_value) is dict:
            key = key + 1
            value['right'] = convert_key(false_value, key)
        else:
            value['right'] = 'terminal'
            value['rightName'] = 'other' if false_value is None else false_value

        result[current_key] = value
        return current_key

    convert_key(decision_tree, 1)
    return result
