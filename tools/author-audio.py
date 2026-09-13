"""Original cinematic synthesis via SoX, finished with FFmpeg. No sampled film audio."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work' / 'media-audio'
OUTPUT = ROOT / 'dist' / 'assets' / 'audio'


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True, stdout=subprocess.DEVNULL)


def layer(name, duration, oscillator, frequency, effects):
    target = WORK / f'{name}.wav'
    run('sox', '-R', '-n', '-r', '44100', '-b', '16', target,
        'synth', duration, oscillator, frequency, *effects, 'gain', '-n', '-12')
    return target


def finish(name, inputs, duration, peak, fade):
    mixed = WORK / f'{name}-mix.wav'
    # Stereo decorrelation is quiet, finite and baked into a single static file.
    run('sox', '-R', '-m', *inputs, '-c', '2', mixed,
        'gain', '-n', '-6', 'reverb', '35', '35', '60', '80', '0', '-7',
        'trim', '0', duration, 'fade', 't', fade, duration, fade,
        'gain', '-n', peak)
    run('ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', mixed,
        '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k',
        '-map_metadata', '-1', OUTPUT / f'{name}.mp3')


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    beds = {
        'alien-drone': [('sine', '46', ['tremolo', '0.3', '65']), ('sine', '69', ['tremolo', '1.2', '30']), ('brownnoise', '100', ['lowpass', '450'])],
        'ocean-storm': [('pinknoise', '100', ['lowpass', '1800', 'tremolo', '0.14', '85']), ('brownnoise', '100', ['lowpass', '250', 'tremolo', '0.23', '60'])],
        'ice-wind': [('pinknoise', '100', ['bandpass', '720', '1.4q', 'tremolo', '0.19', '75']), ('sine', '174', ['tremolo', '0.1', '95'])],
        'cosmic-drone': [('sine', '55', ['tremolo', '0.1', '35']), ('sine', '82.4', ['tremolo', '0.13', '50']), ('sine', '110.2', ['tremolo', '0.17', '70'])],
        'seismic-rumble': [('brownnoise', '100', ['lowpass', '180', 'tremolo', '1.7', '65']), ('sine', '38', ['tremolo', '0.2', '85'])],
        'machine-pulse': [('sine', '62', ['tremolo', '1.1', '90']), ('sawtooth', '93', ['lowpass', '300', 'tremolo', '0.55', '95'])],
        'solar-roar': [('pinknoise', '100', ['lowpass', '750', 'tremolo', '0.2', '45']), ('sine', '41', ['tremolo', '0.1', '60'])],
    }
    for name, layers in beds.items():
        paths = [layer(f'{name}-{i}', 30, kind, freq, effects) for i, (kind, freq, effects) in enumerate(layers)]
        finish(name, paths, 30, '-12', '0.5')
    cues = {
        'impact': (4, [('sine', '95:28', ['fade', 't', '.01', '4', '3.5']), ('brownnoise', '100', ['lowpass', '1200', 'fade', 't', '.01', '4', '3.8'])]),
        'fracture': (2.5, [('pinknoise', '100', ['bandpass', '1100', '0.7q', 'tremolo', '13', '80', 'fade', 't', '.01', '2.5', '2.2']), ('sine', '120:35', ['fade', 't', '.01', '2.5', '2'])]),
        'charge': (5, [('sine', '70:280', ['tremolo', '4', '60']), ('pinknoise', '100', ['bandpass', '600', '1q', 'fade', 't', '4', '5', '.5'])]),
    }
    for name, (duration, layers) in cues.items():
        paths = [layer(f'{name}-{i}', duration, kind, freq, effects) for i, (kind, freq, effects) in enumerate(layers)]
        finish(name, paths, duration, '-8' if name == 'impact' else '-12', '.015')
    print(json.dumps({'audio_files': len(beds) + len(cues), 'output': str(OUTPUT)}))


if __name__ == '__main__':
    main()
