import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/legal.dart';

void main() {
  LegalAcceptanceState status({
    bool? exists,
    bool cached = false,
    bool pending = false,
    bool error = false,
  }) => legalAcceptanceState(
    exists: exists,
    isFromCache: cached,
    hasPendingWrites: pending,
    hasError: error,
  );

  test('missing cache never requests consent before server confirmation', () {
    expect(status(), LegalAcceptanceState.checking);
    expect(status(exists: false, cached: true), LegalAcceptanceState.checking);
    expect(status(exists: false), LegalAcceptanceState.required);
  });

  test(
    'a known acceptance works offline but an unacknowledged write does not',
    () {
      expect(status(exists: true, cached: true), LegalAcceptanceState.accepted);
      expect(status(exists: true), LegalAcceptanceState.accepted);
      expect(
        status(exists: true, pending: true),
        LegalAcceptanceState.checking,
      );
      expect(
        status(exists: false, pending: true),
        LegalAcceptanceState.checking,
      );
    },
  );

  test('a stream error does not become consent or accepted access', () {
    expect(
      status(exists: false, error: true),
      LegalAcceptanceState.unavailable,
    );
    expect(status(exists: true, error: true), LegalAcceptanceState.unavailable);
  });

  testWidgets('slow connection never flashes consent for an existing user', (
    tester,
  ) async {
    var consentBuilds = 0;
    Future<void> show(LegalAcceptanceState state) => tester.pumpWidget(
      MaterialApp(
        home: LegalAcceptanceStateView(
          state: state,
          requestAcceptance: (_) {
            consentBuilds++;
            return const Text('consent');
          },
          child: const Text('application'),
        ),
      ),
    );
    await show(status(exists: false, cached: true));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(consentBuilds, 0);
    await show(status(exists: true));
    expect(find.text('application'), findsOneWidget);
    expect(consentBuilds, 0);
    await show(status(exists: false));
    expect(find.text('consent'), findsOneWidget);
    expect(consentBuilds, 1);
    await show(status(error: true));
    expect(find.text('consent'), findsNothing);
    expect(find.text('application'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(consentBuilds, 1);
  });
}
