"""Pure, frame-independent action commands shared with the browser engine."""
import math

PROFILES = {
    'strike': dict(duration=1., target=.65, good=.14, perfect=.055),
    'charge': dict(duration=1.2, target=.85, good=.16, perfect=.065),
    'guard': dict(duration=.9, target=.58, good=.12, perfect=.045),
    'catch': dict(duration=1.2, target=.95, nice=.22, great=.13, excellent=.055),
}


def normalize_settings(settings=None):
    s = settings if isinstance(settings, dict) else {}
    return dict(actionMode=s.get('actionMode') if s.get('actionMode') in ('ON', 'ASSIST', 'AUTO') else 'ON',
                quality=s.get('quality') if s.get('quality') in ('HIGH', 'STANDARD', 'LOW') else 'STANDARD',
                reducedMotion=s.get('reducedMotion') is True, basicMode=s.get('basicMode') is True)


def _result(tier='OK', damage=1., crit=0., throw=1.):
    return dict(tier=tier, damageScale=damage, critBonus=crit, throwScale=throw)


AUTO_TIER = 'AUTO'


def auto_result():
    """AUTO resolves at the target with no timed input and no bonus: the baseline, labelled AUTO."""
    return _result(AUTO_TIER)


def judge_command(kind, elapsed, mode='ON', context='normal'):
    if kind not in PROFILES:
        raise ValueError('Unknown command kind: ' + str(kind))
    p = PROFILES[kind]
    factor = (2 if mode == 'ASSIST' else 1) * (.8 if context == 'hunt' else .9 if context == 'ace' else 1)
    if type(elapsed) not in (int, float) or not math.isfinite(elapsed):
        return _result()
    error = abs(elapsed - p['target'])
    def within(key):
        return error <= min(p['duration'], p[key] * factor) + 1e-10
    if kind == 'catch':
        for key, scale in [('excellent', 1.85), ('great', 1.5), ('nice', 1.15)]:
            if within(key):
                return _result(key.upper(), throw=scale)
    elif within('perfect'):
        return _result('PERFECT', .65 if kind == 'guard' else 1.2, 0 if kind == 'guard' else .05)
    elif within('good'):
        return _result('GUARD' if kind == 'guard' else 'GOOD', .8 if kind == 'guard' else 1.1)
    return _result()


def create_command(kind, mode='ON', context='normal'):
    if kind not in PROFILES:
        raise ValueError('Unknown command kind: ' + str(kind))
    return dict(kind=kind, mode=normalize_settings({'actionMode': mode})['actionMode'],
                context=context if context in ('normal', 'hunt', 'ace') else 'normal',
                elapsed=0., armed=False, held=False, done=False, result=None, paused=False)


def step_command(command, dt, input=None):
    c = dict(command)
    i = input or {}
    if c['done']:
        return c
    if i.get('paused'):
        c.update(paused=True, armed=False, held=False)
        return c
    c['paused'] = False
    dt = dt if type(dt) in (int, float) and math.isfinite(dt) else 0
    c['elapsed'] = min(PROFILES[c['kind']]['duration'], c['elapsed'] + max(0, dt))
    p = PROFILES[c['kind']]
    if c['mode'] == 'AUTO':
        # No timed input under AUTO: presses are ignored, so it can never earn a bonus.
        c.update(armed=False, held=False)
        if c['elapsed'] + 1e-10 >= p['target']:
            c['result'] = auto_result()
    else:
        if i.get('pressed'):
            c['armed'] = True
            c['held'] = True
        trigger = i.get('pressed') if c['kind'] in ('strike', 'guard') else i.get('released') and c['armed']
        if trigger:
            at = i.get('at')
            at = max(0, min(p['duration'], at)) if type(at) in (int, float) and math.isfinite(at) else c['elapsed']
            c['result'] = judge_command(c['kind'], at, c['mode'], c['context'])
        elif c['elapsed'] + 1e-10 >= p['duration']:
            c['result'] = _result()
        if i.get('released'):
            c['held'] = False
    c['done'] = c['result'] is not None
    return c
