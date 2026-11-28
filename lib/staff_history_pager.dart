import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'staff_user_enforcement.dart';

class StaffHistoryPage {
  const StaffHistoryPage(this.records, this.cursor);
  final List<StaffSanctionRecord> records;
  final Object? cursor;
}

typedef StaffHistoryLoader = Future<StaffHistoryPage> Function(Object? cursor);

class StaffHistoryPager extends ChangeNotifier {
  StaffHistoryPager({
    required this.loadPage,
    required this.currentUserId,
    this.activeIds = const {},
  });
  final StaffHistoryLoader loadPage;
  final String? Function() currentUserId;
  final Set<String> activeIds;
  List<StaffSanctionRecord> records = const [];
  Object? cursor, error;
  bool loading = false, hasMore = true, _disposed = false;
  int _generation = 0;
  Future<void>? _flight;
  String? _userId;
  Future<void> loadMore() {
    if (_disposed) return Future.value();
    final current = currentUserId();
    if (current != _userId) {
      _userId = current;
      _generation++;
      _flight = null;
      records = const [];
      cursor = null;
      hasMore = true;
    }
    if (!hasMore) return Future.value();
    final running = _flight;
    if (running != null) return running;
    final uid = currentUserId(), generation = _generation;
    if (uid == null) {
      records = const [];
      hasMore = false;
      notifyListeners();
      return Future.value();
    }
    loading = true;
    error = null;
    notifyListeners();
    final next = Future<void>.microtask(() async {
      try {
        final page = await loadPage(cursor);
        if (_disposed || generation != _generation || currentUserId() != uid) {
          return;
        }
        final joined = {for (final r in records) r.id: r};
        for (final r in page.records) {
          joined[r.id] = r;
        }
        final now = DateTime.now();
        final sorted = joined.values.toList()
          ..sort((a, b) {
            final active = (b.active(activeIds, now) ? 1 : 0).compareTo(
              a.active(activeIds, now) ? 1 : 0,
            );
            if (active != 0) return active;
            final time = (b.createdAt?.microsecondsSinceEpoch ?? 0).compareTo(
              a.createdAt?.microsecondsSinceEpoch ?? 0,
            );
            return time != 0 ? time : b.id.compareTo(a.id);
          });
        if (page.cursor != null && page.cursor == cursor) {
          throw const FormatException('History cursor did not advance');
        }
        records = List.unmodifiable(sorted);
        cursor = page.cursor;
        hasMore = cursor != null;
      } catch (e) {
        if (!_disposed && generation == _generation && currentUserId() == uid) {
          error = e;
          if (e is FirebaseException &&
              ['permission-denied', 'unauthenticated'].contains(e.code)) {
            records = const [];
            cursor = null;
            hasMore = false;
          }
        }
      } finally {
        if (!_disposed && generation == _generation && currentUserId() == uid) {
          loading = false;
          _flight = null;
          notifyListeners();
        }
      }
    });
    _flight = next;
    return next;
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    super.dispose();
  }
}

class PagedStaffHistory extends StatefulWidget {
  const PagedStaffHistory({
    super.key,
    required this.pager,
    required this.cardBuilder,
    this.header,
  });
  final StaffHistoryPager pager;
  final Widget Function(StaffSanctionRecord) cardBuilder;
  final Widget? header;
  @override
  State<PagedStaffHistory> createState() => _PagedStaffHistoryState();
}

class _PagedStaffHistoryState extends State<PagedStaffHistory> {
  final _scroll = ScrollController();
  @override
  void initState() {
    super.initState();
    widget.pager.addListener(_change);
  }

  @override
  void didUpdateWidget(PagedStaffHistory oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.pager != widget.pager) {
      oldWidget.pager.removeListener(_change);
      widget.pager.addListener(_change);
    }
  }

  void _change() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.pager.removeListener(_change);
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.pager, offset = widget.header == null ? 0 : 1;
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(16),
      itemCount: p.records.length + offset + 1,
      itemBuilder: (context, index) {
        if (offset == 1 && index == 0) return widget.header!;
        final i = index - offset;
        if (i < p.records.length) {
          return KeyedSubtree(
            key: ValueKey(p.records[i].id),
            child: widget.cardBuilder(p.records[i]),
          );
        }
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (p.loading) const CircularProgressIndicator(),
                if (p.error != null)
                  const Text('Historii se nepodařilo načíst.'),
                if (!p.loading && p.hasMore)
                  FilledButton.tonalIcon(
                    onPressed: p.loadMore,
                    icon: const Icon(Icons.expand_more),
                    label: Text(
                      p.error == null ? 'Načíst další' : 'Zkusit znovu',
                    ),
                  ),
                if (!p.loading && !p.hasMore && p.records.isEmpty)
                  const Text('Zatím nejsou zaznamenané postihy.'),
              ],
            ),
          ),
        );
      },
    );
  }
}
