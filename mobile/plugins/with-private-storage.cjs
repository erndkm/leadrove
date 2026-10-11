const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

// allowBackup alone does not disable device transfers on every Android 12+ device.
const domains = ['root', 'file', 'database', 'sharedpref', 'external',
  'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const exclusions = domains.map(domain => `    <exclude domain="${domain}" path="."/>`).join('\n');

module.exports = function withPrivateStorage(config) {
  config = withAppBuildGradle(config, next => {
    // Expo's template signs release builds with the public debug key by default.
    // EAS or the developer must supply actual release signing credentials.
    next.modResults.contents = next.modResults.contents.replace(
      /(\brelease\s*\{[\s\S]*?)^\s*signingConfig signingConfigs\.debug\s*$/m,
      '$1            // Release signing is configured by EAS or your private keystore.');
    return next;
  });
  config = withAndroidManifest(config, next => {
    const app = next.modResults.manifest.application[0].$;
    app['android:allowBackup'] = 'false';
    app['android:fullBackupContent'] = '@xml/leadrove_backup_rules';
    app['android:dataExtractionRules'] = '@xml/leadrove_data_extraction_rules';
    app['android:usesCleartextTraffic'] = 'false';
    return next;
  });
  return withDangerousMod(config, ['android', async next => {
    const directory = join(next.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'leadrove_backup_rules.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${exclusions}\n</full-backup-content>\n`);
    await writeFile(join(directory, 'leadrove_data_extraction_rules.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`);
    return next;
  }]);
};
