"""Verify and render every page produced by the synthetic legacy archive flow."""
import json
from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[2]
records = []
headings = ['总体评价', '优秀表达', '诊断与提升', '内容优化建议', '升级版习作', '标准参考范文']
for name in ['legacy-archive-zero-report', 'legacy-archive-report']:
    path = root / 'output' / (name + '.pdf')
    doc = fitz.open(path)
    combined = ''.join(page.get_text() for page in doc)
    assert all(heading in combined for heading in headings), 'Report section missing'
    for number, page in enumerate(doc, 1):
        assert abs(page.rect.width - 595.28) < 2 and abs(page.rect.height - 841.89) < 2, 'Not A4'
        blocks = page.get_text('blocks')
        footers = [b for b in blocks if 'AI 辅助批阅' in b[4]]
        body = [b for b in blocks if b not in footers]
        assert len(footers) == 1, 'Missing or duplicate AI attribution'
        assert len(''.join(b[4] for b in body).strip()) > 40, 'Footer-only page'
        assert all(b[3] <= footers[0][1] - 1 for b in body), 'Footer overlaps report content'
        page.get_pixmap(matrix=fitz.Matrix(1.1, 1.1)).save(str(root / 'output' / (name + '-page-' + str(number) + '.png')))
    records.append({'file': path.name, 'pages': len(doc), 'sections': 6, 'a4': True, 'noFooterOnlyPage': True, 'noFooterOverlap': True})
output = {'passed': True, 'reports': records, 'syntheticOnly': True, 'physicalPrinterTested': False}
(root / 'output' / 'legacy-archive-print-checks.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output))
