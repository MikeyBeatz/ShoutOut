import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';

/// Public web configuration, supplied by the checked build workflow.
class WebEnvironment {
  WebEnvironment.fromJson(Map<String, dynamic> json)
    : name = json['environment'] as String? ?? '',
      appUrl = json['appUrl'] as String? ?? '',
      hostingSite = json['hostingSite'] as String? ?? '',
      firebase = Map<String, dynamic>.from(json['firebase'] as Map? ?? {}) {
    if (!['dev', 'prod'].contains(name)) {
      throw StateError('Choose a configured dev or prod web environment.');
    }
    final key = json['appCheckSiteKey'];
    final gateway = json['serverShoutCreation'];
    final commentsGateway = json['serverCommentCreation'];
    final privateRepliesGateway = json['serverPrivateReplyCreation'];
    final reactionsGateway = json['serverShoutReactions'];
    if (key != null &&
        (key is! String || !RegExp(r'^[A-Za-z0-9_-]{20,200}$').hasMatch(key))) {
      throw StateError('Invalid reCAPTCHA Enterprise site key.');
    }
    if (gateway != null && gateway is! bool) {
      throw StateError('serverShoutCreation must be a boolean.');
    }
    if (commentsGateway != null && commentsGateway is! bool) {
      throw StateError('serverCommentCreation must be a boolean.');
    }
    if (privateRepliesGateway != null && privateRepliesGateway is! bool) {
      throw StateError('serverPrivateReplyCreation must be a boolean.');
    }
    appCheckSiteKey = key as String?;
    if (reactionsGateway != null && reactionsGateway is! bool) {
      throw StateError('serverShoutReactions must be a boolean.');
    }
    serverShoutReactions = reactionsGateway == true;
    if (serverShoutReactions && key == null) {
      throw StateError('Server Shout reactions require web App Check.');
    }
    serverShoutCreation = gateway == true;
    serverCommentCreation = commentsGateway == true;
    serverPrivateReplyCreation = privateRepliesGateway == true;
    if (serverShoutCreation && appCheckSiteKey == null) {
      throw StateError('Server Shout creation requires web App Check.');
    }
    if (serverCommentCreation && appCheckSiteKey == null) {
      throw StateError('Server comment creation requires web App Check.');
    }
    if (serverPrivateReplyCreation && appCheckSiteKey == null) {
      throw StateError('Server private replies require web App Check.');
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
            hostingSite != 'shoutout-dev-46c81' ||
            appUrl != 'https://shoutout-dev-46c81.web.app')) {
      throw StateError('Development configuration must use the dev project.');
    }
    if (name == 'prod' &&
        (project != 'shoutout-production-a1b34' ||
            !RegExp(r'^[a-z0-9][a-z0-9-]*$').hasMatch(hostingSite) ||
            [
              'shoutout-dev-46c81',
              'shoutout-production-a1b34',
            ].contains(hostingSite) ||
            firebase['messagingSenderId'] == '696035472864' ||
            appUrl != 'https://go.shoutout-app.eu')) {
      throw StateError(
        'Production requires the shared project, a separate app Hosting site and go domain.',
      );
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
  final String hostingSite;
  final Map<String, dynamic> firebase;
  late final String? appCheckSiteKey;
  late final bool serverShoutCreation;
  late final bool serverCommentCreation;
  late final bool serverPrivateReplyCreation;
  late final bool serverShoutReactions;

  FirebaseOptions get firebaseOptions => FirebaseOptions(
    apiKey: firebase['apiKey'] as String,
    appId: firebase['appId'] as String,
    messagingSenderId: firebase['messagingSenderId'] as String,
    projectId: firebase['projectId'] as String,
    authDomain: firebase['authDomain'] as String,
    storageBucket: firebase['storageBucket'] as String,
  );
}
