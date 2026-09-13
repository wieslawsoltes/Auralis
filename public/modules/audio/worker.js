import { spectralProcess, deClick, healSelection, timeStretch, pitchShift, pitchCorrect, detectPitch, sincResample } from './restoration.js';
import { processMaster, mixMontage, editPCM, linkedNormalize } from './dsp.js';
import { analyze, prepareDelivery, spectrum } from './analysis.js';
import { encodeWav, decodeWav } from './wav.js';
self.onmessage = ({ data }) => {
    const { id, action, args } = data;
    try {
        let result;
        if (action === 'spectrogram') {
            const width = Math.max(32, Math.min(1000, args.width || 600)), height = Math.max(32, Math.min(512, args.height || 220)), pixels = new Uint8ClampedArray(width * height * 4);
            for (let x = 0; x < width; x++) {
                const bins = spectrum(args.channels, args.windowSize===1024?x*1024:Math.floor(x / width * Math.max(0, args.channels[0].length - 1024)), 1024);
                for (let y = 0; y < height; y++) {
                    const k = Math.floor((1 - y / height) ** 2 * (bins.length - 1)), v = Math.max(0, Math.min(1, (bins[k] + 100) / 90)), i = (y * width + x) * 4;
                    pixels[i] = Math.round(12 + 240 * Math.max(0, (v - .35) / .65));
                    pixels[i + 1] = Math.round(15 + 220 * v * v);
                    pixels[i + 2] = Math.round(28 + 170 * Math.sin(v * Math.PI));
                    pixels[i + 3] = 255;
                }
            }
            result = { width, height, pixels };
        }
        else if (action === 'restore') {
            const { channels, sampleRate, operation, options } = args;
            result = operation === 'declick' ? deClick(channels, sampleRate, options) : operation === 'heal' ? healSelection(channels, sampleRate, options) : spectralProcess(channels, sampleRate, { ...options, operation });
        }
        else if (action === 'resample')
            result = sincResample(args.channels, args.length);
        else if (action === 'stretch')
            result = timeStretch(args.channels, args.sampleRate, args.ratio);
        else if (action === 'pitch')
            result = pitchShift(args.channels, args.sampleRate, args.semitones);
        else if (action === 'correct')
            result = pitchCorrect(args.channels, args.sampleRate, args.options);
        else if (action === 'detect-pitch')
            result = detectPitch(args.channels, args.sampleRate, args.options);
        else if (action === 'analyze')
            result = analyze(args.channels, args.sampleRate, args.options);
        else if (action === 'edit') {
            result = args.action === 'normalize' ? linkedNormalize(args.channels, args.amount) : editPCM(args.channels, args.start, args.end, args.action, args.amount);
        }
        else if (action === 'render' || action === 'finalize') {
            const assets = new Map(args.assets || []);
            let channels = action === 'finalize' ? args.channels : processMaster(mixMontage(args.project, assets, args.sampleRate, args.start, args.end), args.sampleRate, args.project.effects);
            let delivery;
            if (args.options.delivery) {
                const prepared = prepareDelivery(channels, args.sampleRate, args.options.delivery);
                channels = prepared.channels;
                delivery = prepared.report;
            }
            const buffer = encodeWav(channels, args.sampleRate, args.options), measured = analyze(decodeWav(buffer).channels, args.sampleRate, { measureTruePeak: !!delivery });
            if (delivery) {
                delivery.after = measured;
                delivery.peakPass = measured.truePeak <= delivery.ceiling + .001;
                delivery.loudnessPass = measured.integrated !== null && Math.abs(measured.integrated - delivery.target) <= .1;
                if (!delivery.peakPass)
                    throw Error('Encoded output failed the requested true-peak ceiling.');
            }
            result = { buffer, analysis: measured, delivery };
        }
        else
            throw Error('Unknown worker action');
        if (result?.buffer instanceof ArrayBuffer)
            self.postMessage({ id, result }, [result.buffer]);
        else
            self.postMessage({ id, result });
    }
    catch (e) {
        self.postMessage({ id, error: e.message });
    }
};
