// Isolated renderer probe. No Firebase initialization or application startup.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

const samples = <String, List<String>>{
  'baseline': ['Nabídka', 'Varování!'],
  'categories': ['🏷\uFE0F Nabídka', '⚠\uFE0F Varování!'],
  'offer': ['🏷\uFE0F Nabídka'],
  'warning': ['⚠\uFE0F Varování!'],
  'without-selector': ['🏷 Nabídka', '⚠ Varování!'],
  'selector-only': ['\uFE0F'],
};

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final name = Uri.base.queryParameters['sample'] ?? 'categories';
  List<String>? values = samples[name];
  if (name == 'current-categories') {
    final response = await http.get(Uri.base.resolve('/probe-inputs.json'));
    if (response.statusCode != 200) {
      throw StateError('Diagnostic inputs missing');
    }
    final input = jsonDecode(response.body) as Map<String, dynamic>;
    values = [input['offer'] as String, input['warning'] as String];
  }
  final texts = values ?? (throw ArgumentError('Unknown diagnostic sample'));
  runApp(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final text in texts)
                Text(text, style: const TextStyle(fontSize: 32)),
            ],
          ),
        ),
      ),
    ),
  );
  WidgetsBinding.instance.addPostFrameCallback((_) {
    web.document.body?.setAttribute('data-font-probe-ready', name);
    // ignore: avoid_print
    print(
      'FONT_WARNING_PROBE_READY ${jsonEncode({'sample': name, 'codePoints': texts.map((value) => value.runes.toList()).toList()})}',
    );
  });
}
