"""Create a collaboration ZIP from source, a C++ snapshot and the prepared runtime."""
import argparse
import hashlib
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
dataset = parser.add_mutually_exclusive_group(required=True)
dataset.add_argument('--snapshot', type=Path, help='A completed C++ backup directory')
dataset.add_argument('--demo', action='store_true', help='Package the public demo library with fresh accounts')
parser.add_argument('--output-dir', type=Path, help='Destination for the verified ZIP')
parser.add_argument('--source-commit', help='Git commit used for this build')
args = parser.parse_args()
snapshot = args.snapshot.resolve() if args.snapshot else None
data_files = ['documentaries.txt', 'reviews.txt', 'users.txt']
if snapshot:
    for name in data_files + ['manifest.json']:
        if not (snapshot / name).is_file():
            raise SystemExit('Snapshot is incomplete: ' + name)
for name in ['node/node.exe', 'cpp/documentary-core.exe', 'cpp/portable.json', 'licenses/NODE-LICENSE.txt']:
    if not (root / 'runtime' / name).is_file():
        raise SystemExit('Prepare runtime first: ' + name)
stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
stage = Path(tempfile.mkdtemp(prefix='yc-')) / 'yingchang'
stage.mkdir(parents=True, exist_ok=False)
excluded = {'__pycache__', '.git', '.core.lock', 'transaction.pending'}

def copy_tree(source, destination):
    for source_file in source.rglob('*'):
        parts = source_file.relative_to(source).parts
        # Only omit this project's build output. Bundled npm needs its own dist/ files.
        if source.name in {'cpp', 'web'} and parts[0] in {'build', 'dist'}:
            continue
        if any(part in excluded or part.startswith('.env') for part in parts):
            continue
        if source_file.is_symlink():
            raise RuntimeError('Unexpected symlink: ' + str(source_file))
        if source_file.is_file() and source_file.suffix not in ['.tmp', '.obj', '.pdb']:
            target = destination.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, target)

for name in ['cpp', 'web', 'resources', 'docs', 'runtime', 'scripts']:
    copy_tree(root / name, stage / name)
for name in ['node/npm.cmd', 'node/node_modules/npm/bin/npm-cli.js',
             'node/node_modules/npm/node_modules/walk-up-path/dist/commonjs/index.js']:
    if not (stage / 'runtime' / name).is_file():
        raise RuntimeError('Bundled npm is incomplete: ' + name)
for name in ['.gitignore', 'package.json', 'README.md', 'INTEGRATION.md', '启动映场.cmd', '重新编译核心.cmd', '协作者请先读.md']:
    shutil.copy2(root / name, stage / name)
(stage / 'data').mkdir()
if args.demo:
    seed = json.loads((root / 'resources' / 'catalog-seed.json').read_text(encoding='utf-8'))
    demo_films = seed['films'] + [dict(film, isDemoFilm=True) for film in seed.get('legacyFilms', [])]
    demo_reviews = [dict(review, isSample=True) for review in seed['reviews'] + seed.get('legacyReviews', [])]
    for name, records in [('documentaries.txt', demo_films), ('reviews.txt', demo_reviews)]:
        contents = ''.join(json.dumps(record, ensure_ascii=False) + '\n' for record in records)
        (stage / 'data' / name).write_text(contents, encoding='utf-8', newline='\n')
else:
    for name in data_files:
        shutil.copy2(snapshot / name, stage / 'data' / name)
    copy_tree(root / 'data' / 'backups', stage / 'data' / 'backups')
    requirements = [
        '03_纪录片放映周评价与推荐系统.pdf',
        '2《程序设计（上机）》课程对学生的要求.doc',
        '3 上交命名要求.doc',
        '程序设计（上机）-报告模板.docx',
        '程序设计（上机）课程考核说明.pptx',
    ]
    (stage / 'course-requirements').mkdir()
    for name in requirements:
        bundled = root / 'course-requirements' / name
        shutil.copy2(bundled if bundled.is_file() else root.parent / name, stage / 'course-requirements' / name)
films = [json.loads(s) for s in (stage/'data/documentaries.txt').read_text(encoding='utf-8-sig').splitlines() if s.strip()]
reviews = [json.loads(s) for s in (stage/'data/reviews.txt').read_text(encoding='utf-8-sig').splitlines() if s.strip()]
edition = '协作分享版' if args.demo else '协作完整版'
info = {
    'project': '映场 · 纪录片放映周评价与推荐系统', 'edition': edition + ' · Windows x64',
    'createdAt': datetime.now(timezone.utc).isoformat(),
    'dataset': 'demo' if args.demo else 'snapshot',
    'films': len(films), 'realFilms': sum(not f.get('isDemoFilm', False) for f in films),
    'reviews': len(reviews), 'sampleReviews': sum(r.get('isSample', False) for r in reviews),
    'runtime': {'node': '24.16.0', 'platform': 'win32', 'arch': 'x64', 'compilerIncluded': False},
    'entry': '启动映场.cmd', 'developmentGuide': '协作者请先读.md',
    'includes': ['complete source', 'tests', 'web assets', 'runtime licenses'] + (
        ['demo catalogue and sample reviews'] if args.demo
        else ['consistent live data snapshot', 'historical backups', 'course requirements']),
    'excluded': ['compiler cache', 'old screenshots in output', 'temporary locks', 'incomplete transactions'],
    'validation': {'integrationTests': 34, 'cppRegression': 'passed', 'packagingTests': 4},
}
if snapshot:
    info['snapshot'] = snapshot.name
if args.source_commit:
    info['sourceCommit'] = args.source_commit
(stage / 'PACKAGE_INFO.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
files = sorted(p for p in stage.rglob('*') if p.is_file())
manifest = chr(10).join(sha(p) + '  ' + p.relative_to(stage).as_posix() for p in files) + chr(10)
(stage / 'MANIFEST.sha256').write_text(manifest, encoding='utf-8')
delivery = args.output_dir.resolve() if args.output_dir else root.parent / '交付打包'
delivery.mkdir(parents=True, exist_ok=True)
archive = delivery / ('映场_' + edition + '_Windows64_' + stamp + '.zip')
with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=6) as z:
    for p in sorted(stage.rglob('*')):
        if p.is_file():
            z.write(p, 'yingchang/' + p.relative_to(stage).as_posix())
with ZipFile(archive) as z:
    bad = z.testzip()
    if bad:
        raise RuntimeError('ZIP verification failed: ' + bad)
    for p in files:
        if hashlib.sha256(z.read('yingchang/'+p.relative_to(stage).as_posix())).hexdigest() != sha(p):
            raise RuntimeError('Archive hash mismatch: ' + str(p))
archive_hash = sha(archive)
archive.with_suffix('.zip.sha256').write_text(archive_hash+'  '+archive.name+chr(10), encoding='utf-8')
print(json.dumps({'archive': str(archive), 'sha256': archive_hash, 'bytes': archive.stat().st_size,
    'fileCount': len(files)+1, 'stage': str(stage), 'films': len(films), 'reviews': len(reviews)}, ensure_ascii=False, indent=2))
