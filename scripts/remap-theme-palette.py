#!/usr/bin/env python3
"""Re-map the legacy premium-ui palette (slate/orange/emerald/sky/...) onto the
strict 3-colour RoofFlow design system (obsidian / champagne gold / cream).

Structure, layout and behaviour are never touched: only colour-bearing tokens
inside className strings, CSS-ish strings and hex literals are rewritten to the
semantic tokens declared in src/index.css.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'src'

# ---- ordered (pattern, replacement) rules -------------------------------
TEXT = [
    (r'text-white\b', 'text-ink'),
    (r'text-slate-(?:50|100|200)\b', 'text-ink'),
    (r'text-slate-300\b', 'text-ink-soft'),
    (r'text-slate-(?:400|500|600)\b', 'text-ink-mute'),
    (r'text-slate-(?:700|800|900|950)\b', 'text-gold-ink'),
    (r'text-(?:orange|amber|yellow|emerald|green|teal|sky|cyan|blue|indigo|violet|purple)(?:-\d{2,3})?\b', 'text-gold'),
    (r'text-(?:rose|red|pink)(?:-\d{2,3})?\b', 'text-danger'),
]

BG = [
    (r'bg-slate-950\b', 'bg-page'),
    (r'bg-slate-900\b', 'bg-card'),
    (r'bg-slate-800\b', 'bg-inset'),
    (r'bg-slate-(?:700|600)\b', 'bg-line-strong'),
    (r'bg-white\b', 'bg-card'),
    (r'bg-black\b', 'bg-page'),
    (r'bg-(?:orange|amber|yellow|emerald|green|teal|sky|cyan|blue|indigo|violet|purple)(?:-\d{2,3})?\b', 'bg-gold'),
    (r'bg-(?:rose|red|pink)(?:-\d{2,3})?\b', 'bg-danger'),
]

BORDER = [
    (r'border-slate-(?:900|850|800|700|600)\b', 'border-line'),
    (r'border-white\b', 'border-line-strong'),
    (r'border-(?:orange|amber|yellow|emerald|green|teal|sky|cyan|blue|indigo|violet|purple)(?:-\d{2,3})?\b', 'border-gold'),
    (r'border-(?:rose|red|pink)(?:-\d{2,3})?\b', 'border-danger'),
]

OTHER = [
    (r'divide-slate-(?:900|850|800|700)\b', 'divide-line'),
    (r'placeholder-slate-(?:400|500|600)\b', 'placeholder-ink-mute'),
    (r'fill-slate-(?:950|900)\b', 'fill-page'),
    (r'stroke-slate-(?:800|700)\b', 'stroke-line'),
    (r'ring-slate-(?:800|700)\b', 'ring-line'),
    (r'ring-(?:orange|amber|emerald|sky|cyan|blue)(?:-\d{2,3})?\b', 'ring-gold'),
    (r'outline-(?:orange|amber|emerald|sky|cyan|blue)(?:-\d{2,3})?\b', 'outline-gold'),
    (r'shadow-(?:orange|amber|yellow|emerald|sky|cyan|blue)(?:-\d{2,3})?\b', 'shadow-gold'),
    (r'shadow-(?:red|rose)(?:-\d{2,3})?\b', 'shadow-danger'),
    (r'from-(?:orange|amber|yellow|emerald|sky|cyan|blue|indigo|violet|purple)(?:-\d{2,3})?\b', 'from-gold'),
    (r'to-(?:orange|amber|yellow|emerald|sky|cyan|blue|indigo|violet|purple)(?:-\d{2,3})?\b', 'to-gold-deep'),
    (r'via-(?:orange|amber|yellow|emerald|sky|cyan|blue|indigo|violet|purple)(?:-\d{2,3})?\b', 'via-gold'),
    (r'from-(?:red|rose)(?:-\d{2,3})?\b', 'from-danger'),
    (r'to-(?:red|rose)(?:-\d{2,3})?\b', 'to-danger'),
    (r'from-slate-(?:950|900)\b', 'from-page'),
    (r'to-slate-(?:950|900)\b', 'to-card'),
    (r'via-slate-(?:950|900)\b', 'via-card'),
    (r'(?:text|bg|border|ring|from|to|via)-electric-\d{2,3}\b', 'text-gold'),
]

# Arbitrary hex values inside className / style strings.
HEX = {
    '#0F172A': 'bg-page', '#0f172a': 'bg-page', '#0b1220': 'bg-page',
    '#111C2E': 'bg-card', '#111c2e': 'bg-card', '#172033': 'bg-card',
    '#F97316': 'bg-gold', '#f97316': 'bg-gold', '#fb923c': 'bg-gold',
    '#fdba74': 'bg-gold', '#ea580c': 'bg-gold-deep', '#c2410c': 'bg-gold-deep',
    '#f59e0b': 'bg-gold', '#10b981': 'bg-gold',
    '#8900ff': 'bg-gold', '#eee6ff': 'bg-card',
    '#e2e8f0': 'text-ink', '#f8fafc': 'text-ink', '#f1f5f9': 'text-ink',
    '#cbd5e1': 'text-ink-soft', '#94a3b8': 'text-ink-mute',
    '#64748b': 'text-ink-mute', '#475569': 'text-ink-mute',
    '#334155': 'border-line',
}

FILES = [p for p in ROOT.rglob('*') if p.suffix in {'.ts', '.tsx'}]


def remap(text: str) -> str:
    for rules in (TEXT, BG, BORDER, OTHER):
        for pat, rep in rules:
            text = re.sub(pat, rep, text)
    return text


def remap_hex(text: str) -> str:
    """Replace `bg-[#0F172A]`-style arbitrary colour utilities with a token."""
    def repl(m):
        util, hexval = m.group(1), m.group(2)
        token = HEX.get(hexval)
        if not token:
            return m.group(0)
        # Keep the utility family of the original (bg/text/border/from/to).
        fam, _, _ = token.partition('-')
        if fam == util:
            return token
        mapping = {
            'text': {'bg': 'text-ink', 'text': 'text-ink', 'border': 'text-ink-mute'},
            'bg': {'bg': 'bg-page', 'text': 'bg-page', 'border': 'bg-line'},
            'border': {'bg': 'border-line', 'text': 'border-line', 'border': 'border-line'},
            'from': {'bg': 'from-gold', 'text': 'from-gold', 'border': 'from-gold'},
            'to': {'bg': 'to-gold', 'text': 'to-gold', 'border': 'to-gold'},
        }
        return mapping.get(util, {}).get(fam, token)
    return re.sub(r'\b(bg|text|border|from|to)-\[(#[0-9A-Fa-f]{3,8})\]', repl, text)


def main() -> int:
    changed = []
    for path in FILES:
        original = path.read_text()
        text = remap_hex(remap(original))
        if text != original:
            path.write_text(text)
            changed.append(path.relative_to(ROOT.parent))
    print(f'{len(changed)} files re-mapped')
    for c in changed:
        print(' ', c)
    return 0


if __name__ == '__main__':
    sys.exit(main())
