import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'account_deletion_attempt.dart';
import 'account_deletion_diagnostics.dart';
import 'account_deletion_preparation.dart';
import 'account_deletion_progress.dart';
import 'deletion_write_policy.dart';
import 'l10n/text.dart';
import 'timed_operation_gateway.dart';
import 'read_tracking_controller.dart';

final _deletionRuns = <String, Future<AccountDeletionOutcome?>>{};
void _logAccountDeletionFailure(String stage, Object error) => debugPrint(
  'ShoutOut account deletion: stage=$stage code=${accountDeletionDiagnosticCode(error)}',
);
final _preparation = AccountDeletionPreparationGateway(
  currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
  send: (request) async {
    Object? result;
    final transport = TimedOperationGateway(
      currentUserId: () => FirebaseAuth.instance.currentUser?.uid,
      issuedAt: (userId) async {
        final user = FirebaseAuth.instance.currentUser;
        if (user?.uid != userId) throw AccountDeletionIdentityChanged();
        final token = await user!.getIdTokenResult().timeout(
          const Duration(seconds: 20),
        );
        final time = token.issuedAtTime;
        if (time == null) throw StateError('operation-clock-unavailable');
        return time;
      },
      send: (operation, payload) async {
        result = (await FirebaseFunctions.instanceFor(
          region: 'europe-west3',
        ).httpsCallable(operation).call(payload)).data;
      },
    );
    await transport.call(
      attempt: request.timedAttempt,
      userId: request.userId,
      operation: 'prepareAccountDeletion',
      payload: request.toPayload(),
    );
    return result;
  },
);

typedef AccountDeletionStatus = ({
  String userId,
  Map<String, dynamic>? data,
  bool isFromCache,
  bool hasPendingWrites,
});

Future<String?> confirmAccountDeletionPassword(
  BuildContext context, {
  bool resume = false,
}) => showDialog<String>(
  context: context,
  builder: (_) => _AccountDeletionPasswordDialog(resume: resume),
);

class _AccountDeletionPasswordDialog extends StatefulWidget {
  const _AccountDeletionPasswordDialog({required this.resume});
  final bool resume;
  @override
  State<_AccountDeletionPasswordDialog> createState() =>
      _AccountDeletionPasswordDialogState();
}

class _AccountDeletionPasswordDialogState
    extends State<_AccountDeletionPasswordDialog> {
  final _password = TextEditingController();
  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    scrollable: true,
    title: Text(
      tr(
        context,
        widget.resume ? 'Pokračovat ve smazání účtu' : 'Smazat účet?',
      ),
    ),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          tr(context, 'Tento krok nenávratně smaže váš účet.'),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        if (!widget.resume) ...[
          Text(
            tr(
              context,
              'Přihlášení bude odstraněno ihned a tento e-mail půjde znovu použít. Archivní a bezpečnostní záznamy zůstanou 60 dní, potom budou odstraněny nebo anonymizovány.',
            ),
          ),
          const SizedBox(height: 16),
        ],
        TextField(
          controller: _password,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(labelText: tr(context, 'Potvrď heslo')),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(tr(context, 'Zrušit')),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, _password.text),
        child: Text(
          tr(context, widget.resume ? 'Pokračovat' : 'Požádat o smazání'),
        ),
      ),
    ],
  );
}

Future<AccountDeletionOutcome?> resumePendingAccountDeletion(
  BuildContext context,
  User user,
) => requestAccountDeletion(context, user, resume: true);

/// The first attempt and the pending-request gate share this flow and UI latch.
Future<AccountDeletionOutcome?> requestAccountDeletion(
  BuildContext context,
  User user, {
  bool resume = false,
}) {
  final running = _deletionRuns[user.uid];
  if (running != null) return running;
  final future = _requestAccountDeletion(context, user, resume: resume);
  _deletionRuns[user.uid] = future;
  return future.whenComplete(() => _deletionRuns.remove(user.uid));
}

Future<AccountDeletionOutcome?> _requestAccountDeletion(
  BuildContext context,
  User user, {
  required bool resume,
}) async {
  try {
    final password = await confirmAccountDeletionPassword(
      context,
      resume: resume,
    );
    if (password == null ||
        !context.mounted ||
        FirebaseAuth.instance.currentUser?.uid != user.uid) {
      return null;
    }
    final policy = DeletionWritePolicy.current;
    final attempt = AccountDeletionAttempt(
      user.uid,
      FirebaseAccountDeletionTransport(
        auth: FirebaseAuth.instance,
        firestore: FirebaseFirestore.instance,
        user: user,
        onIntentConfirmed: () => readSessions.eraseAccount(user.uid),
        finalizeIntent: policy.finalization
            ? () async =>
                  (await FirebaseFunctions.instanceFor(region: 'europe-west3')
                          .httpsCallable('finalizeAccountDeletion')
                          .call({'expectedUserId': user.uid}))
                      .data
            : null,
        prepareBeforeIntent: resume
            ? null
            : () async {
                if (policy.preparation) {
                  await _preparation.prepare(user.uid);
                } else {
                  await hideActiveShoutsBeforeAccountDeletion(user.uid);
                }
              },
      ),
      onFailure: _logAccountDeletionFailure,
    );
    final outcome = await runAccountDeletionWithProgress(
      context,
      userId: user.uid,
      identities: FirebaseAuth.instance.authStateChanges().map(
        (user) => user?.uid,
      ),
      operation: () async {
        final outcome = await attempt.run(password);
        if ((outcome == AccountDeletionOutcome.completed ||
                outcome == AccountDeletionOutcome.confirmedByServer) &&
            FirebaseAuth.instance.currentUser?.uid == user.uid) {
          await FirebaseAuth.instance.signOut();
        }
        return outcome;
      },
    );
    if (outcome == AccountDeletionOutcome.pending &&
        context.mounted &&
        FirebaseAuth.instance.currentUser?.uid == user.uid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context, 'Smazání se nepodařilo dokončit. Zkus to znovu.'),
          ),
        ),
      );
    }
    return outcome;
  } on FirebaseAuthException catch (error) {
    _logAccountDeletionFailure('flow-auth', error);
    if (context.mounted && FirebaseAuth.instance.currentUser?.uid == user.uid) {
      final message =
          error.code == 'wrong-password' || error.code == 'invalid-credential'
          ? 'Heslo není správné.'
          : 'Smazání se nepodařilo dokončit. Zkus to znovu.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(tr(context, message))));
    }
    return null;
  } on AccountDeletionIdentityChanged {
    return null;
  } catch (error) {
    _logAccountDeletionFailure('flow', error);
    if (context.mounted && FirebaseAuth.instance.currentUser?.uid == user.uid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context, 'Smazání se nepodařilo dokončit. Zkus to znovu.'),
          ),
        ),
      );
    }
    return null;
  }
}

Future<void> hideActiveShoutsBeforeAccountDeletion(String userId) async {
  final firestore = FirebaseFirestore.instance;
  void guardIdentity() {
    if (FirebaseAuth.instance.currentUser?.uid != userId) {
      throw AccountDeletionIdentityChanged();
    }
  }

  while (true) {
    guardIdentity();
    final page = await firestore
        .collection('shouts')
        .where('authorId', isEqualTo: userId)
        .where('status', isEqualTo: 'active')
        .limit(50)
        .get(const GetOptions(source: Source.server));
    guardIdentity();
    if (page.docs.isEmpty) return;
    final batch = firestore.batch();
    for (final shout in page.docs) {
      batch.update(shout.reference, {'status': 'deleted'});
    }
    guardIdentity();
    await batch.commit();
    guardIdentity();
  }
}
