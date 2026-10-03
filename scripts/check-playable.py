import asyncio,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  ctx=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
  page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:4173/mofumofu/');await page.get_by_role('button',name='ふたりの暮らしをはじめる').click();await page.wait_for_function("document.querySelector('img.dog-idle').dataset.motion==='idle'")
  await page.screenshot(path=str(ROOT/'docs/verification/home-mobile.png'),full_page=True)
  await page.get_by_role('button',name='なでる',exact=False).first.click();await page.wait_for_function("document.querySelector('img').dataset.motion==='pet'")
  await page.locator('[data-action=feed]').click();await page.get_by_role('button',name='半分ずつ').click();await page.wait_for_function("document.querySelector('img').dataset.motion==='eat'")
  await page.locator('[data-action=play]').click();await page.wait_for_function("document.querySelector('img').dataset.motion==='play'")
  await page.locator('[data-action=explore]').click();await page.get_by_role('button',name='旧商店街').click();await page.get_by_role('button',name='部屋で休む').click();await page.reload();assert await page.locator('dialog').count()==1;assert not await page.locator('dialog').is_visible()
  for day in range(1,8):
   await page.locator('[data-action=rest]').click()
   if day==1:
    await page.wait_for_function("document.querySelector('img').dataset.motion==='sleep'");await page.screenshot(path=str(ROOT/'docs/verification/night-mobile.png'),full_page=True);await page.locator('dialog .close').click();await page.reload();await page.locator('[data-action=rest]').click()
   await page.locator('dialog .choices button').first.click();await page.get_by_role('button',name='次の朝へ').click()
  data=await page.evaluate("JSON.parse(localStorage.getItem('mofumofu-save-v2'))");assert data['game']['day']==8;assert data['game']['chapter']==1
  await page.locator('[data-tab=diary]').click();await page.screenshot(path=str(ROOT/'docs/verification/diary-mobile.png'),full_page=True)
  await page.locator('[data-tab=home]').click()
  widths=[]
  for width in [320,390,430]:
   await page.set_viewport_size({'width':width,'height':844});await page.wait_for_timeout(250);widths.append({'width':width,'overflow':await page.evaluate('document.documentElement.scrollWidth>innerWidth')});assert not widths[-1]['overflow']
  await page.evaluate("navigator.serviceWorker.ready.then(()=>true)");await page.wait_for_timeout(1500);await ctx.set_offline(True);await page.reload();await page.wait_for_function("document.querySelector('img').dataset.motion==='idle'");await page.locator('[data-action=pet]').click();await page.wait_for_function("document.querySelector('img').dataset.motion==='pet'")
  assert not errors,errors
  (ROOT/'docs/verification/playable-check.json').write_text(json.dumps({'browser':'Chromium','widths':widths,'chapterComplete':True,'reloadSave':True,'offlineReloadAndPet':True,'errors':errors},indent=2)+'\n')
  await browser.close()
asyncio.run(main())
