"""Read-only source/schema audit. Never imports applications or exports identity rows.

Run with Python >= 3.12 and a SQLite version compatible with the local WordUp DB.
The WordUp service virtualenv supplies a compatible runtime on this host.
"""
import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
from xml.etree import ElementTree as ET
from zipfile import ZipFile
from zoneinfo import ZoneInfo


def readonly(filename):
    db = sqlite3.connect(filename.resolve().as_uri() + '?mode=ro', uri=True)
    db.execute('PRAGMA query_only=ON')
    return db


def scalar(db, sql):
    return db.execute(sql).fetchone()[0]


def inventory(db, wanted):
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    return {
        table: {
            'count': scalar(db, f'SELECT count(*) FROM "{table}"'),
            'columns': [
                {'name': r[1], 'type': r[2], 'primary_key_position': r[5]}
                for r in db.execute(f'PRAGMA table_info("{table}")')
            ],
        }
        for table in wanted if table in tables
    }


def source(path):
    data = path.read_bytes()
    return {'path': str(path), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(),
            'lines': len(data.splitlines())}


def main():
    home = Path.home()
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument('--daily', type=Path, default=home / 'Documents/ChatGPT/每日一句')
    parser.add_argument('--wordup-source', type=Path, default=home / 'Documents/ChatGPT/单词打榜')
    parser.add_argument('--wordup-db', type=Path, default=home / 'Library/Application Support/WordUp/data/wordup.sqlite3')
    parser.add_argument('--reference', type=Path, default=home / 'Desktop/808-26923154420.docx')
    parser.add_argument('--output', type=Path, default=root / 'docs/phase-1-evidence.json')
    args = parser.parse_args()
    legacy = root / 'sources/WriteAscend'
    w = readonly(args.wordup_db)
    d = readonly(args.daily / 'storage/recitations/recitations.sqlite')
    try:
        # IDs are compared in memory and never written to the report.
        all_ids = {r[0] for r in w.execute('SELECT id FROM students')}
        school_ids = {r[0] for r in w.execute("SELECT id FROM students WHERE status='active' AND is_guest=0")}
        links = {r[0] for r in d.execute('SELECT wordup_id FROM wordup_account_links')}
        with ZipFile(args.reference) as z:
            xml = ET.fromstring(z.read('word/document.xml'))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        paragraphs = [''.join(n.text or '' for n in p.findall('.//w:t', ns))
                      for p in xml.findall('.//w:p', ns)]
        sections = Counter(t for t in paragraphs if t.startswith('【') and t.endswith('】'))
        paths = [legacy / 'index.html', legacy / 'CNAME']
        paths += [args.daily / p for p in [
            'package.json', 'src/server.mjs', 'src/config.mjs', 'src/teacher-auth.mjs',
            'src/wordup-identity.mjs', 'src/wordup-gateway.mjs', 'src/fusion-store.mjs',
            'src/registered-accounts.mjs', 'src/recitation-api.mjs', 'src/recitation-store.mjs',
            'src/learning-api.mjs', 'src/learning-reports.mjs', 'src/journey-store.mjs',
            'src/journey-api.mjs', 'public/login-routing.mjs', 'public/login.mjs',
            'deploy/cloudflare/wrangler.jsonc', 'deploy/cloudflare/worker.mjs',
        ]]
        paths += [args.wordup_source / 'server/local_api.py']
        paths += list((home / 'Library/Application Support/WordUp/venv/lib').glob('python*/site-packages/server/local_api.py'))
        payload = {
            'schema': 'writeascend-phase1-audit-v1',
            'collected_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
            'sqlite_version': sqlite3.sqlite_version,
            'scope': 'read-only schemas, aggregate counts and code; no account rows, credentials or student writing exported',
            'writeascend': {
                'repository': 'https://github.com/NewsunLee007/WriteAscend',
                'commit': subprocess.check_output(['git', '-C', str(legacy), 'rev-parse', 'HEAD'], text=True).strip(),
                'index_blob': subprocess.check_output(['git', '-C', str(legacy), 'rev-parse', 'HEAD:index.html'], text=True).strip(),
                'domain': (legacy / 'CNAME').read_text().strip(),
            },
            'sources': [source(p) for p in paths],
            'wordup': {
                'database_path': str(args.wordup_db),
                'tables': inventory(w, ['students', 'teacher_accounts', 'public_accounts']),
                'active_school_students': len(school_ids),
                'grade_class_counts': [
                    {'grade': r[0], 'students': r[1], 'classes': r[2]}
                    for r in w.execute("SELECT grade,count(*),count(DISTINCT class_name) FROM students WHERE status='active' AND is_guest=0 GROUP BY grade")
                ],
                'same_class_same_name_groups': scalar(w, "SELECT count(*) FROM (SELECT class_name,name FROM students WHERE status='active' AND is_guest=0 GROUP BY class_name,name HAVING count(*)>1)"),
                'same_name_across_classes_groups': scalar(w, "SELECT count(*) FROM (SELECT name FROM students WHERE status='active' AND is_guest=0 GROUP BY name HAVING count(DISTINCT class_name)>1)"),
            },
            'daily': {
                'tables': inventory(d, ['students', 'classes', 'wordup_account_links',
                    'learning_progress', 'learning_reviews', 'journey_drafts',
                    'journey_draft_versions', 'journey_evidence', 'journey_reviews', 'journey_plans']),
                'account_links': len(links),
                'links_without_authority_account': len(links - all_ids),
                'active_school_accounts_without_link': len(school_ids - links),
                'unlinked_active_local_students': scalar(d, 'SELECT count(*) FROM students s LEFT JOIN wordup_account_links l ON l.student_id=s.id WHERE l.wordup_id IS NULL AND s.active=1'),
                'writing_self_reports': scalar(d, "SELECT count(*) FROM learning_progress WHERE task_id='writing'"),
                'journey_plan_status': dict(d.execute('SELECT status,count(*) FROM journey_plans GROUP BY status')),
            },
            'reference_document': {
                **source(args.reference),
                'essay_count': sum(bool(re.match(r'^\d{2}-', t)) for t in paragraphs),
                'section_counts': dict(sections),
                'purpose': 'content comparison only; not the replacement export template; layout not assessed',
            },
        }
    finally:
        w.close()
        d.close()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'active_school_students': len(school_ids),
                      'account_links': len(links), 'reference_essays': payload['reference_document']['essay_count']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
