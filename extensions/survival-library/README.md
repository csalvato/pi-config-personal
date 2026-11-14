# Local survival library

This Pi extension adds bounded, offline reference lookup. It does not certify model answers.

## Use

Start Pi inside a project with `data/pi-library/` and `data/documents/manifest.json`.
The extension activates `survival_search` and `survival_read` in that project.
It does not change the selected model or remove existing tools.

- Ask for a reference to let the model search.
- Run `/reference keywords` to display search excerpts without a model call.
- Use `/reload` after installation in an existing Pi session.

For a dedicated launcher, load this extension explicitly and select only its tools:

```sh
pi --no-extensions --extension ./config/pi-extension/index.ts \
  --tools survival_search,survival_read
```

These flags alone do not make Pi offline. Configure local inference and network restrictions separately.

## Files

The manifest must contain a `sources` array. Each source needs `id`, `title`, `original`, and `extracted_files`.
Extract basenames must exist in `data/pi-library/`. PDF extracts use `<source>-page-NNN.txt` names.
The first seven lines contain provenance headers. Remaining lines contain extracted text.
Original files are served separately at `http://127.0.0.1:8081/originals/`.

Search uses keyword ranking, source filters, and up to four excerpts of 950 characters each.
Reads return up to 80 lines or 7000 bytes, plus metadata and a continuation offset.
The extension rejects unlisted filenames, path traversal, and symlinks outside the library.
It uses Node built-ins and Pi's TypeBox package. It makes no network calls and runs no shell commands.

## Limits

Keyword matches can miss relevant passages. PDF extraction can flatten tables and omit diagrams.
Search results are evidence to inspect, not compatibility decisions.
A local-model test found the relevant electrical pages but still invented a pump-starting assumption and misattributed a citation.
Do not treat successful retrieval as proof that a model answer is correct.
