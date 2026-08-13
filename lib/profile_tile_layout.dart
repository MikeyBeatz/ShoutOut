List<T?> arrangeProfileTiles<T>(List<T> tiles) {
  final arranged = <T?>[];
  for (var start = 0; start < tiles.length; start += 3) {
    final end = (start + 3).clamp(0, tiles.length);
    final row = tiles.sublist(start, end);
    switch (row.length) {
      case 1:
        arranged.addAll(<T?>[null, row.first, null]);
      case 2:
        arranged.addAll(<T?>[row.first, row.last, null]);
      case 3:
        arranged.addAll(row);
    }
  }
  return arranged;
}
