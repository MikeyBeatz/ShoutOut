part of '../main.dart';

class ModerationPage extends StatelessWidget {
  const ModerationPage({super.key});
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    child: Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Moderace')),
        bottom: TabBar(
          tabs: [
            Tab(text: tr(context, 'Shouty')),
            Tab(text: tr(context, 'Komentáře')),
            Tab(text: tr(context, 'Soukromé')),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          _ReportList(collection: 'reports'),
          _ReportList(collection: 'commentReports'),
          const _PrivateReplyReportList(),
        ],
      ),
    ),
  );
}

class _PrivateReplyReportList extends StatelessWidget {
  const _PrivateReplyReportList();

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('privateReplyReports')
            .where('status', isEqualTo: 'open')
            .limit(_moderationPageSize)
            .snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final reports = snapshot.data!.docs;
          if (reports.isEmpty) {
            return Center(child: Text(tr(context, 'Žádná otevřená hlášení.')));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: reports.length,
            itemBuilder: (context, index) {
              final report = reports[index];
              final data = report.data();
              return Card(
                color: const Color(0xFFFFF4E5),
                child: ListTile(
                  leading: const Icon(Icons.priority_high_rounded),
                  title: Text(data['reason'] as String? ?? ''),
                  subtitle: Text(
                    '${tr(context, 'Soukromá odpověď')}: ${data['text'] ?? ''}',
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) async {
                      if (action == 'remove') {
                        await FirebaseFirestore.instance
                            .collection('shouts')
                            .doc(data['shoutId'] as String)
                            .collection('privateReplies')
                            .doc(data['privateReplyId'] as String)
                            .delete();
                      }
                      await report.reference.update({
                        'status': 'resolved',
                        'resolvedAt': FieldValue.serverTimestamp(),
                      });
                    },
                    itemBuilder: (_) => [
                      PopupMenuItem(
                        value: 'resolve',
                        child: Text(tr(context, 'Označit jako vyřešené')),
                      ),
                      PopupMenuItem(
                        value: 'remove',
                        child: Text(tr(context, 'Odstranit z veřejnosti')),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      );
}

class _ReportList extends StatelessWidget {
  const _ReportList({required this.collection});
  final String collection;
  @override
  Widget build(BuildContext context) =>
      StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection(collection)
            .where('status', isEqualTo: 'open')
            .limit(_moderationPageSize)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Text(tr(context, 'Hlášení se nepodařilo načíst.')),
            );
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final reports = snapshot.data!.docs;
          if (reports.isEmpty) {
            return Center(child: Text(tr(context, 'Žádná otevřená hlášení.')));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: reports.length,
            itemBuilder: (context, index) {
              final report = reports[index];
              final data = report.data();
              return Card(
                child: ListTile(
                  title: Text(data['reason'] as String? ?? ''),
                  subtitle: Text(
                    '${tr(context, 'Nahlásil/a')}: ${data['reporterId'] ?? ''}',
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) => _act(context, report, action),
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'resolve',
                        child: Text(tr(context, 'Označit jako vyřešené')),
                      ),
                      PopupMenuItem(
                        value: 'remove',
                        child: Text(tr(context, 'Odstranit z veřejnosti')),
                      ),
                      PopupMenuItem(
                        value: 'warning',
                        child: Text(tr(context, 'Udělit varování')),
                      ),
                      PopupMenuItem(
                        value: 'ban1d',
                        child: Text(tr(context, 'Ban na 1 den')),
                      ),
                      PopupMenuItem(
                        value: 'banPermanent',
                        child: Text(tr(context, 'Trvalý ban')),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      );

  Future<void> _act(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> report,
    String action,
  ) async {
    final data = report.data();
    final shoutRef = FirebaseFirestore.instance
        .collection('shouts')
        .doc(data['shoutId'] as String);
    final target = collection == 'reports'
        ? shoutRef
        : shoutRef.collection('comments').doc(data['commentId'] as String);
    final targetSnapshot = await target.get();
    final authorId = targetSnapshot.data()?['authorId'] as String?;
    if (action == 'remove') {
      if (collection == 'reports') {
        await target.update({'status': 'deleted'});
      } else {
        await _deleteCommentWithCounter(target);
      }
    }
    if (authorId != null && action == 'warning') {
      await FirebaseFirestore.instance.collection('warnings').add({
        'userId': authorId,
        'reason': data['reason'],
        'createdAt': FieldValue.serverTimestamp(),
        'moderatorId': FirebaseAuth.instance.currentUser!.uid,
      });
    }
    if (authorId != null && action.startsWith('ban')) {
      await FirebaseFirestore.instance.collection('bans').doc(authorId).set({
        'userId': authorId,
        'reason': data['reason'],
        'createdAt': FieldValue.serverTimestamp(),
        'expiresAt': action == 'ban1d'
            ? Timestamp.fromDate(DateTime.now().add(const Duration(days: 1)))
            : null,
        'moderatorId': FirebaseAuth.instance.currentUser!.uid,
      });
    }
    await report.reference.update({
      'status': 'resolved',
      'resolvedAt': FieldValue.serverTimestamp(),
    });
  }
}

class WarningHistoryPage extends StatelessWidget {
  const WarningHistoryPage({super.key, required this.userId});
  final String userId;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Moje varování'))),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('warnings')
          .where('userId', isEqualTo: userId)
          .limit(_moderationPageSize)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final warnings = snapshot.data!.docs;
        if (warnings.isEmpty) {
          return Center(child: Text(tr(context, 'Nemáš žádná varování.')));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: warnings.length,
          itemBuilder: (context, index) {
            final warning = warnings[index].data();
            return Card(
              child: ListTile(
                leading: const Icon(Icons.warning_amber_outlined),
                title: Text(warning['reason'] as String? ?? ''),
                subtitle: Text(tr(context, 'Varování od moderace')),
              ),
            );
          },
        );
      },
    ),
  );
}
