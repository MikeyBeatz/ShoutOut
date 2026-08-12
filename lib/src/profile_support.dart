part of '../main.dart';

class NotificationBellButton extends StatelessWidget {
  const NotificationBellButton({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    if (Firebase.apps.isEmpty) {
      return IconButton(
        tooltip: tr(context, 'Oznámení'),
        onPressed: onPressed,
        icon: const Icon(Icons.notifications_none_rounded, color: Colors.white),
      );
    }
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return const SizedBox.shrink();
    final stream = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications')
        .orderBy('createdAt', descending: true)
        .limit(50)
        .snapshots();
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: stream,
      builder: (context, snapshot) {
        final unread =
            snapshot.data?.docs
                .where((document) => document.data()['readAt'] == null)
                .length ??
            0;
        return IconButton(
          tooltip: tr(context, 'Oznámení'),
          onPressed: onPressed,
          icon: Badge.count(
            count: unread,
            isLabelVisible: unread > 0,
            child: const Icon(
              Icons.notifications_none_rounded,
              color: Colors.white,
            ),
          ),
        );
      },
    );
  }
}

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({
    super.key,
    required this.onSave,
    required this.onReaction,
  });

  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;

  CollectionReference<Map<String, dynamic>> get _reference {
    final uid = FirebaseAuth.instance.currentUser!.uid;
    return FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications');
  }

  Future<void> _markAllRead(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> documents,
  ) async {
    final unread = documents.where((doc) => doc.data()['readAt'] == null);
    if (unread.isEmpty) return;
    final batch = FirebaseFirestore.instance.batch();
    for (final document in unread) {
      batch.update(document.reference, {
        'readAt': FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(tr(context, 'Oznámení'))),
    body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _reference
          .orderBy('createdAt', descending: true)
          .limit(50)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: Text(tr(context, 'Oznámení se nepodařilo načíst.')),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final documents = snapshot.data!.docs;
        if (documents.isEmpty) {
          return _NotificationsEmptyState();
        }
        final hasUnread = documents.any((doc) => doc.data()['readAt'] == null);
        return Column(
          children: [
            if (hasUnread)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => _markAllRead(documents),
                  icon: const Icon(Icons.done_all),
                  label: Text(tr(context, 'Označit vše jako přečtené')),
                ),
              ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                itemCount: documents.length,
                separatorBuilder: (_, _) => const SizedBox(height: 6),
                itemBuilder: (context, index) => _NotificationTile(
                  document: documents[index],
                  onSave: onSave,
                  onReaction: onReaction,
                ),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _NotificationsEmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.notifications_none_rounded,
            size: 48,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 12),
          Text(
            tr(context, 'Zatím nemáš žádná oznámení.'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ],
      ),
    ),
  );
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.document,
    required this.onSave,
    required this.onReaction,
  });

  final QueryDocumentSnapshot<Map<String, dynamic>> document;
  final ValueChanged<Shout> onSave;
  final Future<void> Function(Shout shout, {required bool like}) onReaction;

  Future<void> _openTarget(BuildContext context) async {
    final data = document.data();
    if (data['readAt'] == null) {
      await document.reference.update({'readAt': FieldValue.serverTimestamp()});
    }
    final shoutId = data['targetShoutId'] as String?;
    if (shoutId == null) return;
    try {
      final firestore = FirebaseFirestore.instance;
      final uid = FirebaseAuth.instance.currentUser!.uid;
      final shoutReference = firestore.collection('shouts').doc(shoutId);
      final shoutDocument = await shoutReference.get();
      if (!shoutDocument.exists) {
        if (context.mounted) _showUnavailable(context);
        return;
      }
      final shout = Shout.fromDocument(shoutDocument);
      if (!shout.isActive) {
        if (context.mounted) _showUnavailable(context);
        return;
      }
      final results = await Future.wait([
        shoutReference.collection('saves').doc(uid).get(),
        shoutReference.collection('reactions').doc(uid).get(),
      ]);
      shout.isSaved = results[0].exists;
      final reactionType = results[1].data()?['type'] as String?;
      shout.isLiked = reactionType == 'like';
      shout.isDisliked = reactionType == 'dislike';

      final focusCommentId = data['targetCommentId'] as String?;
      Timestamp? focusCommentCreatedAt;
      if (focusCommentId != null) {
        final comment = await shoutReference
            .collection('comments')
            .doc(focusCommentId)
            .get();
        focusCommentCreatedAt = comment.data()?['createdAt'] as Timestamp?;
      }
      if (!context.mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ShoutDetailPage(
            shout: shout,
            onSave: () => onSave(shout),
            onReaction: (like) => onReaction(shout, like: like),
            focusCommentId: focusCommentCreatedAt == null
                ? null
                : focusCommentId,
            focusCommentCreatedAt: focusCommentCreatedAt,
          ),
        ),
      );
    } on FirebaseException {
      if (context.mounted) _showUnavailable(context);
    }
  }

  void _showUnavailable(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr(context, 'Tento Shout už není dostupný.'))),
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = document.data();
    final kind = data['kind'] as String? ?? '';
    final reactionType = data['reactionType'] as String?;
    final actor = data['actorNickname'] as String? ?? tr(context, 'Někdo');
    final count = data['eventCount'] as int? ?? 1;
    final rawTitle = data['targetTitle'] as String? ?? '';
    final title = rawTitle.length > 30
        ? '${rawTitle.substring(0, 30).trimRight()}…'
        : rawTitle;
    final target = title.isEmpty ? '' : ' „$title“';
    final createdAt = (data['createdAt'] as Timestamp?)?.toDate().toLocal();
    final read = data['readAt'] != null;
    final (icon, message) = switch (kind) {
      'reaction' => (
        reactionType == 'dislike'
            ? Icons.thumb_down_outlined
            : Icons.thumb_up_outlined,
        count > 1
            ? '$count ${tr(context, reactionType == 'dislike' ? 'uživatelů dalo dislike tvému Shoutu' : 'uživatelů dalo like tvému Shoutu')}$target.'
            : '$actor ${tr(context, reactionType == 'dislike' ? 'dal dislike tvému Shoutu' : 'dal like tvému Shoutu')}$target.',
      ),
      'comment' => (
        Icons.chat_bubble_outline,
        count > 1
            ? '$count ${tr(context, 'uživatelů komentovalo tvůj Shout')}$target.'
            : '$actor ${tr(context, 'okomentoval tvůj Shout')}$target.',
      ),
      'commentReaction' => (
        reactionType == 'dislike'
            ? Icons.thumb_down_outlined
            : Icons.thumb_up_outlined,
        count > 1
            ? '$count ${tr(context, reactionType == 'dislike' ? 'uživatelů dalo dislike tvému komentáři' : 'uživatelů dalo like tvému komentáři')}$target.'
            : '$actor ${tr(context, reactionType == 'dislike' ? 'dal dislike tvému komentáři' : 'dal like tvému komentáři')}$target.',
      ),
      'reply' => (
        Icons.reply,
        count > 1
            ? '$count ${tr(context, 'uživatelů odpovědělo na tvůj komentář')}$target.'
            : '$actor ${tr(context, 'odpověděl na tvůj komentář')}$target.',
      ),
      'privateReply' => (
        Icons.lock_outline,
        count > 1
            ? '$count ${tr(context, 'uživatelů ti poslalo soukromou odpověď')}$target.'
            : '$actor ${tr(context, 'ti poslal soukromou odpověď')}$target.',
      ),
      'followedShout' => (
        Icons.person_outline,
        '$actor ${tr(context, 'zveřejnil nový Shout.')}',
      ),
      _ => (Icons.notifications_outlined, tr(context, 'Nové oznámení')),
    };
    final material = MaterialLocalizations.of(context);
    final time = createdAt == null
        ? null
        : '${material.formatMediumDate(createdAt)} · '
              '${material.formatTimeOfDay(TimeOfDay.fromDateTime(createdAt))}';
    return Card(
      color: read ? null : Theme.of(context).colorScheme.primaryContainer,
      child: ListTile(
        leading: Icon(icon),
        title: Text(message),
        subtitle: time == null ? null : Text(time),
        trailing: read
            ? null
            : Icon(
                Icons.circle,
                size: 10,
                color: Theme.of(context).colorScheme.primary,
              ),
        onTap: () => _openTarget(context),
      ),
    );
  }
}

class BugReportPage extends StatefulWidget {
  const BugReportPage({super.key});

  @override
  State<BugReportPage> createState() => _BugReportPageState();
}

class _BugReportPageState extends State<BugReportPage> {
  // Enable only after Firebase Storage is initialized and storage.rules are
  // deployed in the target project. See docs/FIREBASE_STORAGE_SETUP.md.
  static const _imageAttachmentsEnabled = false;
  static const _maximumImageBytes = 5 * 1024 * 1024;
  final _description = TextEditingController();
  XFile? _image;
  Uint8List? _imageBytes;
  String? _imageType;
  String? _error;
  bool _confirmed = false;
  bool _sending = false;
  double? _progress;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      imageQuality: 85,
    );
    if (image == null) return;
    final bytes = await image.readAsBytes();
    final type = image.mimeType ?? _imageTypeFromName(image.name);
    if (!{'image/jpeg', 'image/png', 'image/webp'}.contains(type)) {
      setState(() => _error = 'Použij obrázek JPG, PNG nebo WebP.');
      return;
    }
    if (bytes.length > _maximumImageBytes) {
      setState(() => _error = 'Obrázek může mít nejvýše 5 MB.');
      return;
    }
    setState(() {
      _image = image;
      _imageBytes = bytes;
      _imageType = type;
      _error = null;
      _confirmed = false;
    });
  }

  Future<void> _submit() async {
    final description = _description.text.trim();
    if (description.length < 10) {
      setState(() => _error = 'Popiš chybu alespoň 10 znaky.');
      return;
    }
    if (_image != null && !_confirmed) {
      setState(() => _error = 'Před přiložením obrázku potvrď jeho obsah.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final firestore = FirebaseFirestore.instance;
    final user = FirebaseAuth.instance.currentUser!;
    final report = firestore.collection('bugReports').doc();
    Reference? imageReference;
    try {
      String? screenshotPath;
      if (_imageBytes != null) {
        imageReference = FirebaseStorage.instance.ref(
          'bugReports/${user.uid}/${report.id}/screenshot',
        );
        final task = imageReference.putData(
          _imageBytes!,
          SettableMetadata(contentType: _imageType),
        );
        task.snapshotEvents.listen((snapshot) {
          if (mounted && snapshot.totalBytes > 0) {
            setState(
              () => _progress = snapshot.bytesTransferred / snapshot.totalBytes,
            );
          }
        });
        await task;
        screenshotPath = imageReference.fullPath;
      }
      final rateReference = _rateLimitReference('report');
      await firestore.runTransaction((transaction) async {
        final rate = await transaction.get(rateReference);
        transaction
          ..set(
            rateReference,
            _nextRateLimitData(
              snapshot: rate,
              eventId: 'bug_${report.id}',
              window: _reportRateWindow,
            ),
          )
          ..set(report, {
            'userId': user.uid,
            'description': description,
            'createdAt': FieldValue.serverTimestamp(),
            'expiresAt': Timestamp.fromDate(
              DateTime.now().toUtc().add(const Duration(days: 60)),
            ),
            'status': 'open',
            'screenshotPath': screenshotPath,
            'screenshotContentType': _imageType,
            'screenshotSize': _imageBytes?.length,
          });
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Hlášení chyby bylo odesláno.')),
        );
        Navigator.pop(context);
      }
    } catch (_) {
      if (imageReference != null) {
        try {
          await imageReference.delete();
        } catch (_) {}
      }
      if (mounted) setState(() => _error = 'Hlášení se nepodařilo odeslat.');
    } finally {
      if (mounted) {
        setState(() {
          _sending = false;
          _progress = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Nahlásit chybu')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _description,
          minLines: 5,
          maxLines: 10,
          maxLength: 1000,
          enabled: !_sending,
          decoration: const InputDecoration(
            labelText: 'Co se stalo?',
            hintText:
                'Popiš postup, očekávaný výsledek a co se zobrazilo místo něj.',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 12),
        if (_imageAttachmentsEnabled && _imageBytes == null)
          OutlinedButton.icon(
            onPressed: _sending ? null : _pickImage,
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: const Text('Přidat obrázek'),
          )
        else if (_imageAttachmentsEnabled) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Image.memory(_imageBytes!, height: 220, fit: BoxFit.contain),
          ),
          TextButton.icon(
            onPressed: _sending
                ? null
                : () => setState(() {
                    _image = null;
                    _imageBytes = null;
                    _imageType = null;
                    _confirmed = false;
                  }),
            icon: const Icon(Icons.delete_outline),
            label: const Text('Odebrat obrázek'),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _confirmed,
            onChanged: _sending
                ? null
                : (value) => setState(() => _confirmed = value ?? false),
            title: const Text(
              'Zkontroloval/a jsem, že obrázek neobsahuje hesla ani zbytečné osobní údaje.',
            ),
            controlAffinity: ListTileControlAffinity.leading,
          ),
        ],
        if (_imageAttachmentsEnabled)
          const Text(
            'Povolené formáty: JPG, PNG a WebP. Maximum 5 MB. Hlášení a obrázek se uchovávají nejvýše 60 dní.',
          )
        else
          const Text(
            'Přiložení obrázku připravujeme. Textové hlášení můžeš odeslat už nyní.',
          ),
        if (_progress != null) ...[
          const SizedBox(height: 12),
          LinearProgressIndicator(value: _progress),
        ],
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _sending ? null : _submit,
          icon: const Icon(Icons.send_outlined),
          label: Text(_sending ? 'Odesílám…' : 'Odeslat hlášení'),
        ),
      ],
    ),
  );
}

String? _imageTypeFromName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}
