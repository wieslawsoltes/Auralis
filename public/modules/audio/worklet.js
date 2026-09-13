import { MasterProcessor } from './dsp.js';
class AuralisMaster extends AudioWorkletProcessor {
    constructor(options) { super(); this.dsp = new MasterProcessor(sampleRate, 2, options.processorOptions.config); this.port.onmessage = e => { if (e.data.config)
        this.dsp.setConfig(e.data.config); }; }
    process(inputs, outputs) { if (!outputs[0]?.length)
        return true; this.dsp.process(inputs[0] || [], outputs[0]); return true; }
}
registerProcessor('auralis-master', AuralisMaster);
