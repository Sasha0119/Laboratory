# Translations

> **AI-generated translation — recommend native speaker review before production,
> especially physics terminology.**
>
> This applies to every file here except `en.json`. The same notice is repeated
> in the `_note` key at the top of each translated file, and is surfaced to
> users on the Settings screen.
>
> JSON does not permit `//` comments — a `.json` file with one fails
> `JSON.parse`, and Metro would refuse to bundle it — so the notice is carried
> as the first key of each file instead.

## Files

| File | Language | |
|---|---|---|
| `en.json` | English | source of truth, and the fallback for any missing key |
| `uz.json` | Uzbek (Latin) | |
| `ru.json` | Russian | |
| `zh.json` | Chinese (Simplified) | |
| `tr.json` | Turkish | |

## Adding a string

1. Add the key to `en.json` first — it is both the source and the fallback.
2. Add the same key to every other file.
3. Run `npm run check:locales`.

That last step matters: a missing key does **not** throw. i18next quietly falls
back to English, so a half-translated screen looks perfectly healthy in testing
and only fails for the user who cannot read the fallback. The check compares
every locale against `en.json` for missing keys, stray keys, and — the easiest
mistake to make by hand — `{{placeholders}}` that were dropped or renamed
during translation.

## Adding a language

1. Copy `en.json`, translate it, and keep the `_note` line.
2. Import it in `lib/i18n/index.ts` and add it to `SUPPORTED_LANGUAGES` with
   its endonym (the language's own name for itself — that is what the picker
   shows, so someone who cannot read the current interface can still find their
   language).

No screen needs to change. Components only ever reference keys.

## Conventions

**Unit symbols stay in Latin script in every language** — `kg`, `m`, `m/s`,
`J`, `kg·m/s`, `kg/m³`. These are SI symbols and are internationally standard;
only the words around them are translated. Numbers likewise keep `.` as the
decimal separator, matching what the simulation renders on screen.

**Physics data files hold no display text.** `lib/physics/presets.ts` and
`lib/physics/constants.ts` carry ids only; the name and description for an
object or an environment live at `presets.<id>.*` and `environments.<id>.*`
here. Same for the speed comparisons, which `lib/format.ts` returns as keys
rather than sentences.

**Two registers for the same quantity.** Anything shown differently in
"detailed data" mode has a plain key and a `…Technical` twin — for example
`results.stats.timeTaken` ("Time taken") and `results.stats.timeTakenTechnical`
("Time  t"). The plain one is the default; keep it readable by someone with no
physics background.
