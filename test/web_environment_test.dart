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

  Map<String, dynamic> production() {
    final config = development();
    config['environment'] = 'prod';
    config['appUrl'] = 'https://go.shoutout-app.eu';
    config['hostingSite'] = 'example-shoutout-live';
    config['firebase']['projectId'] = 'shoutout-production-a1b34';
    config['firebase']['messagingSenderId'] = '123456789000';
    config['firebase']['appId'] = '1:123456789000:web:abc123';
    config['firebase']['authDomain'] =
        'shoutout-production-a1b34.firebaseapp.com';
    config['firebase']['storageBucket'] =
        'shoutout-production-a1b34.firebasestorage.app';
    return config;
  }

  test('production accepts the shared project with a separate app site', () {
    final environment = WebEnvironment.fromJson(production());
    expect(environment.firebaseOptions.projectId, 'shoutout-production-a1b34');
    expect(environment.hostingSite, 'example-shoutout-live');
  });

  test('server publishing requires a valid web App Check configuration', () {
    final withoutAppCheck = development()
      ..remove('appCheckSiteKey')
      ..['serverCommentCreation'] = false
      ..['serverPrivateReplyCreation'] = false;
    final defaultConfig = development()..remove('serverShoutCreation');
    expect(WebEnvironment.fromJson(defaultConfig).serverShoutCreation, isFalse);
    for (final change in [
      {'serverShoutCreation': true},
      {'serverShoutCreation': 'true'},
      {'appCheckSiteKey': ''},
    ]) {
      expect(
        () => WebEnvironment.fromJson({...withoutAppCheck, ...change}),
        throwsStateError,
      );
    }
    final environment = WebEnvironment.fromJson({
      ...development(),
      'appCheckSiteKey': 'test-only-recaptcha-enterprise-key',
      'serverShoutCreation': true,
    });
    expect(environment.serverShoutCreation, isTrue);
  });

  test('server comments are independent and require App Check', () {
    final config = development()..remove('serverCommentCreation');
    expect(WebEnvironment.fromJson(config).serverCommentCreation, isFalse);
    expect(
      WebEnvironment.fromJson({
        ...config,
        'serverCommentCreation': true,
      }).serverCommentCreation,
      isTrue,
    );
    for (final invalid in [
      {...config, 'serverCommentCreation': 'true'},
      {
        ...config,
        'appCheckSiteKey': null,
        'serverShoutCreation': false,
        'serverCommentCreation': true,
        'serverPrivateReplyCreation': false,
      },
    ]) {
      expect(() => WebEnvironment.fromJson(invalid), throwsStateError);
    }
  });

  test(
    'private reply gateway defaults off and requires independent App Check validation',
    () {
      final config = development()..remove('serverPrivateReplyCreation');
      expect(
        WebEnvironment.fromJson(config).serverPrivateReplyCreation,
        isFalse,
      );
      expect(
        WebEnvironment.fromJson({
          ...config,
          'serverPrivateReplyCreation': true,
        }).serverPrivateReplyCreation,
        isTrue,
      );
      for (final invalid in [
        {...config, 'serverPrivateReplyCreation': 'true'},
        {
          ...config,
          'appCheckSiteKey': null,
          'serverShoutCreation': false,
          'serverCommentCreation': false,
          'serverPrivateReplyCreation': true,
        },
      ]) {
        expect(() => WebEnvironment.fromJson(invalid), throwsStateError);
      }
    },
  );

  test('production refuses development and unapproved projects', () {
    for (final project in ['shoutout-dev-46c81', 'unapproved-project']) {
      final config = production();
      config['firebase']['projectId'] = project;
      config['firebase']['authDomain'] = '$project.firebaseapp.com';
      config['firebase']['storageBucket'] = '$project.firebasestorage.app';
      expect(() => WebEnvironment.fromJson(config), throwsStateError);
    }
  });

  test(
    'production refuses the landing site, development site and missing site',
    () {
      for (final site in [
        'shoutout-production-a1b34',
        'shoutout-dev-46c81',
        '',
      ]) {
        final config = production();
        config['hostingSite'] = site;
        expect(() => WebEnvironment.fromJson(config), throwsStateError);
      }
    },
  );

  test('production uses the go domain and refuses other hosts', () {
    final environment = WebEnvironment.fromJson(production());
    expect(
      () => environment.validateHost('go.shoutout-app.eu'),
      returnsNormally,
    );
    for (final host in [
      'shoutout-dev-46c81.web.app',
      'shoutout-app.eu',
      'localhost',
    ]) {
      expect(() => environment.validateHost(host), throwsStateError);
    }
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
