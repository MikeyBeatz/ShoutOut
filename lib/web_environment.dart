import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';

/// Public web configuration, supplied by the checked build workflow.
class WebEnvironment {
  WebEnvironment.fromJson(Map<String, dynamic> json)
    : name = json['environment'] as String? ?? '',
      appUrl = json['appUrl'] as String? ?? '',
      firebase = Map<String, dynamic>.from(json['firebase'] as Map? ?? {}) {
    if (!['dev', 'prod'].contains(name)) {
      throw StateError('Choose a configured dev or prod web environment.');
    }
    for (final key in [
      'apiKey',
      'appId',
      'messagingSenderId',
      'projectId',
      'authDomain',
      'storageBucket',
    ]) {
      if (firebase[key] is! String ||
          (firebase[key] as String).trim().isEmpty) {
        throw StateError('Missing Firebase configuration: $key');
      }
    }
    final project = firebase['projectId'];
    if (!RegExp(r'^[a-z][a-z0-9-]{4,28}[a-z0-9]$').hasMatch(project)) {
      throw StateError('Invalid Firebase project ID.');
    }
    if (name == 'dev' &&
        (project != 'shoutout-dev-46c81' ||
            appUrl != 'https://shoutout-dev-46c81.web.app')) {
      throw StateError('Development configuration must use the dev project.');
    }
    if (name == 'prod' &&
        ([
              'shoutout-dev-46c81',
              'shoutout-production-a1b34',
            ].contains(project) ||
            firebase['messagingSenderId'] == '696035472864' ||
            appUrl != 'https://go.shoutout-app.eu')) {
      throw StateError('Production requires its own project and go domain.');
    }
    if (firebase['authDomain'] != '$project.firebaseapp.com' ||
        !RegExp(r'^1:\d+:web:[a-zA-Z0-9]+$').hasMatch(firebase['appId']) ||
        !(firebase['appId'] as String).startsWith(
          '1:${firebase['messagingSenderId']}:web:',
        ) ||
        ![
          '$project.firebasestorage.app',
          '$project.appspot.com',
        ].contains(firebase['storageBucket'])) {
      throw StateError(
        'Firebase web configuration does not match its project.',
      );
    }
  }

  static WebEnvironment get current {
    const raw = String.fromEnvironment('SHOUTOUT_CONFIG');
    if (raw.isEmpty) {
      throw StateError(
        'Prepare the web environment with tools/web_environment.mjs.',
      );
    }
    final environment = WebEnvironment.fromJson(
      jsonDecode(raw) as Map<String, dynamic>,
    );
    environment.validateHost(Uri.base.host);
    return environment;
  }

  void validateHost(String host) {
    final allowed = name == 'dev'
        ? [
            'localhost',
            '127.0.0.1',
            '::1',
            'shoutout-dev-46c81.web.app',
            'shoutout-dev-46c81.firebaseapp.com',
          ]
        : ['go.shoutout-app.eu'];
    if (!allowed.contains(host)) {
      throw StateError('Web host does not match the selected environment.');
    }
  }

  final String name;
  final String appUrl;
  final Map<String, dynamic> firebase;

  FirebaseOptions get firebaseOptions => FirebaseOptions(
    apiKey: firebase['apiKey'] as String,
    appId: firebase['appId'] as String,
    messagingSenderId: firebase['messagingSenderId'] as String,
    projectId: firebase['projectId'] as String,
    authDomain: firebase['authDomain'] as String,
    storageBucket: firebase['storageBucket'] as String,
  );
}
