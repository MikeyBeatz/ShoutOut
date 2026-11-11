import 'package:flutter/foundation.dart';
import 'read_state_store.dart';

ReadStateStore createReadStateStore(ReadScope scope) =>
    MemoryReadStateStore(scope);
ValueListenable<bool> get browserReadActivity => _activity;
final _activity = ValueNotifier(true);
