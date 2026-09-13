/** Native, accessible reusable mastering controls; no runtime dependencies. */
export class AudioKnob extends HTMLElement {
    static get observedAttributes() { return ['value', 'min', 'max', 'label', 'unit', 'disabled', 'step']; }
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() { this.render(); }
    attributeChangedCallback(name) { if (!this.isConnected)
        return; if (name === 'value' && this.shadowRoot.querySelector('input'))
        this.update();
    else
        this.render(); }
    get value() { const v = Number(this.getAttribute('value') || 0); return Number.isFinite(v) ? v : 0; }
    set value(v) { if (Number.isFinite(Number(v)))
        this.setAttribute('value', String(Math.max(this.min, Math.min(this.max, Number(v))))); }
    get min() { return Number(this.getAttribute('min') || -24); }
    get max() { return Number(this.getAttribute('max') || 24); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { this.toggleAttribute('disabled', !!v); }
    emit() { this.dispatchEvent(new CustomEvent('valuechange', { bubbles: true, composed: true, detail: { value: this.value } })); }
    gesture(type) { this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true })); }
    setInput(v) { if (this.disabled)
        return; const step = Number(this.getAttribute('step') || .1); const before = this.value; this.value = Math.round(v / step) * step; if (this.value !== before)
        this.emit(); }
    update() { const value = this.value, min = this.min, max = this.max, root = this.shadowRoot; root.querySelector('input[type=range]').value = value; const number = root.querySelector('input[type=number]'); if (number !== root.activeElement)
        number.value = Number(value.toFixed(4)); const dial = root.querySelector('.dial'); dial.style.setProperty('--angle', (-135 + (value - min) / (max - min) * 270) + 'deg'); dial.setAttribute('aria-valuenow', value); dial.setAttribute('aria-valuetext', value.toFixed(1) + ' ' + (this.getAttribute('unit') || 'dB')); }
    render() { const min = this.min, max = this.max, step = Number(this.getAttribute('step') || .1), label = this.getAttribute('label') || 'Gain', unit = this.getAttribute('unit') || 'dB'; this.shadowRoot.innerHTML = `<style>:host{display:inline-flex;width:76px;flex-direction:column;align-items:center;color:inherit;font:11px system-ui}:host([disabled]){opacity:.4}.dial{width:32px;height:32px;border-radius:50%;background:var(--knob-surface,#33435a);border:1px solid var(--knob-border,#647892);position:relative;box-shadow:0 2px 4px #0005;touch-action:none;cursor:ns-resize}.dial:after{content:'';position:absolute;left:14px;top:4px;height:9px;width:2px;background:var(--accent,#85baff);transform-origin:1px 11px;transform:rotate(var(--angle,-135deg))}.dial:focus-visible{outline:2px solid var(--accent,#85baff);outline-offset:3px}.name{color:var(--muted,#a4b3c8);font-size:10px;margin:5px 0 2px}input[type=range]{width:58px;height:9px;margin:2px 0;accent-color:var(--accent,#85baff)}.numeric{display:flex;align-items:center;gap:2px;font:10px ui-monospace;color:var(--text,#d0dfef);max-width:76px}input[type=number]{font:10px ui-monospace;width:44px;text-align:right;color:inherit;background:transparent;border:1px solid transparent;border-radius:2px;padding:2px 0;appearance:textfield;-moz-appearance:textfield}input[type=number]::-webkit-inner-spin-button{display:none}input[type=number]:focus{border-color:var(--accent,#85baff);outline:0;background:var(--bg,#182332)}.unit{font-size:9px}</style><div class="dial" part="dial" role="slider" tabindex="${this.disabled ? -1 : 0}" aria-valuemin="${min}" aria-valuemax="${max}"></div><span class="name" part="label"></span><input type="range" min="${min}" max="${max}" step="${step}" ${this.disabled ? 'disabled' : ''}><div class="numeric"><input type="number" min="${min}" max="${max}" step="${step}" ${this.disabled ? 'disabled' : ''}><span class="unit"></span></div>`; const root = this.shadowRoot, dial = root.querySelector('.dial'), range = root.querySelector('[type=range]'), number = root.querySelector('[type=number]'); root.querySelector('.name').textContent = label; root.querySelector('.unit').textContent = unit; dial.setAttribute('aria-label', label + ' knob'); range.setAttribute('aria-label', label); number.setAttribute('aria-label', label + ' numeric value'); range.onpointerdown = () => this.gesture('gesturestart'); range.oninput = e => this.setInput(Number(e.target.value)); range.onchange = () => this.gesture('gestureend'); number.onfocus = () => this.gesture('gesturestart'); number.oninput = () => { if (number.value !== '' && number.checkValidity())
        this.setInput(Number(number.value)); }; number.onchange = () => { if (number.checkValidity())
        this.setInput(Number(number.value));
    else
        this.update(); this.gesture('gestureend'); }; number.onkeydown = e => { if (e.key === 'Enter') {
        e.preventDefault();
        number.blur();
    } }; let drag = null; dial.onpointerdown = e => { if (this.disabled || e.button !== 0)
        return; e.preventDefault(); drag = { y: e.clientY, value: this.value }; dial.setPointerCapture(e.pointerId); this.gesture('gesturestart'); }; dial.onpointermove = e => { if (drag)
        this.setInput(drag.value + (drag.y - e.clientY) * (max - min) / (e.shiftKey ? 1600 : 160)); }; dial.onpointerup = () => { drag = null; this.gesture('gestureend'); }; dial.onpointercancel = () => { drag = null; this.gesture('gestureend'); }; dial.ondblclick = () => { this.gesture('gesturestart'); this.setInput(Number(this.getAttribute('default') || 0)); this.gesture('gestureend'); }; dial.onkeydown = e => { const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key]; if (d) {
        e.preventDefault();
        this.setInput(this.value + d * step * (e.shiftKey ? .1 : 1));
    } if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        this.setInput(e.key === 'Home' ? min : max);
    } }; dial.onkeyup = () => this.gesture('gestureend'); this.update(); }
}
if (!customElements.get('audio-knob'))
    customElements.define('audio-knob', AudioKnob);
export function drawSpectrum(canvas, values, { floor = -100, color = '#c8df91' } = {}) {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    const w = r.width, h = r.height;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#344047';
    c.lineWidth = .5;
    for (let i = 1; i < 5; i++) {
        c.beginPath();
        c.moveTo(0, h * i / 5);
        c.lineTo(w, h * i / 5);
        c.stroke();
    }
    if (!values?.length)
        return;
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x < w; x++) {
        const bin = Math.min(values.length - 1, Math.floor((Math.exp(x / w * Math.log(values.length)) - 1)));
        const y = h - (Math.max(floor, values[bin]) - floor) / (-floor) * h;
        c.lineTo(x, Math.max(0, y));
    }
    c.lineTo(w, h);
    c.closePath();
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '80');
    grad.addColorStop(1, color + '05');
    c.fillStyle = grad;
    c.fill();
    c.strokeStyle = color;
    c.stroke();
}
