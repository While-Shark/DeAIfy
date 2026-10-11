import type { Plugin } from 'vite';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { shouldProtectChunk } from './protectionRules';

/**
 * Browser code is inspectable by design. This only increases copying effort;
 * it is never used as a payment, entitlement, or secret-protection boundary.
 */
export function protectClientBundle(
  projectRoot: string = process.cwd(),
  requireFirstPartyChunk = true,
): Plugin {
  let protectedCount = 0;

  return {
    name: 'deaify-app-only-js-obfuscation',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      protectedCount = 0;
    },
    renderChunk(code, chunk) {
      if (!shouldProtectChunk(chunk.modules, projectRoot)) return null;

      // Preserve ES module links, app events and the browser runtime. Stronger
      // anti-debug/VM transforms have high regression and accessibility costs.
      const result = JavaScriptObfuscator.obfuscate(code, {
        target: 'browser',
        compact: true,
        sourceMap: false,
        renameGlobals: false,
        renameProperties: false,
        identifierNamesGenerator: 'hexadecimal',
        stringArray: true,
        stringArrayThreshold: 0.55,
        stringArrayEncoding: ['base64'],
        stringArrayShuffle: true,
        stringArrayRotate: true,
        stringArrayCallsTransform: false,
        reservedStrings: ['^\\./', '^/assets/', '^https?://'],
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        selfDefending: false,
        disableConsoleOutput: false,
        splitStrings: false,
        seed: 2026,
      });

      const protectedCode = result.getObfuscatedCode();
      if (protectedCode === code || protectedCode.length < 64) {
        this.error('First-party JavaScript was not changed by the obfuscator.');
      }
      protectedCount++;
      return { code: protectedCode, map: null };
    },
    generateBundle() {
      if (requireFirstPartyChunk && protectedCount === 0) {
        this.error('No first-party JS chunk was obfuscated. Check Vite output splitting.');
      }
      this.info('Protected ' + protectedCount + ' first-party JS chunk(s). Third-party modules and ML inference were left intact.');
    },
  };
}
