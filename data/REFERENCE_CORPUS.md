The engine uses computed statistics from **100 distinct songs: 50 Korean and 50 international**, with **208 available annotated excerpts and 11,332 melody notes**. This is an editorial reference selection, not a ranking of the best songs or a representative sample of all popular music. The genre group tags in `reference-selection.json` are editorial; the musical measurements in `reference-corpus.json` are computed from the source annotations.

Source: [Sheet Sage HookTheory dataset](https://github.com/chrisdonahue/sheetsage#hooktheory-dataset), derived from the community's [Hooktheory TheoryTab](https://www.hooktheory.com/theorytab) annotations. The original release contains melody, harmony, meter, key and alignment data. Each selected song has its source page, clip IDs and annotator attribution in the JSON. The exact compressed source SHA-256 is pinned in `GAME_DATABASE.referenceCorpusRules`.

Rebuild after downloading the pinned `Hooktheory.json.gz` release:

```
node tools/analyze-reference-corpus.cjs /path/to/Hooktheory.json.gz
```

The analyzer filters for usable melody and harmony annotations, excludes tempo-changing clips, removes duplicate annotations within each song, and derives interval categories, note durations, within-bar attack positions, syncopation, rests, non-chord-tone incidence, repeated interval cells, harmonic rhythm, inversions, and relative-root/quality transitions. Song-level means weight songs equally. The engine consumes genre-conditioned interval and tone priors, density and non-chord-tone targets, and chord-transition priors. Small reference groups use a broader fallback rather than claiming reliable genre estimates from one song. Classical/cinematic directions retain theory-based rules without pretending the pop corpus represents them.

Only aggregate musical features are embedded in the browser engine; source melodies, lyrics and audio are not packaged. The dataset does not provide lyric syllable groups, drum stems, exact accompaniment voicings, or full performances for these analyses. Therefore melisma, instrumentation, comping, register and articulation rules are designed separately from the annotated pitch/rhythm statistics. This is statistical calibration of a deterministic search engine, not neural-model fine-tuning or a claim that the complete recordings were listened to.

The derived reference statistics and selection are attributed to Chris Donahue and Sheet Sage / Hooktheory contributors and are distributed under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). See the per-song annotator lists and linked source analyses. Existing application code retains its existing licensing terms.
