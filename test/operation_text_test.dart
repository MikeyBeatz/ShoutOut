import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/l10n/operation_text.dart';

void main() {
  test(
    'expired attempts have recovery instructions in all seven supported languages',
    () {
      final error = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'operation-expired',
      );
      final messages = [
        for (final language in ['cs', 'en', 'de', 'pl', 'sk', 'uk', 'vi'])
          expiredOperationText(error, language),
      ];
      expect(messages, everyElement(isNotNull));
      expect(messages.toSet().length, 7);
      expect(expiredOperationText(error, 'en'), contains('Reload the app'));
      expect(expiredOperationText(error, 'unknown'), messages.first);
    },
  );

  test(
    'upgrade refusal has the same recovery hint and unrelated failures retain their existing messages',
    () {
      expect(
        expiredOperationText(
          FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'operation-key-upgrade-required',
          ),
          'cs',
        ),
        contains('Obnov aplikaci'),
      );
      expect(
        expiredOperationText(
          FirebaseFunctionsException(code: 'unavailable', message: 'offline'),
          'cs',
        ),
        isNull,
      );
      expect(
        expiredOperationText(StateError('operation-expired'), 'cs'),
        isNull,
      );
      expect(expiredOperationText(null, 'cs'), isNull);
    },
  );
}
