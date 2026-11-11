import 'package:flutter/foundation.dart';
import 'read_state_store.dart';

ReadStateStore createReadStateStore(ReadScope scope) =>
    MemoryReadStateStore(scope);
Future<void> maintainReadNamespaces() async {}
ValueListenable<bool> get browserReadActivity => _activity;
final _activity = ValueNotifier(true);
