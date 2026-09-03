const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Teaches the generated Android project how to sign a release build.
 *
 * Expo's prebuild template points the release build type at the *debug*
 * signing config, so a plain `assembleRelease` produces an APK signed with the
 * throwaway debug key. That installs, but it is not a release build in any
 * meaningful sense and Play will not take it.
 *
 * This adds a real release config fed from Gradle properties, and only uses it
 * when those properties are present — so `assembleRelease` still works on a
 * machine with no keystore, exactly as it did before. The properties come from
 * the environment in CI (ORG_GRADLE_PROJECT_LOOPHOLE_*), or from
 * ~/.gradle/gradle.properties locally.
 *
 * android/ is generated and not committed, which is why this is a plugin
 * rather than an edit: it has to be reapplied on every prebuild.
 */

const MARKER = '// loophole:release-signing';

const SIGNING_CONFIG = `
        release {
            ${MARKER}
            if (project.hasProperty('LOOPHOLE_STORE_FILE')) {
                storeFile file(LOOPHOLE_STORE_FILE)
                storePassword LOOPHOLE_STORE_PASSWORD
                keyAlias LOOPHOLE_KEY_ALIAS
                keyPassword LOOPHOLE_KEY_PASSWORD
            }
        }
`;

/** Pick the release key when one is configured, else fall back to debug. */
const SIGNING_CHOICE =
  `signingConfig project.hasProperty('LOOPHOLE_STORE_FILE') ` +
  `? signingConfigs.release : signingConfigs.debug ${MARKER}`;

function patch(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  // Add the release config as a sibling of the debug one. The template always
  // opens signingConfigs with a debug block, so that brace is the anchor.
  const configs = gradle.indexOf('signingConfigs {');
  if (configs === -1) {
    throw new Error('withReleaseSigning: no signingConfigs block in app/build.gradle');
  }
  const openBrace = gradle.indexOf('{', configs);
  gradle = gradle.slice(0, openBrace + 1) + SIGNING_CONFIG + gradle.slice(openBrace + 1);

  // Repoint the release build type. The template line is
  // `signingConfig signingConfigs.debug` inside `release { … }`.
  const release = gradle.indexOf('release {', gradle.indexOf('buildTypes {'));
  if (release === -1) {
    throw new Error('withReleaseSigning: no release build type in app/build.gradle');
  }
  const line = gradle.indexOf('signingConfig signingConfigs.debug', release);
  if (line === -1) {
    throw new Error('withReleaseSigning: release build type does not use the debug signing config');
  }
  return (
    gradle.slice(0, line) +
    SIGNING_CHOICE +
    gradle.slice(line + 'signingConfig signingConfigs.debug'.length)
  );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy app/build.gradle');
    }
    cfg.modResults.contents = patch(cfg.modResults.contents);
    return cfg;
  });
};

// Exported so the unit test can drive the string surgery without a prebuild.
module.exports.patch = patch;
