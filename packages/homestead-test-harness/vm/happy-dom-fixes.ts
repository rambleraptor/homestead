/**
 * Patches for happy-dom behavior that diverges from real browsers in ways the
 * SPA trips over. Each is the browser's behavior, not a test shortcut.
 */

interface ValidityWithElement {
  element: HTMLInputElement;
}

/**
 * happy-dom computes `stepMismatch` as `value % step !== 0`, which floating
 * point gets wrong for fractional steps (`250 % 0.01` is not 0), so any
 * `step="0.01"` money input with a whole-dollar value blocks its form's
 * submit. Browsers check that `(value - stepBase) / step` is an integer.
 */
function fixStepMismatch(win: { ValidityState: { prototype: object } }): void {
  Object.defineProperty(win.ValidityState.prototype, 'stepMismatch', {
    configurable: true,
    get(this: ValidityWithElement) {
      const el = this.element;
      if (el.localName !== 'input' || (el.type !== 'number' && el.type !== 'range')) return false;
      if (el.value === '') return false;
      const stepAttr = el.getAttribute('step');
      if (stepAttr === 'any') return false;
      const step = stepAttr === null ? 1 : Number(stepAttr);
      if (!(step > 0)) return false;
      const base = el.hasAttribute('min') ? Number(el.getAttribute('min')) || 0 : 0;
      const steps = (Number(el.value) - base) / step;
      return Math.abs(steps - Math.round(steps)) > 1e-7;
    },
  });
}

export function applyHappyDomFixes(win: { ValidityState: { prototype: object } }): void {
  fixStepMismatch(win);
}
