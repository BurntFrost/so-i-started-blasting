"""Original film-signature synthesis via SoX and FFmpeg. No sampled film audio.

python3 tools/author-audio.py [scene_function ...]

Without arguments every scene is rendered; naming scene functions (for example
`twister gravity`) renders only those, leaving the other checked-in files untouched.

Each 30-second bed is composed against its scene's visual timeline, so the arc of
the film moment (approach, arrival, collapse, engulfment) is baked into the
time-locked bed. Cues carry the discrete transients that must not replay when
scrubbing. Everything is oscillators, noise, filters and expressions; the two
public-domain compositions (Wagner's Tristan Prelude, Beethoven's Seventh) are
original renderings or rhythm-inspired figures, never recordings.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work' / 'media-audio'
OUTPUT = ROOT / 'dist' / 'assets' / 'audio'
RATE = '44100'
SEMITONES = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
ROOM = ('35', '35', '60', '80', '0', '-7')
HALL = ('70', '40', '100', '100', '10', '-6')
DRY = ('12', '50', '25', '60', '0', '-9')


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True, stdout=subprocess.DEVNULL)


def st(note):
    """Semitones from A4 for a note name such as D#4 or Bb2."""
    letter, rest = note[0], note[1:]
    accidental = rest.startswith('#') - rest.startswith('b')
    return SEMITONES[letter] + accidental + (int(rest.lstrip('#b')) - 4) * 12


def p(semitones):
    return f'%{semitones:g}'


def synth(name, duration, spec, effects=(), level=-12):
    target = WORK / f'{name}.wav'
    run('sox', '-R', '-n', '-r', RATE, '-b', '16', '-c', '1', target, 'synth', duration, *spec, *effects, 'gain', '-n', level)
    return target


def expression(name, duration, expr, effects=(), level=-12):
    raw, target = WORK / f'{name}-expr.wav', WORK / f'{name}.wav'
    escaped = expr.replace(',', r'\,')
    run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
        f"aevalsrc=exprs='{escaped}':s={RATE}:d={duration}", '-ar', RATE, '-ac', '1', raw)
    run('sox', '-R', raw, '-b', '16', '-c', '1', target, *effects, 'gain', '-n', level)
    return target


def at(path, start):
    if not start:
        return path
    target = path.with_name(f'{path.stem}-at{start:g}.wav')
    run('sox', '-R', path, target, 'pad', start, '0')
    return target


def voices(*pairs):
    spec = []
    for index, (wave, frequency) in enumerate(pairs):
        spec += [wave, 'mix', frequency] if index else [wave, frequency]
    return spec


def noise(name, duration, color, effects, level=-12):
    return synth(name, duration, [color, '100'], effects, level)


def strings(name, notes, duration, attack=.35, release=.6, cutoff='1500'):
    pairs = []
    for note in ([notes] if isinstance(notes, str) else notes):
        s = st(note)
        pairs += [('sawtooth', p(s)), ('sawtooth', p(s + .08)), ('sine', p(s - 12))]
    return synth(name, duration, voices(*pairs),
                 ['lowpass', cutoff, 'fade', 'q', attack, duration, release, 'chorus', '0.6', '0.9', '55', '0.4', '0.25', '2', '-t'])


def organ(name, notes, duration, attack=1.5, release=1):
    pairs = []
    for note in notes:
        s = st(note)
        pairs += [('sine', p(s)), ('sine', p(s + 12)), ('sine', p(s + 19)), ('sine', p(s + 24))]
    return synth(name, duration, voices(*pairs), ['fade', 'q', attack, duration, release, 'tremolo', '0.07', '20'])


def phrase(name, notes, start, vol, **timbre):
    parts, t = [], start
    for index, (note, duration) in enumerate(notes):
        parts.append((at(strings(f'{name}-{index}', note, duration + .3, **timbre), round(t, 3)), vol))
        t += duration
    return parts


def bell(name, partials, duration=1.6):
    return synth(name, duration, voices(*[('sine', f'{hz:g}') for hz in partials]),
                 ['fade', 't', '0.002', duration, duration - .1, 'highpass', '400'])


def boom(name, duration=4, top='95', bottom='28', cutoff='1200'):
    tone = synth(f'{name}-tone', duration, ['sine', f'{top}:{bottom}'], ['fade', 't', '.01', duration, duration - .5])
    body = noise(f'{name}-body', duration, 'brownnoise', ['lowpass', cutoff, 'fade', 't', '.01', duration, duration - .2])
    return [(tone, 1), (body, .9)]


def thunder(name, duration=4):
    crack = noise(f'{name}-crack', .3, 'whitenoise', ['highpass', '900', 'fade', 't', '0', '.3', '.3'])
    roll = noise(f'{name}-roll', duration, 'brownnoise', ['lowpass', '320', 'fade', 't', '.05', duration, duration - .4])
    return [(crack, .8), (roll, 1)]


def crackle(name, duration, density='0.9993', effects=('highpass', '900')):
    return expression(name, duration, f'gt(random(1),{density})*(random(0)*2-1)', list(effects))


def finish(name, parts, duration, peak, fade, reverb=ROOM):
    mixed = WORK / f'{name}-mix.wav'
    inputs = []
    for path, vol in parts:
        inputs += ['-v', f'{vol:g}', path]
    # Stereo decorrelation comes from the reverb; the mix is finite and static.
    run('sox', '-R', *(['-m'] if len(parts) > 1 else []), *inputs, '-c', '2', mixed, 'gain', '-n', '-6', 'reverb', *reverb,
        'pad', '0', duration, 'trim', '0', duration, 'fade', 't', fade, duration, fade, 'gain', '-n', peak)
    run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', mixed, '-ar', RATE,
        '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', OUTPUT / f'{name}.mp3')


def bed(name, parts, reverb=ROOM):
    finish(f'bed-{name}', parts, 30, '-12', '0.5', reverb)


def cue(name, parts, duration, peak='-10', reverb=ROOM):
    finish(name, parts, duration, peak, '.015', reverb)


# ---------------------------------------------------------------- scenes

def independence_day():
    n = 'id'
    parts = [
        (synth(f'{n}-hum', 30, ['sine', '46'], ['tremolo', '0.3', '65']), 1),
        (synth(f'{n}-hum2', 30, ['sine', '69'], ['tremolo', '1.2', '30']), .7),
        (noise(f'{n}-air', 30, 'brownnoise', ['lowpass', '450']), .6),
        (synth(f'{n}-craft', 30, voices(('sine', '1380'), ('sine', '2070')), ['tremolo', '0.4', '80', 'lowpass', '3000']), .12),
    ]
    ping = synth(f'{n}-ping', 1.4, voices(('sine', '1760:1740'), ('sine', '2640')),
                 ['fade', 't', '0.005', '1.4', '1.3', 'highpass', '800', 'echo', '0.8', '0.7', '400', '0.35'])
    parts += [(at(ping, t), .3) for t in (1, 3.6, 6.2)]
    static = noise(f'{n}-static', .4, 'whitenoise', ['bandpass', '2200', '1.5q', 'fade', 't', '.02', '.4', '.3'])
    parts += [(at(static, t), .14) for t in (2.2, 5.1, 7.4)]
    # Weapon charging 9-13: the beam builds beneath the ship.
    parts.append((at(noise(f'{n}-charge-air', 4, 'pinknoise', ['bandpass', '500', '1q', 'bend', '0,2400,4', 'fade', 'l', '3', '4', '.2']), 9), .35))
    parts.append((at(synth(f'{n}-charge-tone', 4, ['sine', '120:900'], ['tremolo', '7', '55', 'fade', 'l', '3.2', '4', '.3']), 9), .3))
    # Blast tail, rolling firestorm and the collapsing skyline.
    parts.append((at(noise(f'{n}-blast-tail', 12, 'brownnoise', ['lowpass', '200', 'fade', 't', '.05', '12', '11']), 13), .8))
    parts.append((at(noise(f'{n}-firestorm', 15, 'pinknoise', ['lowpass', '900', 'tremolo', '0.6', '50', 'fade', 'l', '2', '15', '4']), 13.5), .5))
    parts.append((at(noise(f'{n}-debris', 10, 'brownnoise', ['bandpass', '250', '2q', 'tremolo', '9', '70', 'fade', 'l', '1', '10', '3']), 15), .45))
    bed('independence-day', parts)
    cue('independence-day-charge', [
        (synth(f'{n}-cue-charge', 4, voices(('sine', '180:1800'), ('sawtooth', '90:900')), ['lowpass', '2600', 'tremolo', '9', '45', 'fade', 'l', '3.4', '4', '.15']), 1),
        (noise(f'{n}-cue-charge-air', 4, 'whitenoise', ['bandpass', '1800', '1q', 'bend', '0,1800,4', 'fade', 'l', '3.6', '4', '.1']), .35),
    ], 4, '-11')
    cue('independence-day-blast', boom(f'{n}-cue-blast', 4) + [
        (noise(f'{n}-cue-blast-crack', .25, 'whitenoise', ['highpass', '1500', 'fade', 't', '0', '.25', '.22']), .6)], 4, '-8')
    cue('independence-day-collapse', [
        (noise(f'{n}-cue-collapse', 3, 'brownnoise', ['bandpass', '300', '1q', 'tremolo', '12', '80', 'fade', 't', '.02', '3', '2.6']), 1),
        (synth(f'{n}-cue-collapse-sub', 3, ['sine', '80:30'], ['fade', 't', '.01', '3', '2.7']), .8),
    ], 3, '-12')


def deep_impact():
    n = 'di'
    parts = [
        (noise(f'{n}-ocean', 30, 'pinknoise', ['lowpass', '1800', 'tremolo', '0.14', '85']), .9),
        (noise(f'{n}-swell', 30, 'brownnoise', ['lowpass', '250', 'tremolo', '0.23', '60']), .7),
        (noise(f'{n}-gusts', 30, 'pinknoise', ['bandpass', '900', '1.2q', 'tremolo', '0.09', '45']), .35),
        # A mournful string pad lifts from D minor to B-flat major as the wave rises.
        (strings(f'{n}-pad1', ['D3', 'F3', 'A3'], 18, attack=8, release=4, cutoff='1200'), .3),
        (at(strings(f'{n}-pad2', ['Bb2', 'D3', 'F3', 'D4'], 16, attack=4, release=3, cutoff='1200'), 14), .32),
        # Comet entry: a descending whistle and rip of air 4-13.
        (at(expression(f'{n}-whistle', 9, 'sin(2*PI*(2600*t-100*t*t))*min(t/9,1)', ['lowpass', '4000']), 4), .22),
        (at(noise(f'{n}-rip', 9, 'pinknoise', ['bandpass', '2400', '1q', 'bend', '0,-1500,9', 'fade', 'l', '7', '9', '.2']), 4), .3),
        (at(noise(f'{n}-impact-tail', 10, 'brownnoise', ['lowpass', '150', 'fade', 't', '.05', '10', '9']), 13), .8),
        # The wall of water rises 14-28, then spray.
        (at(noise(f'{n}-wall', 16, 'pinknoise', ['lowpass', '700', 'tremolo', '0.5', '30', 'fade', 'l', '12', '16', '2']), 14), .7),
        (at(noise(f'{n}-wall-sub', 16, 'brownnoise', ['lowpass', '90', 'fade', 'l', '12', '16', '2']), 14), .7),
        (at(noise(f'{n}-spray', 12, 'whitenoise', ['highpass', '4000', 'lowpass', '9000', 'tremolo', '0.7', '50', 'fade', 'l', '4', '12', '2']), 18), .18),
    ]
    bed('deep-impact', parts)
    cue('deep-impact-entry', [
        (synth(f'{n}-cue-entry', 3, ['sine', '3200:600'], ['tremolo', '40', '40', 'fade', 't', '.05', '3', '.6']), .8),
        (noise(f'{n}-cue-entry-air', 3, 'whitenoise', ['bandpass', '3000', '1q', 'bend', '0,-2400,3', 'fade', 'l', '2', '3', '.4']), .7),
    ], 3, '-10')
    cue('deep-impact-impact', boom(f'{n}-cue-impact', 5, cutoff='900') + [
        (noise(f'{n}-cue-splash', 2.5, 'whitenoise', ['bandpass', '1200', '.8q', 'fade', 't', '.01', '2.5', '2.3']), .5)], 5, '-8')
    cue('deep-impact-surge', [
        (noise(f'{n}-cue-surge', 5, 'brownnoise', ['lowpass', '600', 'fade', 't', '.1', '5', '4']), 1),
        (noise(f'{n}-cue-surge-foam', 5, 'pinknoise', ['bandpass', '1600', '1q', 'fade', 't', '.2', '5', '4.2']), .6),
    ], 5, '-9')


def day_after_tomorrow():
    n = 'dat'
    parts = [
        (noise(f'{n}-wind', 30, 'pinknoise', ['bandpass', '720', '1.4q', 'tremolo', '0.19', '75']), .6),
        (noise(f'{n}-howl', 30, 'pinknoise', ['bandpass', '320', '2q', 'tremolo', '0.13', '60']), .5),
        # The superstorm arrives between 8 and 20.
        (at(noise(f'{n}-storm', 14, 'pinknoise', ['bandpass', '1100', '1q', 'tremolo', '0.3', '50', 'fade', 'l', '6', '14', '3']), 8), .7),
        (at(noise(f'{n}-storm-body', 14, 'brownnoise', ['lowpass', '200', 'fade', 'l', '6', '14', '3']), 8), .6),
        (at(noise(f'{n}-hail', 20, 'whitenoise', ['highpass', '5000', 'tremolo', '0.9', '40', 'fade', 'l', '3', '20', '2']), 10), .12),
        (at(noise(f'{n}-roll1', 5, 'brownnoise', ['lowpass', '350', 'fade', 't', '.2', '5', '4.5']), 12.5), .6),
        (at(noise(f'{n}-roll2', 5, 'brownnoise', ['lowpass', '350', 'fade', 't', '.2', '5', '4.5']), 17), .45),
        # Deep freeze from 20: groaning ice and a crystalline shimmer.
        (at(synth(f'{n}-groan', 10, ['sine', f'{p(-30)}:{p(-33)}'], ['tremolo', '0.1', '95', 'fade', 'l', '3', '10', '1']), 20), .35),
        (at(synth(f'{n}-shimmer', 9, voices(('sine', '5200'), ('sine', '7800')), ['tremolo', '11', '90', 'highpass', '3000', 'fade', 'l', '4', '9', '1']), 21), .1),
    ]
    bed('day-after-tomorrow', parts)
    cue('day-after-tomorrow-pressure', [
        (synth(f'{n}-cue-pressure', 3, ['sine', '110:35'], ['fade', 't', '.05', '3', '2.6']), 1),
        (noise(f'{n}-cue-pressure-air', 3, 'brownnoise', ['lowpass', '400', 'fade', 't', '.05', '3', '2.7']), .8),
    ], 3, '-10')
    cue('day-after-tomorrow-thunder', thunder(f'{n}-cue-thunder', 4), 4, '-8', HALL)
    cue('day-after-tomorrow-freeze', [
        (noise(f'{n}-cue-ice-crack', .5, 'whitenoise', ['bandpass', '2200', '.8q', 'fade', 't', '.005', '.5', '.45']), .8),
        (synth(f'{n}-cue-ice-tone', 1.2, ['sine', '1800:300'], ['fade', 't', '.01', '1.2', '1.1']), .5),
        (at(noise(f'{n}-cue-ice-crack2', .4, 'whitenoise', ['bandpass', '3200', '1q', 'fade', 't', '.005', '.4', '.35']), 1.1), .5),
        (noise(f'{n}-cue-ice-spread', 4, 'pinknoise', ['bandpass', '4000', '2q', 'tremolo', '18', '70', 'fade', 't', '.3', '4', '3']), .3),
    ], 4, '-10', HALL)


def melancholia():
    n = 'mel'
    parts = [
        (synth(f'{n}-space', 30, ['sine', '41'], ['tremolo', '0.1', '60']), .6),
        (noise(f'{n}-void', 30, 'brownnoise', ['lowpass', '120']), .35),
        # The rogue planet's pressure rises across the whole approach.
        (synth(f'{n}-approach', 30, ['sine', '55:82'], ['tremolo', '0.13', '50', 'fade', 'l', '6', '30', '.5']), .45),
    ]
    # Original rendering of the opening measures of Wagner's Tristan Prelude (1859, public domain).
    parts += phrase(f'{n}-cellos', [('A3', 2), ('F4', 2.5), ('E4', 3.5), ('D#4', 2.5)], 2, .45)
    parts.append((at(strings(f'{n}-tristan-chord', ['F3', 'B3', 'D#4', 'G#4'], 6.2, attack=3, release=1.5), 6.5), .3))
    parts += phrase(f'{n}-winds', [('G#4', 1), ('A4', 1), ('A#4', 1), ('B4', 2.2)], 12.3, .34, cutoff='2200')
    parts.append((at(strings(f'{n}-resolution', ['E3', 'G#3', 'D4', 'B4'], 10.5, attack=2.5, release=3), 17), .4))
    # Atmospheres touch from 22; the collision white-out begins at 27.
    parts.append((at(noise(f'{n}-contact', 5.5, 'whitenoise', ['bandpass', '900', '2q', 'tremolo', '0.8', '60', 'fade', 'l', '4', '5.5', '1']), 22), .35))
    parts.append((at(synth(f'{n}-tension', 6, ['sine', f'{p(-16)}:{p(5)}'], ['fade', 'l', '4', '6', '1']), 21.5), .2))
    parts.append((at(noise(f'{n}-whiteout', 3, 'pinknoise', ['lowpass', '2500', 'fade', 't', '.1', '3', '1.5']), 27), .9))
    parts.append((at(noise(f'{n}-whiteout-sub', 3, 'brownnoise', ['lowpass', '90', 'fade', 't', '.05', '3', '1.2']), 27), .9))
    bed('melancholia', parts, HALL)
    cue('melancholia-contact', [
        (crackle(f'{n}-cue-contact-crackle', 5, '0.9985', ('bandpass', '1600', '1q', 'fade', 'l', '3', '5', '1')), .7),
        (synth(f'{n}-cue-contact-rise', 5, ['sine', '220:1760'], ['tremolo', '6', '40', 'fade', 'l', '3.5', '5', '.8']), .6),
    ], 5, '-11')
    cue('melancholia-collision', boom(f'{n}-cue-collision', 3.5, '70', '22', '600') + [
        (noise(f'{n}-cue-collision-wall', 3.5, 'whitenoise', ['lowpass', '3000', 'fade', 't', '.02', '3.5', '3']), .8)], 3.5, '-8', HALL)


def terminator_2():
    n = 't2'
    parts = [
        # The last quiet morning: soft wind, a city hum and wind chimes.
        (noise(f'{n}-morning-wind', 5, 'pinknoise', ['bandpass', '500', '1q', 'tremolo', '0.2', '40', 'fade', 't', '.5', '5', '1']), .3),
        (synth(f'{n}-city-hum', 5, ['sine', '62'], ['fade', 't', '.5', '5', '1']), .2),
    ]
    chime = bell(f'{n}-chime', [2637, 3951, 5274], 1.2)
    parts += [(at(chime, t), .1) for t in (.4, 1.3, 2.1, 2.9, 3.6)]
    # Thermal flash at 4, then the fireball's rising roar until the shock front.
    parts.append((at(synth(f'{n}-ring', 3, ['sine', '6000:5800'], ['highpass', '3000', 'fade', 't', '.01', '3', '2.5']), 4), .3))
    parts.append((at(noise(f'{n}-fireball', 9, 'brownnoise', ['lowpass', '300', 'tremolo', '0.9', '40', 'fade', 'l', '1', '9', '2']), 4.2), .8))
    parts.append((at(noise(f'{n}-fire-air', 9, 'pinknoise', ['lowpass', '1500', 'tremolo', '1.3', '30', 'fade', 'l', '2', '9', '2']), 4.5), .5))
    parts.append((at(synth(f'{n}-rise', 9, ['sine', '30:48'], ['fade', 'l', '2', '9', '1']), 4), .6))
    # Shock front 13-23: hurricane roar, debris, glass.
    parts.append((at(noise(f'{n}-hurricane', 10, 'pinknoise', ['bandpass', '400', '.7q', 'tremolo', '2.5', '30', 'fade', 't', '.05', '10', '5']), 13), .8))
    parts.append((at(noise(f'{n}-debris', 9, 'brownnoise', ['bandpass', '260', '2q', 'tremolo', '14', '70', 'fade', 'l', '.5', '9', '3']), 13.5), .5))
    parts.append((at(noise(f'{n}-glass', 2, 'whitenoise', ['highpass', '3000', 'tremolo', '25', '90', 'fade', 't', '.05', '2', '1.8']), 13.2), .3))
    # Fallout: thin wind and an industrial metallic figure, the machines' world arriving.
    parts.append((at(noise(f'{n}-fallout', 7, 'pinknoise', ['bandpass', '800', '1q', 'tremolo', '0.25', '60', 'fade', 'l', '3', '7', '1']), 23), .4))
    clang = synth(f'{n}-clang', 1.6, ['pluck', p(-14)], ['overdrive', '20', 'bandpass', '2400', '2q', 'fade', 't', '.005', '1.6', '1.3'])
    parts += [(at(clang, t), .3) for t in (23, 23.9, 24.6, 26, 26.9, 27.6, 29)]
    bed('terminator-2', parts)
    cue('terminator-2-flash', [
        (synth(f'{n}-cue-whine', 3, ['sine', '7000:6600'], ['fade', 't', '.005', '3', '2.6']), .6),
        (noise(f'{n}-cue-flash', 3, 'whitenoise', ['highpass', '2500', 'fade', 't', '.005', '3', '2.8']), .7),
        (synth(f'{n}-cue-thump', 1.5, ['sine', '70:25'], ['fade', 't', '.005', '1.5', '1.3']), .9),
    ], 3, '-8', DRY)
    cue('terminator-2-shockwave', boom(f'{n}-cue-shock', 4, '110', '30', '1600') + [
        (noise(f'{n}-cue-shock-wind', 4, 'pinknoise', ['bandpass', '600', '.6q', 'fade', 't', '.02', '4', '3']), .8)], 4, '-8')
    cue('terminator-2-collapse', [
        (noise(f'{n}-cue-collapse', 3, 'brownnoise', ['bandpass', '320', '1q', 'tremolo', '11', '80', 'fade', 't', '.02', '3', '2.6']), 1),
        (synth(f'{n}-cue-collapse-sub', 3, ['sine', '75:28'], ['fade', 't', '.01', '3', '2.7']), .7),
    ], 3, '-12')


def year_2012():
    n = 'q'
    parts = [
        (synth(f'{n}-groan', 30, ['sine', f'{p(-40)}:{p(-44)}'], ['tremolo', '0.2', '85']), .6),
        (noise(f'{n}-pressure', 30, 'brownnoise', ['lowpass', '180', 'tremolo', '1.7', '65', 'fade', 'l', '2', '30', '.5']), .7),
        # The fault opens at 3 and the ground never settles again.
        (at(noise(f'{n}-rupture-tail', 27, 'brownnoise', ['lowpass', '120', 'fade', 't', '.05', '27', '6']), 3), .9),
        (at(crackle(f'{n}-cracks', 23, '0.9994', ('bandpass', '1200', '1q')), 3), .3),
        (at(expression(f'{n}-siren1', 22, 'sin(2*PI*650*t+55*sin(2*PI*0.42*t))', ['lowpass', '1800', 'fade', 't', '4', '22', '3']), 6), .13),
        (at(expression(f'{n}-siren2', 19, 'sin(2*PI*720*t+50*sin(2*PI*0.37*t))', ['lowpass', '1800', 'fade', 't', '4', '19', '3']), 9), .09),
        (at(noise(f'{n}-fall1', 4, 'brownnoise', ['lowpass', '300', 'fade', 't', '.05', '4', '3.5']), 10), .7),
        (at(noise(f'{n}-fall2', 4, 'brownnoise', ['lowpass', '300', 'fade', 't', '.05', '4', '3.5']), 14.5), .5),
        (at(noise(f'{n}-fall3', 4, 'brownnoise', ['lowpass', '300', 'fade', 't', '.05', '4', '3.5']), 21), .8),
        (at(noise(f'{n}-dust', 6, 'pinknoise', ['lowpass', '600', 'fade', 'l', '1', '6', '2']), 24), .3),
    ]
    bed('2012', parts)
    cue('2012-rupture', boom(f'{n}-cue-rupture', 4, '100', '28', '700') + [
        (noise(f'{n}-cue-rupture-crack', .5, 'whitenoise', ['bandpass', '1500', '.7q', 'fade', 't', '0', '.5', '.45']), .7)], 4, '-8')
    cue('2012-collapse', [
        (noise(f'{n}-cue-collapse', 2.5, 'brownnoise', ['bandpass', '350', '1q', 'tremolo', '13', '80', 'fade', 't', '.02', '2.5', '2.2']), 1),
        (synth(f'{n}-cue-collapse-sub', 2.5, ['sine', '85:30'], ['fade', 't', '.01', '2.5', '2.2']), .8),
    ], 2.5, '-9')


def war_of_the_worlds():
    n = 'wow'
    parts = [
        (synth(f'{n}-drone', 30, ['sine', '62'], ['tremolo', '1.1', '90']), .5),
        (noise(f'{n}-tremor', 8, 'brownnoise', ['lowpass', '90', 'tremolo', '3', '40', 'fade', 'l', '.5', '8', '.5']), .5),
        (noise(f'{n}-charge', 8, 'whitenoise', ['bandpass', '4000', '2q', 'tremolo', '8', '60', 'fade', 'l', '2', '8', '.5']), .12),
    ]
    roll = noise(f'{n}-roll', 3.5, 'brownnoise', ['lowpass', '300', 'fade', 't', '.05', '3.5', '3'])
    parts += [(at(roll, t), .6) for t in (1.5, 3.5, 5.5)]
    # Emergence 6-8, then the machines walk from 9.
    parts.append((at(synth(f'{n}-emerge', 2.5, ['sine', '30:60'], ['fade', 't', '.2', '2.5', '.8']), 6), .7))
    parts.append((at(synth(f'{n}-metal', 2.5, ['sawtooth', f'{p(-40)}:{p(-38)}'], ['lowpass', '400', 'fade', 't', '.5', '2.5', '1']), 6.3), .35))
    parts.append((at(synth(f'{n}-pulse', 22, ['sawtooth', '93'], ['lowpass', '300', 'tremolo', '0.55', '95', 'fade', 'l', '1', '22', '1']), 8), .35))
    thud = synth(f'{n}-thud', .6, voices(('sine', '60:35'), ('brownnoise', '100')), ['lowpass', '120', 'fade', 't', '.005', '.6', '.55'])
    servo = synth(f'{n}-servo', .5, ['sawtooth', f'{p(-10)}:{p(-13)}'], ['lowpass', '900', 'fade', 't', '.05', '.5', '.4'])
    for step in range(9):
        t = 9.2 + step * 2.4
        parts += [(at(thud, t), .6), (at(servo, round(t + .3, 2)), .15)]
    bed('war-of-the-worlds', parts)
    cue('war-of-the-worlds-lightning', thunder(f'{n}-cue-lightning', 2.5), 2.5, '-9', HALL)
    cue('war-of-the-worlds-horn', [
        (synth(f'{n}-cue-horn', 3.5, voices(('sawtooth', f'{p(-36)}:{p(-35.5)}'), ('square', f'{p(-35.9)}'), ('sine', f'{p(-48)}')),
               ['lowpass', '520', 'overdrive', '12', 'fade', 'q', '.4', '3.5', '1.2']), 1),
        (noise(f'{n}-cue-horn-air', 3.5, 'pinknoise', ['bandpass', '260', '1.5q', 'fade', 'q', '.4', '3.5', '1.2']), .3),
    ], 3.5, '-8', HALL)
    cue('war-of-the-worlds-heatray', [
        (synth(f'{n}-cue-ray', 2, ['sine', '4200:180'], ['fade', 't', '.005', '2', '1.7']), .8),
        (noise(f'{n}-cue-ray-air', 2, 'whitenoise', ['bandpass', '3000', '1q', 'bend', '0,-2000,2', 'fade', 't', '.005', '2', '1.6']), .6),
        (crackle(f'{n}-cue-ray-crackle', 2, '0.998', ('bandpass', '2400', '1q', 'fade', 't', '0', '2', '1.5')), .5),
    ], 2, '-9', DRY)


def knowing():
    n = 'kn'
    parts = [
        (noise(f'{n}-roar', 30, 'pinknoise', ['lowpass', '750', 'tremolo', '0.2', '45']), .7),
        (synth(f'{n}-core', 30, ['sine', '41'], ['tremolo', '0.1', '60']), .5),
        (noise(f'{n}-plasma', 30, 'whitenoise', ['bandpass', '2500', '1q', 'tremolo', '0.3', '50']), .15),
    ]
    # A low-string figure on the dactylic rhythm of Beethoven's Seventh, second movement, with an original line.
    beat = .79
    rhythm = [beat, beat / 2, beat / 2, beat, beat]
    bars = [['E3'] * 5, ['E3'] * 5, ['F3', 'E3', 'D3', 'C3', 'B2'], ['C3', 'D3', 'E3', 'E3', 'E3']]
    notes = [(note, length) for bar in bars * 2 for note, length in zip(bar, rhythm)]
    parts += phrase(f'{n}-ostinato', notes, 0, .3, attack=.05, release=.25, cutoff='1400')
    parts.append((at(strings(f'{n}-pad', ['A2', 'C3', 'E3'], 13, attack=3, release=3, cutoff='900'), 12.6), .22))
    # Eruption at 5, the ejection rushes toward Earth 8-27, engulfment from 20.
    parts.append((at(noise(f'{n}-eruption-tail', 8, 'brownnoise', ['lowpass', '200', 'fade', 't', '.05', '8', '6']), 5), .8))
    parts.append((at(noise(f'{n}-rush', 19, 'pinknoise', ['bandpass', '600', '.8q', 'tremolo', '0.4', '40', 'fade', 'l', '10', '19', '5']), 8), .6))
    parts.append((at(noise(f'{n}-engulf', 10, 'brownnoise', ['lowpass', '400', 'fade', 'l', '6', '10', '.3']), 20), 1))
    parts.append((at(noise(f'{n}-engulf-air', 10, 'pinknoise', ['lowpass', '2000', 'fade', 'l', '6', '10', '.3']), 20), .8))
    parts.append((at(synth(f'{n}-scream', 10, ['sine', '55:220'], ['fade', 'l', '6', '10', '.3']), 20), .4))
    parts.append((at(noise(f'{n}-shimmer', 10, 'whitenoise', ['highpass', '6000', 'fade', 'l', '6', '10', '.3']), 20), .25))
    bed('knowing', parts)
    cue('knowing-eruption', boom(f'{n}-cue-eruption', 4, '90', '35', '900') + [
        (crackle(f'{n}-cue-eruption-crackle', 4, '0.999', ('bandpass', '2000', '1q', 'fade', 't', '0', '4', '3')), .5)], 4, '-8')
    cue('knowing-engulf', [
        (noise(f'{n}-cue-engulf', 5, 'brownnoise', ['lowpass', '500', 'fade', 't', '.05', '5', '4']), 1),
        (noise(f'{n}-cue-engulf-air', 5, 'pinknoise', ['lowpass', '3000', 'fade', 't', '.05', '5', '4']), .8),
        (synth(f'{n}-cue-engulf-tone', 5, ['sine', '440:1760'], ['tremolo', '5', '30', 'fade', 't', '.5', '5', '4']), .3),
    ], 5, '-8')


def armageddon():
    n = 'arm'
    parts = [
        (synth(f'{n}-drone', 30, ['sine', '55'], ['tremolo', '0.1', '35']), .5),
        (synth(f'{n}-drone2', 30, ['sine', '82.4'], ['tremolo', '0.13', '50']), .4),
        (noise(f'{n}-rock', 30, 'brownnoise', ['lowpass', '140', 'tremolo', '0.4', '50']), .4),
        # Mission clock and comms static until the countdown.
        (expression(f'{n}-clock', 16, 'if(lt(mod(t,1),0.004),1,0)', ['bandpass', '2200', '4q', 'reverb', '30', '40', '30', '0', '0', '-8']), .14),
    ]
    static = noise(f'{n}-static', .5, 'whitenoise', ['bandpass', '1800', '2q', 'tremolo', '9', '80', 'fade', 't', '.02', '.5', '.3'])
    parts += [(at(static, t), .15) for t in (2.3, 5.8, 10.4)]
    # Drilling 6-15, detonation 16, shock 18, fragments diverge.
    parts.append((at(synth(f'{n}-drill', 9, voices(('sawtooth', '48'), ('square', '72')), ['lowpass', '500', 'tremolo', '22', '40', 'fade', 't', '.5', '9', '1']), 6), .35))
    parts.append((at(noise(f'{n}-grind', 9, 'pinknoise', ['bandpass', '1500', '1q', 'tremolo', '25', '60', 'fade', 't', '.5', '9', '1']), 6), .2))
    parts.append((at(noise(f'{n}-detonation-tail', 12, 'brownnoise', ['lowpass', '120', 'fade', 't', '.05', '12', '8']), 16), .9))
    parts.append((at(crackle(f'{n}-fracture', 4, '0.9992', ('bandpass', '900', '1q', 'fade', 't', '0', '4', '2')), 16), .4))
    parts.append((at(noise(f'{n}-shock', 3, 'pinknoise', ['lowpass', '1000', 'fade', 't', '.05', '3', '2.5']), 18), .5))
    parts.append((at(noise(f'{n}-fragments', 10, 'brownnoise', ['bandpass', '200', '2q', 'tremolo', '5', '60', 'fade', 'l', '1', '10', '2']), 20), .35))
    bed('armageddon', parts)
    cue('armageddon-countdown', [
        (expression(f'{n}-cue-beeps', 2.6, 'if(lt(mod(t,1),0.14),1,0)*sin(2*PI*880*t)', ['fade', 't', '0', '2.6', '.2']), 1),
    ], 2.6, '-13', DRY)
    cue('armageddon-detonation', boom(f'{n}-cue-detonation', 5, '90', '26', '800') + [
        (noise(f'{n}-cue-detonation-crack', .4, 'whitenoise', ['bandpass', '1300', '.8q', 'fade', 't', '0', '.4', '.35']), .7)], 5, '-8')
    cue('armageddon-flyby', [
        (noise(f'{n}-cue-flyby', 2, 'pinknoise', ['bandpass', '1400', '1q', 'bend', '0.2,-900,1.6', 'fade', 'h', '.6', '2', '1']), 1),
        (synth(f'{n}-cue-flyby-tone', 2, ['sine', '520:180'], ['fade', 'h', '.6', '2', '1']), .3),
    ], 2, '-10', DRY)


def interstellar():
    n = 'int'
    parts = [
        # A sustained organ cluster, an original progression, swelling over the disk.
        (organ(f'{n}-cluster', ['A2', 'E3', 'A3', 'C4', 'E4', 'B4'], 30, attack=6, release=.5), .5),
        (synth(f'{n}-sub', 30, ['sine', '27.5'], ['tremolo', '0.05', '30']), .5),
        (noise(f'{n}-void', 30, 'brownnoise', ['lowpass', '60']), .25),
        # The clock ticks every 1.25 seconds, then accelerates as the orbit tightens.
        (expression(f'{n}-tick', 17, 'if(lt(mod(t,1.25),0.004),1,0)', ['bandpass', '1500', '4q', 'reverb', '30', '40', '30', '0', '0', '-8']), .25),
        (at(expression(f'{n}-tick-fast', 9, 'if(lt(mod(0.8*t+0.05*t*t,1),0.004),1,0)', ['bandpass', '1500', '4q', 'reverb', '30', '40', '30', '0', '0', '-8']), 17), .25),
        (at(organ(f'{n}-upper', ['E5', 'B5'], 13, attack=3, release=1), 17), .3),
        (at(organ(f'{n}-suspension', ['D5'], 3.2, attack=1.2, release=.6), 20), .28),
        (at(organ(f'{n}-release', ['E5', 'A5'], 7, attack=1, release=1), 23), .3),
        (at(noise(f'{n}-whoosh', 9, 'pinknoise', ['lowpass', '400', 'tremolo', '0.12', '40', 'fade', 'l', '4', '9', '2']), 17), .35),
        # At the event horizon everything sinks into a pedal tone.
        (at(synth(f'{n}-descent', 4, ['sine', '220:27'], ['fade', 't', '.2', '4', '.5']), 26), .5),
        (at(noise(f'{n}-horizon-rumble', 4, 'brownnoise', ['lowpass', '80', 'fade', 'l', '2', '4', '.2']), 26), .8),
        (at(organ(f'{n}-pedal', ['A1'], 4, attack=1, release=.3), 26), .5),
    ]
    bed('interstellar', parts, HALL)
    cue('interstellar-orbit', [
        (organ(f'{n}-cue-swell', ['A3', 'E4', 'B4', 'E5'], 5, attack=2, release=2), .8),
        (noise(f'{n}-cue-whoosh', 5, 'pinknoise', ['lowpass', '500', 'fade', 'h', '2', '5', '2.5']), .6),
    ], 5, '-10', HALL)
    cue('interstellar-horizon', [
        (synth(f'{n}-cue-rise', 4, ['sine', '400:3000'], ['fade', 't', '.5', '4', '1']), .5),
        (synth(f'{n}-cue-drop', 4, ['sine', '110:22'], ['fade', 't', '.05', '4', '3']), .9),
        (noise(f'{n}-cue-horizon-air', 4, 'pinknoise', ['highpass', '2000', 'fade', 'l', '3', '4', '.5']), .3),
    ], 4, '-9', HALL)


def twister():
    n = 'tw'
    parts = [
        (noise(f'{n}-wind', 30, 'pinknoise', ['bandpass', '600', '1.2q', 'tremolo', '0.17', '70']), .55),
        (noise(f'{n}-gust', 30, 'brownnoise', ['lowpass', '300', 'tremolo', '0.31', '80']), .45),
        # A distant tornado siren wails through the sighting, then rain arrives with the wall cloud.
        (at(expression(f'{n}-siren', 10, 'sin(2*PI*560*t+300*sin(2*PI*0.08*t))', ['lowpass', '2200', 'fade', 't', '2', '10', '3']), .5), .08),
        (at(noise(f'{n}-rain', 26, 'whitenoise', ['highpass', '3500', 'lowpass', '9000', 'tremolo', '0.5', '30', 'fade', 'l', '4', '26', '2']), 4), .1),
        # The freight-train roar builds from the descent at 8 until the rope-out.
        (at(noise(f'{n}-roar', 22, 'brownnoise', ['lowpass', '260', 'tremolo', '2.7', '35', 'fade', 'l', '7', '22', '5']), 8), .85),
        (at(noise(f'{n}-roar-mid', 20, 'pinknoise', ['bandpass', '380', '.8q', 'tremolo', '4.5', '40', 'fade', 'l', '6', '20', '5']), 10), .5),
        (at(synth(f'{n}-sub', 20, ['sine', '38:31'], ['tremolo', '0.35', '60', 'fade', 'l', '6', '20', '4']), 10), .5),
        (at(noise(f'{n}-debris', 13, 'brownnoise', ['bandpass', '300', '2q', 'tremolo', '16', '80', 'fade', 'l', '2', '13', '3']), 14), .4),
        # The farmstead comes apart at 16.
        (at(noise(f'{n}-crash', 2.5, 'brownnoise', ['bandpass', '500', '1q', 'tremolo', '20', '90', 'fade', 't', '.01', '2.5', '2.2']), 15.8), .6),
        (at(crackle(f'{n}-splinter', 2, '0.9985', ('bandpass', '2200', '1q', 'fade', 't', '0', '2', '1.6')), 15.9), .35),
    ]
    for path, vol in thunder(f'{n}-thunder', 4.5):
        parts += [(at(path, t), vol * .55) for t in (11.2, 16.6, 21.3)]
    bed('twister', parts)
    cue('twister-thunder', thunder(f'{n}-cue-thunder', 3.5), 3.5, '-8', HALL)
    cue('twister-touchdown', boom(f'{n}-cue-touchdown', 4, '80', '30', '900') + [
        (noise(f'{n}-cue-touchdown-roar', 4, 'pinknoise', ['bandpass', '400', '1q', 'fade', 't', '.05', '4', '3.5']), .6)], 4, '-9')
    cue('twister-crash', [
        (noise(f'{n}-cue-crash', 2.5, 'brownnoise', ['bandpass', '500', '1q', 'tremolo', '20', '90', 'fade', 't', '.01', '2.5', '2.2']), 1),
        (crackle(f'{n}-cue-splinter', 2.5, '0.9985', ('bandpass', '2200', '1q', 'fade', 't', '0', '2.5', '2')), .5),
        (synth(f'{n}-cue-crash-sub', 2.5, ['sine', '70:28'], ['fade', 't', '.01', '2.5', '2.2']), .7),
    ], 2.5, '-10')


def dantes_peak():
    n = 'dp'
    parts = [
        (noise(f'{n}-wind', 30, 'pinknoise', ['bandpass', '900', '1.5q', 'tremolo', '0.15', '60']), .3),
        # Harmonic tremor under the whole eruption; the blast tail and jet roar from 6.
        (at(synth(f'{n}-tremor', 28, ['sine', '34:30'], ['tremolo', '7', '60', 'fade', 'l', '3', '28', '1']), 2), .35),
        (at(noise(f'{n}-blast-tail', 14, 'brownnoise', ['lowpass', '160', 'fade', 't', '.05', '14', '12']), 6), .9),
        (at(noise(f'{n}-jet', 24, 'pinknoise', ['lowpass', '1200', 'tremolo', '0.9', '35', 'fade', 'l', '1', '24', '2']), 6.2), .6),
        # An ominous low string pad, the surge's roar from 13 and ash hiss from 18.
        (at(strings(f'{n}-pad', ['D2', 'A2', 'F3'], 12, attack=4, release=4, cutoff='700'), 9), .22),
        (at(noise(f'{n}-surge', 17, 'brownnoise', ['lowpass', '500', 'tremolo', '1.4', '30', 'fade', 'l', '9', '17', '1']), 13), .8),
        (at(noise(f'{n}-surge-hiss', 17, 'pinknoise', ['bandpass', '2000', '1q', 'tremolo', '2', '40', 'fade', 'l', '9', '17', '1']), 13), .3),
        (at(noise(f'{n}-ash', 12, 'whitenoise', ['bandpass', '5000', '1q', 'tremolo', '7', '30', 'fade', 'l', '5', '12', '1']), 18), .08),
    ]
    rumble = noise(f'{n}-rumble', 2.5, 'brownnoise', ['lowpass', '100', 'fade', 't', '.3', '2.5', '2'])
    parts += [(at(rumble, t), vol) for t, vol in ((1.2, .5), (3.4, .6), (5.1, .8))]
    thud = synth(f'{n}-thud', .7, voices(('sine', '70:35'), ('brownnoise', '100')), ['lowpass', '200', 'fade', 't', '.005', '.7', '.6'])
    parts += [(at(thud, t), .4) for t in (8.1, 9.6, 11.3, 13.7, 15.2, 18.4, 20.9)]
    crack = noise(f'{n}-crack', .4, 'whitenoise', ['highpass', '1200', 'fade', 't', '0', '.4', '.35'])
    parts += [(at(crack, t), .5) for t in (9.4, 12.1, 17.7, 23.5)]
    bed('dantes-peak', parts)
    cue('dantes-peak-eruption', boom(f'{n}-cue-eruption', 5, '85', '24', '700') + [
        (noise(f'{n}-cue-eruption-crack', .5, 'whitenoise', ['bandpass', '1400', '.8q', 'fade', 't', '0', '.5', '.45']), .7),
        (synth(f'{n}-cue-eruption-jet', 5, ['sine', '40:110'], ['tremolo', '9', '40', 'fade', 't', '.1', '5', '4']), .4)], 5, '-8')
    cue('dantes-peak-lightning', thunder(f'{n}-cue-lightning', 2.5), 2.5, '-9', HALL)
    cue('dantes-peak-surge', [
        (noise(f'{n}-cue-surge', 5, 'brownnoise', ['lowpass', '400', 'fade', 't', '.3', '5', '4']), 1),
        (noise(f'{n}-cue-surge-hiss', 5, 'pinknoise', ['bandpass', '1600', '1q', 'fade', 't', '.3', '5', '4']), .5),
    ], 5, '-9')


def gravity():
    n = 'gr'
    parts = [
        (synth(f'{n}-sub', 30, ['sine', '36'], ['tremolo', '0.09', '40']), .45),
        (synth(f'{n}-hum', 30, ['sine', '72'], ['tremolo', '0.3', '30']), .18),
        # Suit breathing at rest, then a faster second layer once the debris hits.
        (noise(f'{n}-breath', 30, 'pinknoise', ['bandpass', '650', '1q', 'tremolo', '0.27', '95']), .28),
        (at(noise(f'{n}-breath-fast', 18, 'pinknoise', ['bandpass', '800', '1q', 'tremolo', '0.55', '95', 'fade', 'l', '4', '18', '2']), 12), .3),
        (at(expression(f'{n}-alert', 2.4, 'if(lt(mod(t,0.6),0.18),1,0)*sin(2*PI*1180*t)', ['fade', 't', '0', '2.4', '.2']), 6), .12),
        # An original rising string figure and a high shimmer carry the cascade.
        (at(strings(f'{n}-rise', ['E2', 'B2', 'E3', 'G3'], 12, attack=6, release=4, cutoff='900'), 8), .25),
        (at(strings(f'{n}-rise2', ['E3', 'G3', 'B3', 'E4'], 10, attack=4, release=5, cutoff='1400'), 16), .25),
        (at(synth(f'{n}-shimmer', 14, voices(('sine', '1760'), ('sine', '2640')), ['tremolo', '0.5', '60', 'fade', 'l', '5', '14', '3']), 10), .06),
        # A heartbeat that quickens, the tumble's rotating whoosh and a thin comms hiss.
        (at(expression(f'{n}-heart', 20, 'if(lt(mod(t*(1+t/50),0.8),0.05),1,0)*sin(2*PI*55*t)+if(lt(mod(t*(1+t/50)-0.18,0.8),0.04),0.7,0)*sin(2*PI*50*t)',
                       ['lowpass', '120', 'fade', 'l', '2', '20', '1']), 10), .35),
        (at(noise(f'{n}-tumble', 8, 'pinknoise', ['bandpass', '350', '1q', 'tremolo', '0.45', '85', 'fade', 'l', '1', '8', '1']), 22), .35),
        (at(noise(f'{n}-hiss', 8, 'whitenoise', ['bandpass', '3000', '2q', 'tremolo', '0.9', '40', 'fade', 'l', '2', '8', '1']), 22), .06),
    ]
    static = noise(f'{n}-static', .5, 'whitenoise', ['bandpass', '1800', '2q', 'tremolo', '9', '80', 'fade', 't', '.02', '.5', '.3'])
    parts += [(at(static, t), .15) for t in (2.3, 4.7, 7.9)]
    # Impacts arrive through the suit: no air, so only thumps and a metallic rattle.
    thump = synth(f'{n}-thump', 1.2, ['sine', '58:24'], ['lowpass', '160', 'fade', 't', '.005', '1.2', '1.1'])
    rattle = noise(f'{n}-rattle', 1.5, 'brownnoise', ['bandpass', '900', '2q', 'tremolo', '30', '90', 'lowpass', '1200', 'fade', 't', '.01', '1.5', '1.3'])
    for t in (11.3, 14.6, 17.9, 20.5):
        parts += [(at(thump, t), .7), (at(rattle, t), .25)]
    bed('gravity', parts, DRY)
    cue('gravity-alert', [
        (expression(f'{n}-cue-alert', 2.6, 'if(lt(mod(t,0.6),0.18),1,0)*sin(2*PI*1180*t)', ['fade', 't', '0', '2.6', '.2']), .8),
        (noise(f'{n}-cue-alert-static', 2.6, 'whitenoise', ['bandpass', '1800', '2q', 'tremolo', '9', '80', 'fade', 't', '.02', '2.6', '2']), .35),
    ], 2.6, '-13', DRY)
    cue('gravity-impact', boom(f'{n}-cue-impact', 2.5, '60', '22', '200') + [
        (noise(f'{n}-cue-rattle', 2.5, 'brownnoise', ['bandpass', '900', '2q', 'tremolo', '30', '90', 'lowpass', '1200', 'fade', 't', '.01', '2.5', '2.2']), .4)], 2.5, '-9', DRY)
    cue('gravity-adrift', [
        (noise(f'{n}-cue-tumble', 5, 'pinknoise', ['bandpass', '350', '1q', 'tremolo', '0.6', '85', 'fade', 't', '.3', '5', '4']), 1),
        (noise(f'{n}-cue-breath', 5, 'pinknoise', ['bandpass', '800', '1q', 'tremolo', '0.7', '95', 'fade', 't', '.3', '5', '4']), .5),
    ], 5, '-11', DRY)


def wandering_earth():
    n = 'we'
    parts = [
        # Planetary engines: a low sawtooth chord, the roar beneath it and plasma hiss above.
        (synth(f'{n}-engine', 30, voices(('sawtooth', '32'), ('sine', '48'), ('sine', '64')), ['lowpass', '220', 'tremolo', '0.11', '35']), .55),
        (noise(f'{n}-roar', 30, 'brownnoise', ['lowpass', '180', 'tremolo', '0.5', '40']), .4),
        (noise(f'{n}-plasma', 30, 'whitenoise', ['bandpass', '2600', '1q', 'tremolo', '0.35', '55']), .1),
        # An original D minor pad that turns to D major for the escape.
        (strings(f'{n}-pad', ['D2', 'A2', 'D3', 'F3'], 22, attack=8, release=5, cutoff='800'), .28),
        (at(strings(f'{n}-pad-major', ['D3', 'F#3', 'A3', 'D4', 'A4'], 8, attack=2.5, release=3, cutoff='1600'), 24), .38),
        # The siphoned atmosphere shimmers 8-22; engines rise to full burn 14-17 and hold.
        (at(synth(f'{n}-stream', 14, voices(('sine', '3100'), ('sine', '4700')), ['tremolo', '9', '85', 'highpass', '2500', 'fade', 'l', '5', '14', '2']), 8), .07),
        (at(noise(f'{n}-stream-air', 14, 'pinknoise', ['bandpass', '1400', '1.5q', 'tremolo', '0.7', '50', 'fade', 'l', '5', '14', '2']), 8), .25),
        (at(noise(f'{n}-ignite', 4, 'pinknoise', ['bandpass', '300', '.8q', 'bend', '0,1400,4', 'fade', 'l', '3', '4', '.3']), 14), .45),
        (at(synth(f'{n}-ignite-tone', 4, ['sine', '55:190'], ['tremolo', '12', '40', 'fade', 'l', '3.2', '4', '.3']), 14), .3),
        (at(synth(f'{n}-burn', 13, voices(('sawtooth', '65'), ('square', '97')), ['lowpass', '420', 'tremolo', '15', '30', 'fade', 'l', '.5', '13', '1']), 17), .28),
        # Jupiter ignites at 22; the shock reaches Earth at 23.5.
        (at(noise(f'{n}-blast-tail', 8, 'brownnoise', ['lowpass', '110', 'fade', 't', '.05', '8', '7']), 22), .9),
        (at(crackle(f'{n}-fracture', 5, '0.9992', ('bandpass', '800', '1q', 'fade', 't', '0', '5', '3')), 22), .3),
        (at(noise(f'{n}-shock', 3, 'pinknoise', ['lowpass', '900', 'fade', 't', '.05', '3', '2.5']), 23.5), .5),
    ]
    bed('wandering-earth', parts, HALL)
    cue('wandering-earth-ignition', [
        (noise(f'{n}-cue-ignite', 3.5, 'pinknoise', ['bandpass', '300', '.8q', 'bend', '0,1600,3.4', 'fade', 'l', '3', '3.5', '.3']), 1),
        (synth(f'{n}-cue-ignite-tone', 3.5, ['sine', '60:220'], ['tremolo', '12', '40', 'fade', 'l', '3', '3.5', '.3']), .6),
    ], 3.5, '-10', HALL)
    cue('wandering-earth-detonation', boom(f'{n}-cue-detonation', 6, '80', '20', '600') + [
        (noise(f'{n}-cue-detonation-crack', .5, 'whitenoise', ['bandpass', '1200', '.8q', 'fade', 't', '0', '.5', '.45']), .7),
        (synth(f'{n}-cue-detonation-sub', 6, ['sine', '30:12'], ['fade', 't', '.05', '6', '5']), .8)], 6, '-8', HALL)
    cue('wandering-earth-escape', [
        (organ(f'{n}-cue-escape', ['D4', 'A4', 'D5'], 4.5, attack=.8, release=2), .8),
        (noise(f'{n}-cue-escape-whoosh', 4.5, 'pinknoise', ['lowpass', '600', 'fade', 'h', '1.5', '4.5', '2.5']), .6),
    ], 4.5, '-11', HALL)


SCENES = [independence_day, deep_impact, day_after_tomorrow, melancholia, terminator_2,
          year_2012, war_of_the_worlds, knowing, armageddon, interstellar,
          twister, dantes_peak, gravity, wandering_earth]


def main(names=()):
    known = {scene.__name__: scene for scene in SCENES}
    unknown = sorted(set(names) - set(known))
    if unknown:
        raise SystemExit(f"Unknown scene functions {unknown}; choose from {sorted(known)}.")
    WORK.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for scene in SCENES:
        if not names or scene.__name__ in names:
            scene()
    files = sorted(path.name for path in OUTPUT.glob('*.mp3') if path.name != 'intro.mp3')
    print(json.dumps({'audio_files': len(files), 'output': str(OUTPUT), 'files': files}))


if __name__ == '__main__':
    main(sys.argv[1:])
