import 'package:cloud_firestore/cloud_firestore.dart';

Future<void> hideActiveShoutsBeforeAccountDeletion(String userId) async {
  final firestore = FirebaseFirestore.instance;
  while (true) {
    final page = await firestore
        .collection('shouts')
        .where('authorId', isEqualTo: userId)
        .where('status', isEqualTo: 'active')
        .limit(50)
        .get(const GetOptions(source: Source.server));
    if (page.docs.isEmpty) return;
    final batch = firestore.batch();
    for (final shout in page.docs) {
      batch.update(shout.reference, {'status': 'deleted'});
    }
    await batch.commit();
  }
}
