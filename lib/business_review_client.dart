import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'business_review_gateway.dart';
import 'timed_operation_gateway.dart';
import 'web_environment.dart';

bool get useServerBusinessReview =>
    kIsWeb && WebEnvironment.current.serverBusinessReview;
final _businessTimedGateway = TimedOperationGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  issuedAt: (uid) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || user.uid != uid) {
      throw FirebaseFunctionsException(
        code: 'unauthenticated',
        message: 'The signed-in account changed.',
      );
    }
    final metadata = await user.getIdTokenResult().timeout(
      const Duration(seconds: 20),
    );
    final issuedAt = metadata.issuedAtTime;
    if (issuedAt == null) {
      throw FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'operation-clock-unavailable',
      );
    }
    return issuedAt;
  },
  send: (operation, payload) async {
    await FirebaseFunctions.instanceFor(
      region: 'europe-west3',
    ).httpsCallable(operation).call(payload);
  },
);
final businessReviewClient = BusinessReviewGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) => _businessTimedGateway.call(
    attempt: request.timedAttempt,
    userId: request.userId,
    operation: 'reviewBusinessApplication',
    payload: request.toPayload(),
  ),
);
