"""以官方 generateContent REST API 執行單次三案驗證。"""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/evidence/gemini'
PRIVATE = ROOT / '.private'
MODEL = 'gemini-3.1-flash-lite'
URL = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent'
FIELDS = ('department', 'title', 'problem', 'output', 'steps', 'owner', 'confirm', 'missing')
LISTS = ('steps', 'confirm', 'missing')


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds')


def save(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def validate(rows, cases):
    if not isinstance(rows, list) or len(rows) != len(cases):
        raise ValueError('案例數不符')
    for case in cases:
        matches = [r for r in rows if r['id'] == case['id']]
        if len(matches) != 1:
            raise ValueError('案例 ID 不符')
        row = matches[0]
        for field in FIELDS:
            val = row[field]
            if field in LISTS:
                if not isinstance(val, list) or not all(isinstance(x, str) and x.strip() for x in val):
                    raise ValueError('清單格式錯誤')
            elif not isinstance(val, str) or (field != 'owner' and not val.strip()):
                raise ValueError('文字欄位格式錯誤')
        if row['department'] != case['department'] or row['owner'] != case['owner']:
            raise ValueError('部門或指派與來源不符')
        if case['id'] == 'A' and not any('負責人' in item for item in row['missing']):
            raise ValueError('未標記缺少負責人')


def run():
    PRIVATE.mkdir(exist_ok=True)
    with (PRIVATE / 'run.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if (DEST / 'verified.json').exists():
            raise SystemExit('已有完成的實測，本次未呼叫。')
        keyfile = PRIVATE / 'gemini-key'
        key = os.environ.get('GEMINI_API_KEY') or (keyfile.read_text().strip() if keyfile.exists() else '')
        if not key or not (PRIVATE / 'free-tier-confirmed').is_file():
            raise SystemExit('待完成：請先確認專案免費層及本機金鑰。')
        cases = json.loads((DEST / 'inputs.json').read_text())
        prompt = ('以下為三筆合成示範資料。請用繁體中文，為每一案建立草稿。保留 id。'
                  'department 是部門，title 是簡明任務名稱，problem 是原始問題，output 是預期產出，'
                  'steps 是建議步驟，owner 只能逐字使用提供的人名，未提供請填空字串，'
                  'confirm 是需要人工確認的項目，missing 是尚缺少的資訊。負責人未提供時須列入 missing。'
                  '建議只能寫為建議，不得把未提供的資訊補成事實，不得新增期限、人名或公司。\n'
                  + json.dumps(cases, ensure_ascii=False))
        props = {f: ({'type':'ARRAY','items':{'type':'STRING'}} if f in LISTS else {'type':'STRING'})
                 for f in ('id', *FIELDS)}
        payload = {'contents':[{'parts':[{'text':prompt}]}], 'generationConfig':{
            'responseMimeType':'application/json', 'responseSchema':{'type':'ARRAY','items':{
                'type':'OBJECT','properties':props,'required':list(props)}}}}
        attempts = sorted(DEST.glob('attempt-*'))
        if len(attempts) >= 5:
            raise SystemExit('已達五次上限。')
        folder = DEST / f'attempt-{len(attempts)+1:02d}'
        folder.mkdir()
        save(folder / 'request.json', payload)
        meta = {'startedAt':now(), 'requestedModel':MODEL, 'endpoint':URL, 'caseCount':len(cases),
                'projectTier':'Free tier（於 AI Studio 專案列核對）', 'status':'開始請求'}
        start = time.monotonic()
        save(folder / 'execution.json', meta)
        try:
            request = urllib.request.Request(URL, data=(folder / 'request.json').read_bytes(),
                         headers={'Content-Type':'application/json', 'x-goog-api-key':key})
            with urllib.request.urlopen(request, timeout=120) as resp:
                body = resp.read()
                meta['httpStatus'] = resp.status
            (folder / 'response.json').write_bytes(body)
            raw = json.loads(body)
            meta.update(modelVersion=raw.get('modelVersion'), responseId=raw.get('responseId'),
                        usageMetadata=raw.get('usageMetadata'))
            item = raw['candidates'][0]
            if item.get('finishReason') != 'STOP':
                raise ValueError('模型未完整結束')
            rows = json.loads(''.join(p.get('text','') for p in item['content']['parts'] if not p.get('thought')))
            validate(rows, cases)
            save(folder / 'parsed.json', rows)
            meta['status'] = '驗證通過'
        except urllib.error.HTTPError as err:
            meta.update(status='API 拒絕請求', httpStatus=err.code)
            error = json.loads(err.read()).get('error', {})
            meta['error'] = str(error.get('message','')).replace(key, '[已遮蔽]')[:1500]
            raise SystemExit(f'HTTP {err.code}，詳見 execution.json')
        except Exception as err:
            meta.update(status='未通過', error=str(err).replace(key, '[已遮蔽]')[:250])
            raise
        finally:
            meta.update(endedAt=now(), elapsedSeconds=round(time.monotonic()-start,3))
            save(folder / 'execution.json', meta)
        save(DEST / 'verified.json', {'run':folder.name, 'status':meta['status']})
        print(meta['status'], meta['modelVersion'], meta['elapsedSeconds'], '秒')


if __name__ == '__main__':
    run()
