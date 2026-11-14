"""Deterministic Python timing and engine regression checks."""
import importlib.util
import pathlib
import sys
import unittest
import json
import subprocess
import os
import tempfile
import random
os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from combat.commands import PROFILES, AUTO_TIER, create_command, step_command, judge_command, normalize_settings
spec = importlib.util.spec_from_file_location('mt_commands_test', pathlib.Path(__file__).resolve().parents[1] / "claude's monsters.py")
mt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mt)


class CommandTests(unittest.TestCase):
    def test_pickajoo_starter_gift_and_legacy_thunder(self):
        self.assertIn('zapmote', mt.STARTERS)
        self.assertEqual(mt.make_mon('zapmote', 5).name, 'PICKAJOO')
        self.assertIn('thunderbolt', mt.make_mon('zapmote', 5).moves)
        legacy = mt.Mon.from_dict(dict(id='zapmote', name='ZAPMOTE', level=5, moves=['thundershock'], hp=7))
        self.assertEqual(legacy.name, 'PICKAJOO')
        self.assertIn('thunderbolt', legacy.moves)
        self.assertEqual(legacy.hp, 7)
        game = mt.Game()
        game.party = [mt.make_mon('emberling', 5)]
        game.flags['starter'] = True
        game.professor_talk()
        self.assertEqual(game.party[-1].name, 'PICKAJOO')
        game.professor_talk()
        self.assertEqual(len(game.party), 2)

    def test_inclusive_edges_and_contexts(self):
        for kind, p in PROFILES.items():
            for mode, factor in [('ON', 1), ('ASSIST', 2)]:
                for context, scale in [('normal', 1), ('hunt', .8), ('ace', .9)]:
                    for key in set(p) - {'target', 'duration'}:
                        expected = 'GUARD' if kind == 'guard' and key == 'good' else key.upper()
                        for sign in [-1, 1]:
                            edge = p['target'] + sign * p[key] * factor * scale
                            self.assertEqual(judge_command(kind, edge, mode, context)['tier'], expected)
                            self.assertNotEqual(judge_command(kind, edge + sign * .00001, mode, context)['tier'], expected)

    def test_timeout_and_auto(self):
        for kind, p in PROFILES.items():
            c = step_command(create_command(kind), p['duration'] + 1)
            self.assertEqual(c['result']['tier'], 'OK')
            self.assertEqual(c['result']['damageScale'], 1)
            c = step_command(create_command(kind, 'AUTO'), p['target'])
            self.assertEqual(c['result'], dict(tier='AUTO', damageScale=1., critBonus=0., throwScale=1.))
            self.assertEqual(AUTO_TIER, 'AUTO')
            early = step_command(create_command(kind, 'AUTO'), p['target'] - .05)
            self.assertFalse(early['done'])
            # A perfect press under AUTO is ignored: AUTO never earns a bonus.
            c = step_command(create_command(kind, 'AUTO', 'ace'), p['target'] - .02,
                             {'pressed': True, 'held': True, 'at': p['target']})
            c = step_command(c, 0, {'released': True, 'at': p['target']})
            self.assertFalse(c['done'])
            self.assertFalse(c['armed'])
            c = step_command(c, .02, {'pressed': True, 'at': p['target']})
            self.assertEqual(c['result']['tier'], 'AUTO')
            self.assertEqual((c['result']['damageScale'], c['result']['critBonus'], c['result']['throwScale']), (1, 0, 1))

    def test_auto_step_js_parity(self):
        """stepCommand and step_command agree, step by step, for AUTO and ON scripts."""
        scripts = []
        for kind, p in PROFILES.items():
            for mode in ('AUTO', 'ON', 'ASSIST'):
                for context in ('normal', 'ace', 'hunt'):
                    scripts.append([kind, mode, context, [
                        [p['target'] * .5, {}],
                        [p['target'] * .3, {'pressed': True, 'held': True, 'at': p['target']}],
                        [p['target'] * .2, {'released': True, 'at': p['target']}],
                        [p['duration'], {}]]])
        script = ("const c=require('./combat/commands.js');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(([k,m,x,steps])=>"
                  "{let s=c.createCommand(k,m,x);return steps.map(([dt,i])=>{s=c.stepCommand(s,dt,i);return [s.done,s.armed,s.held,s.result];});})));")
        expected = json.loads(subprocess.check_output(['node', '-e', script, json.dumps(scripts)],
            cwd=pathlib.Path(__file__).resolve().parents[1], text=True))
        got = []
        for kind, mode, context, steps in scripts:
            c = create_command(kind, mode, context)
            trace = []
            for dt, i in steps:
                c = step_command(c, dt, i)
                trace.append([c['done'], c['armed'], c['held'], c['result']])
            got.append(trace)
        self.assertEqual(expected, got)

    def test_hold_focus_and_purity(self):
        original = create_command('charge')
        stale = step_command(original, .85, {'released': True})
        self.assertFalse(stale['done'])
        self.assertEqual(original['elapsed'], 0)
        c = step_command(original, .2, {'pressed': True, 'held': True})
        c = step_command(c, .4, {'paused': True})
        self.assertEqual(c['elapsed'], .2)
        c = step_command(c, .3, {'released': True})
        self.assertFalse(c['done'])
        c = step_command(c, 0, {'pressed': True})
        c = step_command(c, .35, {'released': True})
        self.assertEqual(c['result']['tier'], 'PERFECT')

    def test_settings_and_invalid(self):
        self.assertEqual(normalize_settings({'actionMode': 'invalid'})['actionMode'], 'ON')
        with self.assertRaises(ValueError):
            create_command('invalid')

    def test_engine_optional_modifiers_and_rng_count(self):
        a, b = mt.Mon('emberling', 15), mt.Mon('nibbit', 15)
        move = next(k for k, v in mt.MOVES.items() if v['cat'] == 'phys')
        calls = []
        def rng():
            calls.append(1)
            return .5
        base = mt.damage_calc(a, b, move, {}, {}, rng)
        n = len(calls)
        calls.clear()
        better = mt.damage_calc(a, b, move, {}, {}, rng, timing=1.2, crit_bonus=.05)
        self.assertEqual(n, len(calls))
        self.assertGreaterEqual(better['dmg'], base['dmg'])
        self.assertEqual(mt.damage_calc(a, b, move, {}, {}, lambda: .5, timing=100)['dmg'], better['dmg'])
        self.assertEqual(mt.catch_roll(b, 1.5, lambda: .5, throw_scale=1.85)['caught'], True)

    def test_queue_damage_at_contact_once_after_command(self):
        g = mt.Game()
        g.party = [mt.Mon('emberling', 15)]
        g.start_battle(mt.Mon('nibbit', 15))
        b = g.battle
        b.queue.clear()
        b.step = None
        before = b.foe.hp
        g.apply_move(True, 'scratch')
        g.pump_queue(0)
        self.assertEqual(b.step['t'], 'cmd')
        self.assertEqual(b.foe.hp, before)
        g.pump_queue(1.1)
        self.assertEqual(b.step['t'], 'msg')
        g.confirm_battle()
        g.pump_queue(0)
        self.assertEqual(b.step['t'], 'action')
        g.pump_queue(.1)
        self.assertEqual(b.foe.hp, before)
        g.pump_queue(.55)
        after = b.foe.hp
        self.assertLess(after, before)
        g.pump_queue(.1)
        self.assertEqual(b.foe.hp, after)

    def test_focus_and_settings_state(self):
        g = mt.Game()
        self.assertEqual(g.settings['actionMode'], 'ON')
        g.party = [mt.Mon('emberling', 15)]
        g.start_battle(mt.Mon('nibbit', 15))
        g.battle.queue.clear()
        g.q_command('charge', lambda result: None)
        g.pump_queue(0)
        g.command_input(pressed=True, held=True)
        g.pump_queue(.2)
        g.set_focused(False)
        g.pump_queue(.5)
        self.assertEqual(g.battle.step['command']['elapsed'], .2)
        g.set_focused(True)
        g.command_input(released=True)
        g.pump_queue(.2)
        self.assertFalse(g.battle.step['command']['done'])

    def test_all_move_weapons_are_explicit(self):
        self.assertEqual(set(mt.MOVE_WEAPONS), set(mt.MOVES))
        self.assertEqual(mt.MOVE_WEAPONS['scratch'], 'claw')
        self.assertEqual(mt.MOVE_WEAPONS['infernofang'], 'fang')
        self.assertEqual(mt.MOVE_WEAPONS['aquatail'], 'tail')
        self.assertEqual(mt.MOVE_WEAPONS['gust'], 'wing')
        self.assertEqual(mt.MOVE_WEAPONS['leafblade'], 'blade')

    def test_dead_attacker_skips_command(self):
        g = mt.Game()
        g.party = [mt.Mon('emberling', 15)]
        g.start_battle(mt.Mon('nibbit', 15))
        b = g.battle
        b.queue.clear()
        b.foe.hp = 0
        g.apply_move(False, 'tackle')
        g.pump_queue(0)
        self.assertIsNone(b.step)

    def test_press_release_before_update_keeps_both_edges(self):
        for kind, p in PROFILES.items():
            g = mt.Game()
            g.party = [mt.Mon('emberling', 15)]
            g.start_battle(mt.Mon('nibbit', 15))
            b = g.battle
            b.queue.clear()
            judged = []
            g.q_command(kind, judged.append)
            g.pump_queue(0)
            b.step['command']['elapsed'] = p['target']
            self.assertTrue(g.command_input(pressed=True, held=True))
            self.assertTrue(g.command_input(released=True))
            g.pump_queue(.01)
            self.assertEqual(judged[0]['tier'], 'EXCELLENT' if kind == 'catch' else 'PERFECT')

    def test_latched_edges_judge_the_relevant_timestamp(self):
        for kind, p in PROFILES.items():
            g = mt.Game()
            g.party = [mt.Mon('emberling', 15)]
            g.start_battle(mt.Mon('nibbit', 15))
            g.battle.queue.clear()
            judged = []
            g.q_command(kind, judged.append)
            g.pump_queue(0)
            press_at = p['target'] if kind in ('strike', 'guard') else .1
            release_at = p['target'] if kind in ('charge', 'catch') else p['target'] + .2
            g.command_input(pressed=True, held=True, at=press_at)
            g.command_input(released=True, at=release_at)
            self.assertEqual(g.command_events['pressAt'], press_at)
            self.assertEqual(g.command_events['releaseAt'], release_at)
            g.pump_queue(.01)
            self.assertEqual(judged[0]['tier'], 'EXCELLENT' if kind == 'catch' else 'PERFECT')

    def test_profile_and_timeline_js_parity(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        if not (root / 'combat' / 'recipes.js').exists():
            self.skipTest('JS recipes are still being authored')
        script = "const c=require('./combat/commands.js'),r=require('./combat/recipes.js');console.log(JSON.stringify({profiles:c.PROFILES,recipes:r.MOVE_RECIPES||r.RECIPES}));"
        data = json.loads(subprocess.check_output(['node', '-e', script], cwd=root, text=True))
        self.assertEqual(PROFILES, data['profiles'])
        for mid, recipe in data['recipes'].items():
            t = mt.move_timeline(mid)
            self.assertAlmostEqual(t['windup'], recipe['windup'])
            self.assertAlmostEqual(t['travel'], recipe['travel'])
            self.assertAlmostEqual(t['contact'], recipe['contact'])
            self.assertAlmostEqual(t['recovery'], recipe['recovery'])
            self.assertEqual(mt.MOVE_WEAPONS[mid], recipe['weapon'])

    def test_frame_rates_and_event_timestamps(self):
        for kind, p in PROFILES.items():
            for fps in (30, 60, 120):
                c = create_command(kind)
                while c['elapsed'] + 1 / fps < p['target']:
                    c = step_command(c, 1 / fps, {'pressed': c['elapsed'] == 0} if kind in ('charge', 'catch') else {})
                event = {'released': True} if kind in ('charge', 'catch') else {'pressed': True}
                event['at'] = p['target']
                c = step_command(c, 1 / fps, event)
                self.assertEqual(c['result']['tier'], 'EXCELLENT' if kind == 'catch' else 'PERFECT')
                c = create_command(kind)
                while not c['done']:
                    c = step_command(c, 1 / fps)
                self.assertEqual(c['result']['tier'], 'OK')

    def test_settings_save_and_old_save_defaults(self):
        old_path = mt.SAVE_PATH
        with tempfile.TemporaryDirectory() as tmp:
            mt.SAVE_PATH = str(pathlib.Path(tmp) / 'save.json')
            try:
                g = mt.Game()
                g.party = [mt.Mon('emberling', 15)]
                g.settings = dict(actionMode='ASSIST', quality='LOW', reducedMotion=True, basicMode=False)
                self.assertTrue(g.save_game())
                restored = mt.Game()
                self.assertTrue(restored.load_game())
                self.assertEqual(g.settings, restored.settings)
                data = json.loads(pathlib.Path(mt.SAVE_PATH).read_text())
                del data['settings']
                pathlib.Path(mt.SAVE_PATH).write_text(json.dumps(data))
                self.assertTrue(restored.load_game())
                self.assertEqual(restored.settings, normalize_settings())
            finally:
                mt.SAVE_PATH = old_path

    def test_full_judgment_js_parity(self):
        samples = []
        for kind, p in PROFILES.items():
            for mode in ('ON', 'ASSIST', 'AUTO', 'bad'):
                for context in ('normal', 'hunt', 'ace', 'bad'):
                    for t in (0, p['target'], p['duration'], p['target'] - .14, p['target'] + .055):
                        samples.append([kind, t, mode, context])
        script = "const c=require('./combat/commands.js');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(args=>c.judgeCommand(...args))));"
        expected = json.loads(subprocess.check_output(['node', '-e', script, json.dumps(samples)],
            cwd=pathlib.Path(__file__).resolve().parents[1], text=True))
        self.assertEqual(expected, [judge_command(*args) for args in samples])

    def test_prechange_default_results_and_random_calls(self):
        backup = pathlib.Path(__file__).resolve().parents[1] / '.superpowers/sdd/2026-10-17-3d-combat/backups/claude\'s monsters.py'
        if not backup.exists():
            self.skipTest('Preserved prechange source is not available')
        old_spec = importlib.util.spec_from_file_location('mt_prechange', backup)
        old = importlib.util.module_from_spec(old_spec)
        old_spec.loader.exec_module(old)
        class CountedRandom:
            def __init__(self, seed):
                self.rng, self.calls = random.Random(seed), 0
            def __call__(self):
                self.calls += 1
                return self.rng.random()
        a, b = mt.Mon('emberling', 30), mt.Mon('nibbit', 30)
        for move in mt.MOVES:
            for seed in range(12):
                r1, r2 = CountedRandom(seed), CountedRandom(seed)
                self.assertEqual(old.damage_calc(a, b, move, {'atk': -2}, {'def_': 2}, r1),
                                 mt.damage_calc(a, b, move, {'atk': -2}, {'def_': 2}, r2), (move, seed))
                self.assertEqual(r1.calls, r2.calls, (move, seed))
        for sid in mt.SPECIES:
            mon = mt.Mon(sid, 30)
            for hp in (1, mon.maxhp):
                mon.hp = hp
                for seed in range(12):
                    r1, r2 = CountedRandom(seed), CountedRandom(seed)
                    self.assertEqual(old.catch_roll(mon, 1.5, r1), mt.catch_roll(mon, 1.5, r2), (sid, seed))
                    self.assertEqual(r1.calls, r2.calls, (sid, seed))

    def test_real_shell_all_weapons_and_commands(self):
        import pygame
        shell = mt.Shell()
        g = shell.game
        g.party = [mt.Mon('emberling', 15)]
        g.start_battle(mt.Mon('nibbit', 15))
        b = g.battle
        b.queue.clear()
        colors = []
        for reduced in (False, True):
            mt.REDUCED_MOTION = reduced
            for side in ('mine', 'foe'):
                for mid in mt.MOVES:
                    timeline = mt.move_timeline(mid)
                    b.action = dict(actor=side, moveId=mid, duration=timeline['duration'],
                        contactAt=timeline['contactAt'], elapsed=timeline['contactAt'] * .8, result={})
                    shell.surf.fill((0, 0, 0))
                    shell.draw_action_weapon()
                    raw = pygame.image.tobytes(shell.surf, 'RGB')
                    self.assertTrue(any(raw), (reduced, side, mid))
                    colors.append(len(set(raw)))
                    frame_dir = os.environ.get('MT_FRAME_DIR')
                    if frame_dir and not reduced and side == 'mine' and mid in ('ember', 'gust', 'scratch', 'infernofang', 'aquatail', 'leafblade'):
                        b.step = None
                        shell.draw_battle()
                        pygame.image.save(shell.surf, str(pathlib.Path(frame_dir) / ('python-action-' + mid + '.png')))
            for kind in PROFILES:
                shell.draw_command(create_command(kind, 'ASSIST', 'hunt'))
                if os.environ.get('MT_FRAME_DIR') and not reduced:
                    b.step = dict(t='cmd', command=create_command(kind, 'ASSIST', 'hunt'))
                    b.action = None
                    shell.draw_battle()
                    pygame.image.save(shell.surf, str(pathlib.Path(os.environ['MT_FRAME_DIR']) / ('python-command-' + kind + '.png')))
        b.action = None
        mt.REDUCED_MOTION = False
        self.assertGreater(max(colors), 5)
        pygame.display.quit()


if __name__ == '__main__':
    unittest.main(testRunner=unittest.TextTestRunner(stream=sys.stdout))
