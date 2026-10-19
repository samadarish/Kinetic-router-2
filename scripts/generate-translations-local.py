"""Generate bundled catalogs with a local CTranslate2 SMaLL-100 model.

This tool has no downloader or inference-service client. The model directory and
dependencies must already exist. Application text is processed only on this PC.
See docs/localization.md for setup, provenance, and review instructions.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import site
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['DO_NOT_TRACK'] = '1'

parser = argparse.ArgumentParser()
parser.add_argument('--model', type=Path, required=True)
parser.add_argument('--sources', type=Path, default=Path('.cache/translation-sources.json'))
parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
parser.add_argument('--batch-size', type=int, default=32)
parser.add_argument('--smoke', action='store_true')
args = parser.parse_args()

# Keep CUDA libraries isolated in the optional generation environment.
dll_handles = []
for package_directory in site.getsitepackages():
    for directory in (Path(package_directory) / 'nvidia').glob('*/bin'):
        if hasattr(os, 'add_dll_directory'):
            dll_handles.append(os.add_dll_directory(str(directory)))
        os.environ['PATH'] = str(directory) + os.pathsep + os.environ.get('PATH', '')

import ctranslate2
import sentencepiece
from opencc import OpenCC

for line in (args.model / 'SHA256SUMS').read_text().splitlines():
    checksum, filename = line.split(maxsplit=1)
    if hashlib.sha256((args.model / filename.lstrip('* ')).read_bytes()).hexdigest() != checksum:
        raise RuntimeError(f'Model checksum mismatch: {filename}')

tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(args.model / 'sentencepiece.bpe.model'))
simplify_chinese = OpenCC('t2s')
translator = ctranslate2.Translator(str(args.model), device=args.device,
    compute_type='float32' if args.device == 'cuda' else 'int8', intra_threads=2)

def infer(strings, language):
    inputs = [[f'__{language}__'] + tokenizer.encode(text, out_type=str) + ['</s>'] for text in strings]
    results = translator.translate_batch(inputs, beam_size=2, max_batch_size=args.batch_size,
        max_decoding_length=256, repetition_penalty=1.1, no_repeat_ngram_size=3)
    decoded = [tokenizer.decode(result.hypotheses[0]).strip() for result in results]
    return [simplify_chinese.convert(text) for text in decoded] if language == 'zh' else decoded

if args.smoke:
    examples = ['Choose a language', 'One API for leading models, with clear provider availability and request-level billing.', 'Read the documentation before creating an API key.']
    start = time.monotonic()
    print(json.dumps(infer(examples, 'es'), ensure_ascii=False), flush=True)
    print(f'Smoke test: {time.monotonic() - start:.2f}s on {args.device}', flush=True)
    raise SystemExit

root = Path(__file__).resolve().parent.parent
catalog_root = root / 'packages/i18n/src/catalogs'
sources = json.loads(args.sources.read_text(encoding='utf-8'))
all_sources = list(dict.fromkeys(source for catalog in sources.values() for source in catalog))
cache_file = root / '.cache/local-translation-memory-v2.json'
memory = json.loads(cache_file.read_text(encoding='utf-8')) if cache_file.exists() else {}

# Preserve interpolation parameters, code-like identifiers, endpoint URLs, and
# names even when they occur inside a prose paragraph rather than a code block.
protected = re.compile(r'(\{\d+\}|https?://[^\s<>"\u201d]+|\b(?:kineticRouter|OpenAI|Anthropic|DeepSeek|Zhipu|Moonshot|Gemini|MiniMax|Meta|Grok|Claude|Codex|Python|Node\.js|Chatbox|OpenClaw|OpenCode|LangChain|LlamaIndex|WebSocket|Responses|Chat Completions|SDK|API|HTTP|HTTPS|JSON|TOTP|OAuth|USD|SSE|CLI|cURL)\b|\b[A-Z]+(?:_[A-Z0-9]+)+\b|\b[a-z][a-z0-9-]+/[a-z0-9][a-z0-9./_-]+|(?<!\w)/(?:v1|portal|docs)(?:/[a-z0-9._-]+)*)')
terms_file = root / '.cache/protected-translation-terms.json'
if terms_file.exists():
    technical_terms = sorted(json.loads(terms_file.read_text(encoding='utf-8')), key=len, reverse=True)
    protected = re.compile('(' + '|'.join(re.escape(term) for term in technical_terms) + '|' + protected.pattern[1:-1] + ')')
protected = re.compile('(' + r'\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b|' + protected.pattern[1:-1] + ')')

def parts(source):
    result = []
    for index, part in enumerate(protected.split(source)):
        if index % 2 or not re.search('[A-Za-z]{2}', part):
            result.append((False, part))
        else:
            # Preserve the whitespace surrounding a protected token exactly.
            leading = re.match(r'^\s*', part).group()
            trailing = re.search(r'\s*$', part).group()
            body = part.strip()
            chunks = re.split(r'(?<=[.!?;])\s+(?=[A-Z])', body) if len(tokenizer.encode(body)) > 180 else [body]
            if leading: result.append((False, leading))
            for chunk_index, chunk in enumerate(chunks):
                if chunk_index: result.append((False, ' '))
                result.append((True, chunk))
            if trailing: result.append((False, trailing))
    return result

segmented = {source: parts(source) for source in all_sources}

def needs_fallback(source, translation):
    parameters = lambda value: sorted(re.findall(r'\{\d+\}', value))
    if parameters(source) != parameters(translation): return True
    return any(token not in translation for token in protected.findall(source))

for locale in ['es', 'pt', 'id', 'de', 'fr', 'ru', 'ko', 'ja', 'zh-CN']:
    language = 'zh' if locale == 'zh-CN' else locale
    completed = memory.setdefault(locale, {})
    # Existing catalog edits take precedence over newly generated copy.
    reviewed = {}
    for filename in (catalog_root / locale).glob('*.json'):
        reviewed.update(json.loads(filename.read_text(encoding='utf-8')))
    # A catalog edit may improve wording, but must still retain code/name tokens.
    reviewed = {source: translation for source, translation in reviewed.items() if not needs_fallback(source, translation)}
    missing_segments = [source for source in all_sources if source not in reviewed and source not in completed]
    print(f'{locale}: {len(missing_segments)} local translation messages.', flush=True)
    start = time.monotonic()
    for offset in range(0, len(missing_segments), args.batch_size):
        batch = missing_segments[offset:offset + args.batch_size]
        output = infer(batch, language)
        for source, translation in zip(batch, output):
            if not translation: raise RuntimeError(f'Empty {locale} translation')
            completed[source] = re.sub(r'\{\s*(\d+)\s*\}', lambda match: '{' + str(int(match[1])) + '}', translation)
        cache_file.write_text(json.dumps(memory, ensure_ascii=False), encoding='utf-8')
        if offset % (args.batch_size * 5) == 0 or offset + args.batch_size >= len(missing_segments):
            print(f'{locale}: {min(offset + args.batch_size, len(missing_segments))}/{len(missing_segments)} ({time.monotonic() - start:.1f}s)', flush=True)
    # Translate whole sentences first for fluent word order. Only the few
    # messages whose protected tokens were damaged use segmented fallback.
    fallback_sources = [source for source in all_sources if source not in reviewed and needs_fallback(source, completed[source])]
    fallback_memory = {}
    fallback_segments = list(dict.fromkeys(part for source in fallback_sources for translate, part in segmented[source] if translate))
    for offset in range(0, len(fallback_segments), args.batch_size):
        batch = fallback_segments[offset:offset + args.batch_size]
        fallback_memory.update(zip(batch, infer(batch, language)))
    for source in fallback_sources:
        completed[source] = ''.join(fallback_memory[part] if translate else part for translate, part in segmented[source])
    cache_file.write_text(json.dumps(memory, ensure_ascii=False), encoding='utf-8')
    for namespace, english in sources.items():
        catalog = {}
        for source in english:
            catalog[source] = reviewed.get(source) or completed[source]
            if sorted(re.findall(r'\{\d+\}', source)) != sorted(re.findall(r'\{\d+\}', catalog[source])):
                raise RuntimeError(f'{locale}: damaged interpolation parameter')
        filename = 'docs-' + ('index' if namespace == 'docs:/docs' else namespace[11:].replace('/', '--')) if namespace.startswith('docs:') else namespace
        directory = catalog_root / locale
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f'{filename}.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{locale}: catalogs saved.', flush=True)
print('All translations generated locally.', flush=True)
