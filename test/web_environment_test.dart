import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/web_environment.dart';

void main() {
  test('web initialization has no implicit development fallback', () {
    expect(() => WebEnvironment.current, throwsStateError);
  });

  Map<String, dynamic> development() =>
      jsonDecode(File('config/dev.json').readAsStringSync())
          as Map<String, dynamic>;

  test('web configuration keeps Firebase and email return URL together', () {
    final environment = WebEnvironment.fromJson(development());
    expect(environment.firebaseOptions.projectId, 'shoutout-dev-46c81');
    expect(environment.appUrl, 'https://shoutout-dev-46c81.web.app');
    expect(() => environment.validateHost('localhost'), returnsNormally);
    expect(
      () => environment.validateHost('shoutout-dev-46c81.web.app'),
      returnsNormally,
    );
    expect(
      () => environment.validateHost('go.shoutout-app.eu'),
      throwsStateError,
    );
  });

  test('production refuses development and presentation projects', () {
    for (final project in ['shoutout-dev-46c81', 'shoutout-production-a1b34']) {
      final config = development();
      config['environment'] = 'prod';
      config['appUrl'] = 'https://go.shoutout-app.eu';
      config['firebase']['projectId'] = project;
      expect(() => WebEnvironment.fromJson(config), throwsStateError);
    }
  });

  test('production uses the go domain and refuses development hosts', () {
    final config = development();
    config['environment'] = 'prod';
    config['appUrl'] = 'https://go.shoutout-app.eu';
    config['firebase']['projectId'] = 'example-shoutout-live';
    config['firebase']['messagingSenderId'] = '123456789000';
    config['firebase']['appId'] = '1:123456789000:web:abc123';
    config['firebase']['authDomain'] = 'example-shoutout-live.firebaseapp.com';
    config['firebase']['storageBucket'] =
        'example-shoutout-live.firebasestorage.app';
    final environment = WebEnvironment.fromJson(config);
    expect(
      () => environment.validateHost('go.shoutout-app.eu'),
      returnsNormally,
    );
    expect(
      () => environment.validateHost('shoutout-dev-46c81.web.app'),
      throwsStateError,
    );
    expect(() => environment.validateHost('localhost'), throwsStateError);
  });

  test('incomplete or inconsistent configuration is rejected', () {
    expect(() => WebEnvironment.fromJson({}), throwsStateError);
    for (final field in [
      'apiKey',
      'appId',
      'projectId',
      'authDomain',
      'storageBucket',
    ]) {
      final config = development();
      config['firebase'][field] = '';
      expect(() => WebEnvironment.fromJson(config), throwsStateError);
    }
    final config = development();
    config['firebase']['messagingSenderId'] = '0';
    expect(() => WebEnvironment.fromJson(config), throwsStateError);
  });
}
