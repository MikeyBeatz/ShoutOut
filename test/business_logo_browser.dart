// Pure real-Chrome IndexedDB suite; no Firebase credentials or network.
import 'package:test/test.dart';
import 'package:shoutout/indexed_business_logo_store.dart';

void main() {
  var serial = 0;
  String project() =>
      'logo-browser-${DateTime.now().microsecondsSinceEpoch}-${serial++}';
  Map<String, dynamic> row(String key) => {
    'key': key,
    'pngBase64': 'AQID',
    'avatar': null,
    'expiresAt': 1000,
  };
  test(
    'reopened stores share exactly one pending image and immutable binding',
    () async {
      final name = project(),
          a = IndexedBusinessLogoStore(name),
          b = IndexedBusinessLogoStore(name);
      final inserted = await Future.wait([
        a.insert('a', row('first')),
        b.insert('a', row('second')),
      ]);
      expect(inserted[0], inserted[1]);
      final key = inserted[0]['key'] as String;
      final bindings = await Future.wait([
        a.bind('a', key, {'nonce': 'one'}),
        b.bind('a', key, {'nonce': 'two'}),
      ]);
      expect(bindings[0], bindings[1]);
      final restarted = IndexedBusinessLogoStore(name);
      expect((await restarted.read('a'))!['binding'], bindings[0]);
      await restarted.remove('a', 'wrong-old-key');
      expect(await restarted.read('a'), isNotNull);
      await restarted.remove('a', key);
      expect(await b.read('a'), isNull);
    },
  );
  test(
    'project and account separation, expiry and erasure fence late writers',
    () async {
      final a = IndexedBusinessLogoStore(project()),
          foreign = IndexedBusinessLogoStore(project());
      await a.insert('a', row('a'));
      await a.insert('b', {...row('b'), 'expiresAt': 2000});
      expect(await foreign.read('a'), isNull);
      await a.prune(1000);
      expect(await a.read('a'), isNull);
      expect(await a.read('b'), isNotNull);
      await a.erase('b');
      await expectLater(a.insert('b', row('resurrect')), throwsStateError);
      await expectLater(a.bind('b', 'b', {'nonce': 'late'}), throwsStateError);
      await a.remove('b', 'b'); // A late ACK cannot clear the tombstone.
      await expectLater(a.read('b'), throwsStateError);
    },
  );
}
