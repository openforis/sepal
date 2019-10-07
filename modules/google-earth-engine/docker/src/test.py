import difflib
import inspect
from collections import OrderedDict


def raises(callback, exception=Exception):
    try:
        callback()
    except exception:
        return
    except Exception as e:
        raise TestFailed(
            'Expected {} to be raised. Got {}: {} instead'.format(exception.__name__, e.__class__.__name__, e))
    raise TestFailed('Expected {} to be raised. Got no exception'.format(exception))


def expect(value, **kwargs):
    def get_context():
        parent_frame = inspect.currentframe().f_back.f_back
        sourcefile = inspect.getsourcefile(parent_frame.f_code)
        lines, first_lineno = inspect.getsourcelines(parent_frame.f_code)
        lineno = parent_frame.f_lineno
        lineno_offset = lineno - first_lineno
        source = ''.join(lines[lineno_offset - 2:lineno_offset + 1])
        locals = {name: value for name, value in parent_frame.f_locals.items() if name.isidentifier()}
        return {
            'sourcefile': sourcefile,
            'lineno': lineno,
            'source': source,
            'locals': locals
        }

    m = kwargs.get('m')
    if 'eq' in kwargs.keys() and value != kwargs['eq']:
        differ = difflib.Differ()
        diff = '\n'.join(
            differ.compare(str(value).split('\n'), str(kwargs['eq']).split('\n'))
        )
        raise TestFailed(
            message=m or '{} != {}'.format(value, kwargs['eq']),
            details=diff.format(value, kwargs['eq']),
            context=get_context()
        )

    if 'neq' in kwargs.keys() and value == kwargs['neq']:
        raise TestFailed(m or '{} == {}'.format(value, kwargs['neq']), get_context())

    elif len([key for key in kwargs.keys() if key != 'm']) == 0 and not value:
        raise TestFailed(m or "Expected truthy value, got '{}' instead".format(value), get_context())


class TestFailed(Exception):
    def __init__(self, message, details, context):
        super(Exception, self).__init__(message)
        self.details = details
        self.context = context


def run_spec(spec):
    test_results = OrderedDict()

    def add_test_result(test_path, error=None):
        parent_level = test_results
        for level_name in test_path:
            level = parent_level.get(level_name)
            if not level:
                level = OrderedDict()
                parent_level[level_name] = level
            parent_level = level
        if error:
            parent_level['__passed__'] = False
            parent_level['__error__'] = error
        else:
            parent_level['__passed__'] = True

    def print_results(results, indent_size=0):
        indent = ' ' * indent_size
        for key, value in results.items():
            if '__passed__' in value.keys():
                if value['__passed__']:
                    print('{}{}{}{}'.format('\033[92m\033[1m', indent, key, '\033[0m'))
                else:
                    error = value['__error__']
                    print('{}{}{}: {}{}'.format('\033[91m\033[1m', indent, key, error, '\033[0m'))
                    error_indent = ' ' * (indent_size + 2)
                    if error.details:
                        for line in str(error.details).split('\n'):
                            print(error_indent + line)

                    context = error.context
                    print(error_indent + 'Context:')
                    context_indent = ' ' * (indent_size + 4)
                    for name, value in context['locals'].items():
                        print('{}{} = {}'.format(context_indent, name, value))
                    print()
                    print('{}{}:{}'.format(error_indent, context['sourcefile'], context['lineno']))
                    source_indent = ' ' * (indent_size + 4)
                    print(source_indent + '...')
                    print(context['source'])
                    print(source_indent + '...')
                    print(indent + '-------------------------------------')
            else:
                print('{}{}{}{}'.format('\033[95m', indent, key, '\033[0m'))
                print_results(value, indent_size + 2)

    def run_test(test):
        test_path = [s.replace('_', ' ') for s in test.__qualname__.split('.')]
        try:
            test()
            add_test_result(test_path)
        except TestFailed as e:
            add_test_result(test_path, e)

    def do_run_spec(s):
        instance = s()
        [run_test(getattr(instance, name))
            for name, f in inspect.getmembers(s)
            if inspect.isfunction(f)]

        [do_run_spec(getattr(instance, name))
            for name, c in inspect.getmembers(s)
            if inspect.isclass(c) and name != '__class__']

    do_run_spec(spec)
    print_results(test_results, 0)


def leap_year(year):
    return year % 4 == 0 and year % 100 != 0 or year % 400 == 0


class Leap_Year_Spec:
    def foo(self):
        a = 'The quick brown fox'
        expect(a, eq='The quick frown box')
    # class A_year_is_a_leap_year:
    #     def if_it_is_divisible_by_4_but_not_by_100(self):
    #         [expect(leap_year(year))
    #             for year in [2016, 1984, 4]]
    #
    #     def if_it_is_divisible_by_400(self):
    #         [expect(leap_year(year))
    #             for year in [400, 2400, 4000]]
    #
    # class A_year_is_not_a_leap_year:
    #     def if_it_is_not_divisible_by_4(self):
    #         [expect(not leap_year(year))
    #             for year in [2018, 2017, 42, 1]]
    #
    #     def if_it_is_divisible_by_100_but_not_by_400(self):
    #         [expect(not leap_year(year))
    #             for year in [2100, 1900, 100]]
    #


run_spec(Leap_Year_Spec)
