import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { patch } = require('./withReleaseSigning.js') as { patch: (gradle: string) => string };

/**
 * The shape `expo prebuild` emits for SDK 57, trimmed to the two blocks the
 * plugin touches. If a future SDK changes either, these tests fail here rather
 * than by shipping a debug-signed APK labelled "release".
 */
const TEMPLATE = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('withReleaseSigning', () => {
  const patched = patch(TEMPLATE);

  it('adds a release signing config beside the debug one', () => {
    expect(patched).toContain("storeFile file(LOOPHOLE_STORE_FILE)");
    // The debug config has to survive — debug builds still use it.
    expect(patched).toContain("storeFile file('debug.keystore')");
  });

  it('repoints the release build type away from the debug key', () => {
    const buildTypes = patched.slice(patched.indexOf('buildTypes {'));
    expect(buildTypes).toContain(
      "signingConfig project.hasProperty('LOOPHOLE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    // The only remaining bare `signingConfigs.debug` in buildTypes is the
    // debug build type's own.
    expect(buildTypes.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
  });

  it('leaves the debug build type alone', () => {
    const debugBlock = patched.slice(patched.indexOf('debug {', patched.indexOf('buildTypes {')));
    expect(debugBlock.slice(0, debugBlock.indexOf('release {'))).toContain(
      'signingConfig signingConfigs.debug',
    );
  });

  it('is idempotent, since prebuild may run over its own output', () => {
    expect(patch(patched)).toBe(patched);
  });

  it('refuses a gradle file it does not recognise rather than passing it through', () => {
    expect(() => patch('android {\n}\n')).toThrow(/signingConfigs/);
    expect(() => patch('signingConfigs {\n debug {}\n}\nbuildTypes {\n debug {}\n}')).toThrow(
      /release build type/,
    );
  });
});
