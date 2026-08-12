import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/app_theme.dart';

void main() {
  test('profile theme values map to Flutter theme modes', () {
    expect(themeModeFromProfile('light'), ThemeMode.light);
    expect(themeModeFromProfile('dark'), ThemeMode.dark);
    expect(themeModeFromProfile('system'), ThemeMode.system);
    expect(themeModeFromProfile(null), ThemeMode.system);
    expect(themeModeFromProfile('unsupported'), ThemeMode.system);

    for (final mode in ThemeMode.values) {
      expect(themeModeFromProfile(profileValueFromThemeMode(mode)), mode);
    }
  });
}
