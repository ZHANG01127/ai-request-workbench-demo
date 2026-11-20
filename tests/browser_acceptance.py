"""以隔離的瀏覽器驗證實際資料與下載檔，不送出任何模型請求。"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from time import perf_counter
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
parser = argparse.ArgumentParser()
parser.add_argument('url')
parser.add_argument('--published', action='store_true')
args = parser.parse_args()
prefix = args.url.rstrip('/') + '/'
screens = EVIDENCE / 'screenshots'
screens.mkdir(exist_ok=True, parents=True)
label = 'GitHub Pages' if args.published else '本機'
checks, errors, assets = [], [], []
report = {'environment':label,'url':prefix,'startedAt':datetime.now(timezone.utc).isoformat(),
          'viewport':[1600,900], 'checks':checks,'errors':errors}
start = perf_counter()


def check(name, detail, condition):
    checks.append({'name':name, 'detail':detail, 'passed':bool(condition)})
    print(('PASS' if condition else 'FAIL'), name, detail, flush=True)
    assert condition, name


def capture(page, name):
    page.evaluate('document.fonts.ready')
    page.screenshot(path=screens/name, animations='disabled')


def test(page):
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('requestfailed',lambda req:errors.append(req.url+' '+str(req.failure)))
    def response(r):
        if r.url.startswith(prefix):
            assets.append({'path':r.url[len(prefix):],'status':r.status})
            if r.status >= 400: errors.append(f'{r.status} {r.url}')
    page.on('response',response)
    page.goto(prefix, wait_until='networkidle')
    expect(page.locator('.case')).to_have_count(3)
    check('載入三筆實測草稿','原始案例 A、B、C 與三張需求卡一一對應',
          page.locator('.case').evaluate_all('(xs)=>xs.map(x=>x.dataset.case)') == ['A','B','C'])
    if args.published: capture(page,'06_published_site.png')
    if not args.published:
        page.get_by_role('link', name='實測紀錄',exact=True).click()
        expect(page.locator('.facts')).to_contain_text('HTTP 200')
        capture(page,'01_gemini_execution.png')
        page.get_by_role('button',name='輸入與原始輸出').click()
        expect(page.locator('.record-grid pre')).to_contain_text('請購')
        capture(page,'02_input_and_output.png')
        page.get_by_role('link',name='草稿審閱',exact=True).click()
    confirm=page.locator('#confirm')
    expect(confirm).to_be_disabled()
    page.locator('#field-owner').fill('   ')
    check('阻擋缺漏欄位','管理部負責人為空白字元，確認按鈕停用',
          confirm.is_disabled() and '負責人' in page.locator('#hint').inner_text())
    page.locator('#field-owner').fill('')
    if not args.published: capture(page,'03_draft_review.png')
    page.locator('#field-owner').fill('測試同仁 A')
    page.reload(wait_until='networkidle')
    expect(page.locator('#field-owner')).to_have_value('測試同仁 A')
    page.locator('summary').click()
    page.locator('#field-missing').fill('')
    page.locator('#field-problem').fill('承辦人需要逐一確認請購單缺漏的欄位。')
    check('補件與草稿保存','重新整理保留承辦人，補齊後可確認',confirm.is_enabled())
    model=json.loads(next((ROOT/'docs/evidence/gemini').glob('attempt-*/parsed.json')).read_text())
    expected={}
    model_id=json.loads(next((ROOT/'docs/evidence/gemini').glob('attempt-*/execution.json')).read_text())['responseId']
    fields=['department','title','problem','output','steps','owner','confirm','missing']
    for id_, wanted in [('A','進行中'),('B','已完成'),('C','待確認')]:
        if id_!='A':
            page.get_by_role('link',name='草稿審閱',exact=True).click()
            page.locator(f'[data-case="{id_}"]').click()
        values={}
        for field in fields:
            val=page.locator('#field-'+field).input_value()
            values[field]=val.splitlines() if field in ('steps','confirm','missing') else val
        values.update(id=id_,sourceRequest=page.locator('.source p').inner_text(),confirmed=True,status=wanted,modelRun=model_id)
        expected[id_]=values
        confirm.click()
        select=page.locator(f'[data-state="{id_}"]')
        expect(select).to_have_value('待確認')
        select.select_option(wanted)
    page.reload(wait_until='networkidle')
    expect(page.locator('tbody tr')).to_have_count(3)
    for id_,item in expected.items():
        expect(page.locator(f'[data-state="{id_}"]')).to_have_value(item['status'])
    check('任務與狀態跨重整保存','A 進行中、B 已完成、C 待確認，共三筆',page.locator('tbody tr').count()==3)
    if not args.published: capture(page,'04_saved_task.png')
    def export():
        with page.expect_download() as result:
            page.locator('#export').click()
        data=json.loads(Path(result.value.path()).read_text())
        visible_ids=page.locator('tr[data-id]').evaluate_all('(xs)=>xs.map(x=>x.dataset.id)')
        assert data==[expected[i] for i in visible_ids]
        return data
    all_tasks=export()
    page.locator('#dept').select_option('管理部')
    page.locator('#status').select_option('已完成')
    expect(page.locator('.empty')).to_be_visible()
    assert export()==[]
    page.locator('#status').select_option('進行中')
    check('部門與狀態交叉篩選','管理部 × 已完成為零筆，改選進行中只顯示 A',
          page.locator('tr[data-id]').count()==1 and page.locator('tr[data-id]').get_attribute('data-id')=='A')
    filtered=export()
    check('下載並逐欄比對 JSON','三筆、一筆及零筆匯出均可解析，欄位與畫面一致',len(all_tasks)==3 and len(filtered)==1)
    if not args.published:
        capture(page,'07_filtered_tasks.png')
        (EVIDENCE/'exported-tasks.json').write_text(json.dumps(all_tasks,ensure_ascii=False,indent=2)+'\n')
    assert model[0]['owner']=='' and '負責人' in model[0]['missing']
    page.get_by_role('link',name='實測紀錄',exact=True).click()
    data=page.request.get(prefix+'evidence/gemini/attempt-01/parsed.json').json()
    check('原始證據獨立','人工修改後，原始 A 仍缺負責人',data==model)
    if args.published:
        page.get_by_role('button',name='瀏覽器驗收').click()
        expect(page.locator('#test-results')).to_contain_text('通過')
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('link',name='草稿審閱',exact=True).click()
    check('窄螢幕與資源載入','390px 寬度無整頁橫向捲動，無失敗資源及腳本錯誤',
          page.evaluate('document.documentElement.scrollWidth<=innerWidth') and not errors)


with sync_playwright() as pw:
    path=os.environ.get('BROWSER_BIN')
    browser=pw.chromium.launch(executable_path=path or None)
    report['browser']='Chromium '+browser.version
    page=browser.new_page(viewport={'width':1600,'height':900},locale='zh-TW',timezone_id='Asia/Taipei')
    try:
        test(page)
    except Exception as err:
        errors.append(str(err))
        raise
    finally:
        report.update(finishedAt=datetime.now(timezone.utc).isoformat(),seconds=round(perf_counter()-start,3),assets=assets)
        dest=EVIDENCE/'published-browser.json' if args.published else ROOT/'docs/evidence/browser.json'
        dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if not args.published:
        page.set_viewport_size({'width':1600,'height':900})
        page.get_by_role('link',name='實測紀錄',exact=True).click()
        page.get_by_role('button',name='瀏覽器驗收').click()
        expect(page.locator('#test-results')).to_contain_text(f'{len(checks)} / {len(checks)} 通過')
        expect(page.locator('#toast')).to_be_empty()
        page.locator('#workspace').scroll_into_view_if_needed()
        capture(page,'05_test_results.png')
    browser.close()
