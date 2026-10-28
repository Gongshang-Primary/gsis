"""Render the maintained offline 0.9.9 guides using a small escaped Markdown subset."""
from pathlib import Path
from html import escape
import re

ROOT = Path(__file__).resolve().parents[1]
STYLE = '''body{font:16px/1.55 system-ui,sans-serif;color:#15333e;background:#f4f7f9;margin:0}main{max-width:960px;margin:32px auto;background:white;padding:36px;border-radius:12px}h1,h2,h3{color:#124a70;line-height:1.25}h2{margin-top:2em;border-top:1px solid #dce5ea;padding-top:1em}table{border-collapse:collapse;width:100%;display:block;overflow:auto}td,th{border:1px solid #dce5ea;padding:9px;text-align:left}th{background:#edf4f8}code{background:#edf2f4;padding:2px 4px;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#edf2f4;padding:16px}a{color:#075da4}li{margin:.4em 0}@media(max-width:650px){main{margin:0;padding:18px;border-radius:0}body{font-size:15px}}@media print{body{background:white}main{margin:0;padding:0}h2{break-after:avoid}tr{break-inside:avoid}}'''

def inline(text):
    value = escape(text)
    value = re.sub(r'`([^`]+)`', r'<code>\1</code>', value)
    value = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', value)
    value = re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', value)
    return value

def render(markdown):
    lines = markdown.splitlines(); output = []; i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip(): i += 1; continue
        if line.startswith('```'):
            block=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):block.append(lines[i]);i+=1
            output.append('<pre><code>'+escape('\n'.join(block))+'</code></pre>');i+=1;continue
        heading=re.match(r'^(#{1,6}) (.*)$',line)
        if heading:
            level=len(heading[1]);output.append(f'<h{level}>'+inline(heading[2])+f'</h{level}>');i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                row=lines[i].strip().strip('|').split('|');i+=1
                if all(re.fullmatch(r'\s*:?-+:?\s*',x) for x in row):continue
                rows.append(row)
            output.append('<table><thead><tr>'+''.join('<th>'+inline(c.strip())+'</th>' for c in rows[0])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+inline(c.strip())+'</td>' for c in row)+'</tr>' for row in rows[1:])+'</tbody></table>');continue
        listing=re.match(r'^(?:([-*])|\d+\.) (.*)$',line)
        if listing:
            tag='ul' if listing[1] else 'ol';items=[]
            while i<len(lines) and (entry:=re.match(r'^(?:([-*])|\d+\.) (.*)$',lines[i])):
                if ('ul' if entry[1] else 'ol')!=tag:break
                items.append('<li>'+inline(entry[2])+'</li>');i+=1
            output.append('<'+tag+'>'+''.join(items)+'</'+tag+'>');continue
        paragraph=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|[-*] |\d+\.)',lines[i]):paragraph.append(lines[i]);i+=1
        output.append('<p>'+inline(' '.join(paragraph))+'</p>')
    return '\n'.join(output)

def page(title, markdown):
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>'+STYLE+'</style></head><body><main>'+render(markdown)+'</main></body></html>\n'

if __name__ == '__main__':
    setup=(ROOT/'docs/v099/SETUP.md').read_text()
    (ROOT/'SETUP_v0.9.9.md').write_text(setup)
    rendered=page('GSiS 0.9.9 setup',setup)
    (ROOT/'SETUP_v0.9.9.html').write_text(rendered)
    (ROOT/'docs/v099/SETUP.html').write_text(rendered)
    for prefix in ('CHANGELOG','VALIDATION'):
        path=ROOT/'docs/v099'/f'{prefix}.md'
        release_path=ROOT/f'{prefix}_v0.9.9.md'
        if release_path.exists():path.write_text(release_path.read_text().replace('](docs/v099/', '](').replace('](docs/v098q/', '](../v098q/'))
        elif path.exists():release_path.write_text(path.read_text())
    for source,target,title in [('docs/v099/OPERATING_GUIDE.md','docs/GSiS-v0.9.9-User-Manual.html','GSiS 0.9.9 operating guide'),('docs/v099/ARCHITECTURE.md','docs/architecture/GSiS_v0.9.9_Architecture.html','GSiS 0.9.9 architecture')]:
        rendered=page(title,(ROOT/source).read_text())
        (ROOT/target).write_text(rendered)
        (ROOT/source).with_suffix('.html').write_text(rendered)
    print('Rendered current offline 0.9.9 guides.')
