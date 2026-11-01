import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/archived_comment_target.dart';
import 'package:shoutout/web_environment.dart';

void main() {
  test(
    'reported comment view restores the original content timestamp and drops undeclared payload',
    () {
      final target = decodeArchivedCommentTarget({
        'archived': true,
        'targetData': {
          'authorId': 'author',
          'authorNickname': 'Original name',
          'text': 'Original text',
          'createdAtMillis': 1793530000000,
          'privateMetadata': 'must not appear',
        },
      });
      expect(
        target['createdAt'],
        Timestamp.fromMillisecondsSinceEpoch(1793530000000),
      );
      expect(target['text'], 'Original text');
      expect(target.containsKey('privateMetadata'), isFalse);
    },
  );

  test('invalid archive protocol never becomes a report target', () {
    for (final response in [
      null,
      {},
      {'archived': false},
      {
        'archived': true,
        'targetData': {'authorId': 'a', 'text': 'x', 'createdAtMillis': '1'},
      },
    ]) {
      expect(() => decodeArchivedCommentTarget(response), throwsStateError);
    }
  });

  test('archive lookup defaults off and requires a boolean and App Check', () {
    final config =
        jsonDecode(File('config/dev.json').readAsStringSync())
            as Map<String, dynamic>;
    config.remove('serverArchivedReportLookup');
    expect(WebEnvironment.fromJson(config).serverArchivedReportLookup, isFalse);
    expect(
      WebEnvironment.fromJson({
        ...config,
        'serverArchivedReportLookup': true,
      }).serverArchivedReportLookup,
      isTrue,
    );
    for (final invalid in [null, 'true', 1]) {
      expect(
        () => WebEnvironment.fromJson({
          ...config,
          'serverArchivedReportLookup': invalid,
        }),
        throwsStateError,
      );
    }
    expect(
      () => WebEnvironment.fromJson(
        {...config, 'serverArchivedReportLookup': true}
          ..remove('appCheckSiteKey'),
      ),
      throwsStateError,
    );
  });
}
