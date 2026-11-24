import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shoutout/business_access_scope.dart';
import 'package:shoutout/address_autocomplete.dart';
import 'package:shoutout/business_application_state.dart';
import 'package:shoutout/business_registration.dart';
import 'package:shoutout/business_review_dialog.dart';
import 'package:shoutout/business_review_gateway.dart';
import 'package:shoutout/web_environment.dart';

Map<String, dynamic> decision() => {
  'decision': 'approve',
  'expectedRevision': 0,
  'note': '',
};
Matcher code(String value) =>
    isA<FirebaseFunctionsException>().having((e) => e.code, 'code', value);
Map<String, dynamic> application() => {
  'countryCode': 'CZ',
  'registrationNumber': '12345678',
  'submittedCompanyName': 'Synthetic Company',
  'submittedAddress': 'Test 12',
  'submittedCity': 'Test City',
  'submittedPostalCode': '12345',
  'initialLocationName': 'Synthetic branch',
  'initialLocationAddress': 'Test 12',
  'initialLocationCity': 'Test City',
  'initialLocationPostalCode': '12345',
  'initialLocationCountryCode': 'CZ',
  'initialLocationProviderPlaceId': 'fixture',
  'initialLocation': {'latitude': 50.53, 'longitude': 14.13},
  'contactEmail': 'fixture@example.test',
};

void main() {
  test(
    'Business config enables only DEV and requires a strict App Check gate',
    () {
      final dev =
          jsonDecode(File('config/dev.json').readAsStringSync())
              as Map<String, dynamic>;
      expect(WebEnvironment.fromJson(dev).serverBusinessReview, true);
      expect(
        WebEnvironment.fromJson(
          jsonDecode(File('config/prod.json').readAsStringSync())
              as Map<String, dynamic>,
        ).serverBusinessReview,
        false,
      );
      for (final value in [null, 'true', 1]) {
        expect(
          () =>
              WebEnvironment.fromJson({...dev, 'serverBusinessReview': value}),
          throwsStateError,
        );
      }
      final disabled = {
        ...dev,
        for (final key in dev.keys.where((k) => k.startsWith('server')))
          key: false,
      }..remove('appCheckSiteKey');
      expect(
        () => WebEnvironment.fromJson({
          ...disabled,
          'serverBusinessReview': true,
        }),
        throwsStateError,
      );
    },
  );

  test(
    'unknown result freezes nested payload, coalesces clicks and retries the exact attempt',
    () async {
      final first = Completer<void>();
      final sent = <BusinessReviewRequest>[];
      final gateway = BusinessReviewGateway(
        currentUserId: () => 'applicant',
        newKey: () => 'same-key',
        send: (r) {
          sent.add(r);
          return sent.length == 1 ? first.future : Future.value();
        },
      );
      final body = {
        'decision': 'resubmit',
        'expectedRevision': 1,
        'application': application(),
      };
      final flight = gateway.execute(
        userId: 'applicant',
        applicationId: 'applicant',
        payload: body,
      );
      final duplicate = gateway.execute(
        userId: 'applicant',
        applicationId: 'applicant',
        payload: body,
      );
      expect(identical(flight, duplicate), true);
      final failure = expectLater(flight, throwsA(isA<TimeoutException>()));
      (body['application'] as Map)['submittedCity'] = 'Changed later';
      first.completeError(TimeoutException('lost response'));
      await failure;
      final pending = gateway.pending('applicant', 'applicant')!;
      expect(
        (pending.payload['application'] as Map)['submittedCity'],
        'Test City',
      );
      expect(
        () => (pending.payload['application'] as Map)['submittedCity'] =
            'mutated',
        throwsUnsupportedError,
      );
      await expectLater(
        gateway.execute(
          userId: 'applicant',
          applicationId: 'applicant',
          payload: body,
        ),
        throwsA(code('already-exists')),
      );
      await gateway.retry(pending);
      expect(identical(sent[0], sent[1]), true);
      expect(sent[1].toPayload()['expectedUserId'], 'applicant');
      expect(gateway.pending('applicant', 'applicant'), null);
    },
  );

  test(
    'definitive rejection releases the request and rejects forged client authority',
    () async {
      var sends = 0;
      final gateway = BusinessReviewGateway(
        currentUserId: () => 'admin',
        send: (_) async {
          sends++;
          throw FirebaseFunctionsException(
            code: 'permission-denied',
            message: 'Denied',
          );
        },
      );
      await expectLater(
        gateway.execute(
          userId: 'admin',
          applicationId: 'target',
          payload: decision(),
        ),
        throwsA(code('permission-denied')),
      );
      expect(gateway.pending('admin', 'target'), null);
      await expectLater(
        gateway.execute(
          userId: 'admin',
          applicationId: 'target',
          payload: {...decision(), 'expectedUserId': 'other'},
        ),
        throwsA(code('invalid-argument')),
      );
      expect(sends, 1);
    },
  );

  test(
    'account switch A to B to A cannot revive an old request or report stale success',
    () async {
      var viewer = 'A';
      final completion = Completer<void>();
      final gateway = BusinessReviewGateway(
        currentUserId: () => viewer,
        send: (_) => completion.future,
      );
      final flight = gateway.execute(
        userId: 'A',
        applicationId: 'target',
        payload: decision(),
      );
      final request = gateway.pending('A', 'target')!;
      final failed = expectLater(flight, throwsA(code('unauthenticated')));
      viewer = 'B';
      gateway.retainViewer(viewer);
      viewer = 'A';
      gateway.retainViewer(viewer);
      completion.complete();
      await failed;
      expect(gateway.pending('A', 'target'), null);
      await expectLater(
        gateway.retry(request),
        throwsA(code('unauthenticated')),
      );
    },
  );

  test(
    'suspended application opens navigation only with enabled flow and trusted Business profile',
    () {
      expect(requiresBusinessActivationChecks('suspended'), false);
      expect(
        requiresBusinessActivationChecks('suspended', allowSuspended: true),
        true,
      );
      for (final enabled in [false, true]) {
        for (final role in [
          null,
          const {'role': 'business', 'level': 2},
        ]) {
          expect(
            resolveBusinessApplicationGateState(
              applicationExists: true,
              businessProfileExists: true,
              businessProfile: const {'status': 'suspended'},
              role: role,
              allowSuspended: enabled,
            ),
            enabled && role != null
                ? BusinessApplicationGateState.suspendedBusiness
                : BusinessApplicationGateState.awaitingActivation,
          );
        }
      }
    },
  );

  Future<void> showReview(
    WidgetTester tester, {
    required Future<void> Function(String, String) submit,
    bool Function()? pending,
    bool Function()? current,
    String action = 'reject',
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showDialog<bool>(
                context: context,
                barrierDismissible: false,
                builder: (_) => BusinessReviewDialog(
                  applicationId: 'target',
                  decisions: [action],
                  submit: submit,
                  isCurrent: current ?? () => true,
                  hasPending: pending ?? () => false,
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'reason is required; busy dialog blocks repeat submit and navigation',
    (tester) async {
      final result = Completer<void>();
      var calls = 0;
      await showReview(
        tester,
        submit: (_, reason) {
          calls++;
          expect(reason, 'Concrete reason');
          return result.future;
        },
      );
      await tester.tap(find.text('Uložit rozhodnutí'));
      await tester.pump();
      expect(calls, 0);
      expect(find.text('Uveď konkrétní důvod rozhodnutí.'), findsOneWidget);
      await tester.enterText(find.byType(TextField), ' Concrete reason ');
      await tester.tap(find.text('Uložit rozhodnutí'));
      await tester.pump();
      expect(calls, 1);
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Zpět'))
            .onPressed,
        null,
      );
      expect(tester.widget<PopScope>(find.byType(PopScope).last).canPop, false);
      result.complete();
      await tester.pumpAndSettle();
      expect(find.byType(BusinessReviewDialog), findsNothing);
    },
  );
  testWidgets(
    'uncertain dialog freezes edits and retries original; cancel never submits',
    (tester) async {
      var pending = false, calls = 0;
      await showReview(
        tester,
        pending: () => pending,
        submit: (_, _) async {
          calls++;
          if (calls == 1) {
            pending = true;
            throw TimeoutException('lost');
          }
          pending = false;
        },
      );
      await tester.tap(find.text('Zpět'));
      await tester.pumpAndSettle();
      expect(calls, 0);
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Keep this reason');
      await tester.tap(find.text('Uložit rozhodnutí'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, false);
      await tester.tap(find.text('Zopakovat původní požadavek'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.byType(BusinessReviewDialog), findsNothing);
    },
  );
  testWidgets(
    'suspension preserves child state and access while exposing reason and publication restriction',
    (tester) async {
      final active = ValueNotifier(true);
      addTearDown(active.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: ValueListenableBuilder<bool>(
            valueListenable: active,
            builder: (_, allowed, _) => BusinessAccessBoundary(
              publishingAllowed: allowed,
              reason: 'Review required',
              child: const _PersistentChild(),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Profile 0 true'));
      await tester.pump();
      active.value = false;
      await tester.pumpAndSettle();
      expect(find.text('Profile 1 false'), findsOneWidget);
      expect(find.text(businessSuspendedLabel), findsOneWidget);
      expect(find.text('Review required'), findsNothing);
      await tester.tap(find.text('Detail'));
      await tester.pumpAndSettle();
      expect(find.text('Pozastavení Business účtu'), findsOneWidget);
      expect(find.text('Review required'), findsOneWidget);
      await tester.tap(find.text('Zavřít'));
      await tester.pumpAndSettle();
      active.value = true;
      await tester.pumpAndSettle();
      expect(find.text('Profile 1 true'), findsOneWidget);
    },
  );
  testWidgets(
    'rejected form keeps original fields, has no password and submits no identity/privilege metadata',
    (tester) async {
      Map<String, dynamic>? sent;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => BusinessRegistrationPage(
                      initialApplication: application(),
                      onResubmit: (fields) async => sent = fields,
                    ),
                  ),
                ),
                child: const Text('Edit'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();
      final fields = tester
          .widgetList<TextFormField>(find.byType(TextFormField))
          .toList();
      final inputs = tester
          .widgetList<TextField>(find.byType(TextField))
          .toList();
      expect(inputs.any((f) => f.obscureText), false);
      expect(
        inputs
            .singleWhere((f) => f.controller?.text == 'fixture@example.test')
            .readOnly,
        true,
      );
      expect(
        fields.any((f) => f.controller?.text == 'Synthetic Company'),
        true,
      );
      final submit = find.widgetWithText(
        FilledButton,
        'Odeslat opravenou žádost',
      );
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(sent, isNotNull);
      expect(sent!['initialLocation'], {'latitude': 50.53, 'longitude': 14.13});
      for (final field in [
        'contactEmail',
        'initialLocationGeohash',
        'role',
        'userId',
        'revision',
        'status',
      ]) {
        expect(sent!.containsKey(field), false);
      }
      expect(find.byType(BusinessRegistrationPage), findsNothing);
    },
  );
  testWidgets(
    'correction freezes every editable field after uncertain submission and reuses unchanged fields',
    (tester) async {
      var pending = false;
      final sent = <Map<String, dynamic>>[];
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessRegistrationPage(
            initialApplication: application(),
            hasPending: () => pending,
            onResubmit: (fields) async {
              sent.add(fields);
              pending = true;
              throw TimeoutException('uncertain response');
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final submit = find.widgetWithText(
        FilledButton,
        'Odeslat opravenou žádost',
      );
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(sent.length, 1);
      expect(
        tester
            .widgetList<AddressAutocompleteField>(
              find.byType(AddressAutocompleteField),
            )
            .every((field) => !field.enabled),
        true,
      );
      expect(
        tester
            .widgetList<TextFormField>(find.byType(TextFormField))
            .every((field) => field.enabled == false),
        true,
      );
      await tester.tap(find.text('Zopakovat původní požadavek'));
      await tester.pumpAndSettle();
      expect(sent.length, 2);
      expect(sent[1], sent[0]);
    },
  );
  testWidgets(
    'a signed-out moderator cannot submit through a still-open dark dialog',
    (tester) async {
      var current = true, calls = 0;
      await showReview(
        tester,
        action: 'approve',
        current: () => current,
        submit: (_, _) async {
          calls++;
        },
      );
      current = false;
      await tester.tap(find.text('Uložit rozhodnutí'));
      await tester.pumpAndSettle();
      expect(calls, 0);
      await tester.tap(find.text('Zpět'));
      await tester.pumpAndSettle();
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: BusinessAccessBoundary(
            publishingAllowed: false,
            reason: 'Reason',
            child: const _PersistentChild(),
          ),
        ),
      );
      expect(find.text('Profile 0 false'), findsOneWidget);
      expect(tester.takeException(), null);
    },
  );
}

class _PersistentChild extends StatefulWidget {
  const _PersistentChild();
  @override
  State<_PersistentChild> createState() => _PersistentChildState();
}

class _PersistentChildState extends State<_PersistentChild> {
  int count = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: TextButton(
      onPressed: () => setState(() => count++),
      child: Text(
        'Profile $count ${BusinessAccessScope.maybeOf(context)?.publishingAllowed}',
      ),
    ),
  );
}
