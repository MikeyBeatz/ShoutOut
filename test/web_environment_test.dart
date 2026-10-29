import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/web_environment.dart';

void main() {
  test(
    'content reports default off and independently require a boolean and App Check',
    () {
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
                as Map<String, dynamic>
            ..remove('serverContentReports');
      expect(WebEnvironment.fromJson(config).serverContentReports, isFalse);
      expect(
        WebEnvironment.fromJson({
          ...config,
          'serverContentReports': true,
        }).serverContentReports,
        isTrue,
      );
      for (final invalid in [null, 'true', 1, <String, dynamic>{}]) {
        expect(
          () => WebEnvironment.fromJson({
            ...config,
            'serverContentReports': invalid,
          }),
          throwsStateError,
        );
      }
      final withoutAppCheck = {
        ...config,
        'serverShoutCreation': false,
        'serverCommentCreation': false,
        'serverPrivateReplyCreation': false,
        'serverShoutReactions': false,
        'serverCommentReactions': false,
        'serverShoutSaves': false,
      }..remove('appCheckSiteKey');
      expect(
        WebEnvironment.fromJson(withoutAppCheck).serverContentReports,
        isFalse,
      );
      expect(
        () => WebEnvironment.fromJson({
          ...withoutAppCheck,
          'serverContentReports': true,
        }),
        throwsStateError,
      );
    },
  );
  test(
    'Shout saves default off and independently require App Check and a boolean',
    () {
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
                as Map<String, dynamic>
            ..remove('serverShoutSaves');
      expect(WebEnvironment.fromJson(config).serverShoutSaves, isFalse);
      expect(
        WebEnvironment.fromJson({
          ...config,
          'serverShoutSaves': true,
        }).serverShoutSaves,
        isTrue,
      );
      expect(
        () => WebEnvironment.fromJson({...config, 'serverShoutSaves': 'true'}),
        throwsStateError,
      );
      final withoutAppCheck = {
        ...config,
        'serverShoutCreation': false,
        'serverCommentCreation': false,
        'serverPrivateReplyCreation': false,
        'serverShoutReactions': false,
        'serverCommentReactions': false,
      }..remove('appCheckSiteKey');
      expect(
        WebEnvironment.fromJson(withoutAppCheck).serverShoutSaves,
        isFalse,
      );
      expect(
        () => WebEnvironment.fromJson({
          ...withoutAppCheck,
          'serverShoutSaves': true,
        }),
        throwsStateError,
      );
    },
  );
  test(
    'comment reactions are independently optional and require App Check',
    () {
      final config =
          jsonDecode(File('config/dev.json').readAsStringSync())
                as Map<String, dynamic>
            ..remove('serverCommentReactions');
      expect(WebEnvironment.fromJson(config).serverCommentReactions, isFalse);
      expect(
        WebEnvironment.fromJson({
          ...config,
          'serverCommentReactions': true,
        }).serverCommentReactions,
        isTrue,
      );
      expect(
        () => WebEnvironment.fromJson({
          ...config,
          'serverCommentReactions': 'true',
        }),
        throwsStateError,
      );
      expect(
        () => WebEnvironment.fromJson({
          ...config,
          'appCheckSiteKey': null,
          'serverShoutSaves': false,
          'serverShoutCreation': false,
          'serverCommentCreation': false,
          'serverPrivateReplyCreation': false,
          'serverShoutReactions': false,
          'serverCommentReactions': true,
        }),
        throwsStateError,
      );
    },
  );
  test('Shout reaction gateway defaults off and requires App Check', () {
    final config =
        jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>
          ..remove('serverShoutReactions');
    expect(WebEnvironment.fromJson(config).serverShoutReactions, isFalse);
    expect(
      WebEnvironment.fromJson({
        ...config,
        'serverShoutReactions': true,
      }).serverShoutReactions,
      isTrue,
    );
    for (final invalid in [
      {...config, 'serverShoutReactions': 'true'},
      {
        ...config,
        'appCheckSiteKey': null,
        'serverShoutSaves': false,
        'serverShoutCreation': false,
        'serverCommentCreation': false,
        'serverPrivateReplyCreation': false,
        'serverShoutReactions': true,
        'serverCommentReactions': false,
      },
    ]) {
      expect(() => WebEnvironment.fromJson(invalid), throwsStateError);
    }
  });
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
      ..['serverShoutSaves'] = false
      ..['serverCommentCreation'] = false
      ..['serverShoutReactions'] = false
      ..['serverCommentReactions'] = false
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
        'serverShoutSaves': false,
        'serverShoutCreation': false,
        'serverCommentCreation': true,
        'serverPrivateReplyCreation': false,
        'serverShoutReactions': false,
        'serverCommentReactions': false,
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
          'serverShoutSaves': false,
          'serverShoutCreation': false,
          'serverCommentCreation': false,
          'serverPrivateReplyCreation': true,
          'serverShoutReactions': false,
          'serverCommentReactions': false,
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
