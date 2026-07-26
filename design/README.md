# ShoutOut design archive

This directory is the durable archive for ShoutOut brand assets and the
decisions used by the application. Runtime files stay in `assets/` and
`android/app/src/main/res/` so organizing this archive cannot break the app.

## Directory contents

- `logos/app-icon-master.png` — 1254 × 1254 px opaque master artwork.
- `logos/shoutout-mark-transparent.png` — 1254 × 1254 px transparent mark.
- `fonts/Urbanist-Medium.ttf` — chosen wordmark font, weight 500.
- `fonts/OFL-Urbanist.txt` — SIL Open Font License for Urbanist.
- `brand-tokens.json` — exact colors and reusable design measurements.
- `previews/` — approved emulator references and the font comparison.

## Logo usage

### Transparent mark

Use `logos/shoutout-mark-transparent.png` for:

- the feed header;
- the Android adaptive launcher foreground;
- the Android splash screen;
- the static background watermark.

Do not place it in an extra white tile or a differently colored circle.

### App icon artwork

`logos/app-icon-master.png` preserves the original full-color square artwork.
The current Android launcher is built as a true adaptive icon instead:

- background: `#0A6371`;
- transparent foreground mark;
- Android foreground inset: `14dp`.

This keeps the upper arc and lower point inside circular launcher masks.

## Typography

The feed wordmark uses:

- family: Urbanist;
- file: `Urbanist-Medium.ttf`;
- weight: 500;
- size: 28 sp;
- letter spacing: -0.8.

Urbanist was selected as variant 6 in `previews/font-comparison.png`. Other app
text continues to use the platform Material typeface.

## Core palette

| Role | Hex |
| --- | --- |
| Primary teal | `#0A6371` |
| Dark teal | `#074B57` |
| Accent teal | `#0E8EA0` |
| Header highlight | `#1496A8` |
| Light accent | `#DDF5F6` |
| App background | `#FAFDFD` |
| Surface | `#FFFFFF` |
| Border | `#E3EEEE` |
| Primary text | `#1F2933` |
| Secondary text | `#697A84` |
| Error | `#B3261E` |

The main header and authentication header use the gradient
`#1496A8 → #0A6371 → #074B57`.

## Splash screen

- solid background: `#0A6371`;
- adaptive icon background: `#0A6371`, visually merging with the screen;
- centered transparent foreground mark with a `15dp` inset;
- no white field;
- no separate circular or square icon background.

The approved result is in `previews/android-splash.png`.

## Main-tab watermark

The feed, Saved, My Shouts, and Profile share one fixed background layer:

- source: transparent mark;
- tint: `#0A6371`;
- opacity: 3%;
- width: 75% of the available area;
- alignment: x `2.2`, y `0.35`;
- partially cropped at the right edge;
- placed behind content, never inside individual Shout cards.

## Runtime asset map

When a master asset changes, update its runtime copy as well:

| Design archive | Runtime copy |
| --- | --- |
| `logos/app-icon-master.png` | `assets/branding/app_icon.png` |
| `logos/shoutout-mark-transparent.png` | `assets/branding/feed_mark.png` |
| `logos/shoutout-mark-transparent.png` | `android/app/src/main/res/drawable-nodpi/ic_launcher_mark.png` |
| `fonts/Urbanist-Medium.ttf` | `assets/fonts/Urbanist-Medium.ttf` |
| `fonts/OFL-Urbanist.txt` | `assets/fonts/OFL-Urbanist.txt` |

After changing runtime design assets, run `flutter analyze`, `flutter test`, and
an Android build, then inspect the launcher, splash, feed, and all four main
tabs on an emulator.
