import 'dart:js_interop';

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;
import 'read_state_store.dart';
import 'indexed_read_state_store.dart';
export 'indexed_read_state_store.dart';

ReadStateStore createReadStateStore(ReadScope scope) =>
    IndexedReadStateStore(scope);
Future<void> maintainReadNamespaces() async {
  await pruneIndexedReadNamespaces(DateTime.now());
}

ValueListenable<bool> get browserReadActivity =>
    _activity ??= _createActivity();
ValueNotifier<bool>? _activity;
ValueNotifier<bool> _createActivity() {
  final result = ValueNotifier(
    web.document.visibilityState == 'visible' && web.document.hasFocus(),
  );
  void update(web.Event _) {
    result.value =
        web.document.visibilityState == 'visible' && web.document.hasFocus();
  }

  final listener = update.toJS;
  web.document.addEventListener('visibilitychange', listener);
  web.window.addEventListener('focus', listener);
  web.window.addEventListener('blur', listener);
  return result;
}
