import './style.css';
import * as Core from './core';
import { PROLOGUE } from './content/lines';
import { createDogIdlePlayer } from './render/dog-idle';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// core が動くことだけを確かめる（7日分を自動で進める）
const st = Core.newGame('ハル', 1);
while (st.day < 8) {
  Core.pet(st); Core.play(st);
  Core.rest(st); Core.resolveNight(st, 1); Core.nextDay(st);
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>配給は<span>一人分</span></h1>
  <figure class="dog-idle-stage">
    <img class="dog-idle" src="${import.meta.env.BASE_URL}assets/dog/idle-v12/frame_00.png"
      width="320" height="320" alt="首をかしげたり瞬きしたりしながら待っている犬">
  </figure>
  <p class="dog-idle-error" role="status" hidden></p>
  ${PROLOGUE.map(l => l.startsWith('[ai]') ? `<p class="ai">${esc(l.slice(4))}</p>` : `<p>${esc(l)}</p>`).join('')}
  <div class="dev">開発版（第1段階：基盤とゲームルールの移植）<br>
  core 自己確認：${st.day}日目・信頼 ${st.dog.trust}・登録 ${st.registered ? 'あり' : 'なし'}<br>
  <a href="${import.meta.env.BASE_URL}lab/dog.html">黒柴の試作を見る</a></div>`;

const image = app.querySelector<HTMLImageElement>('.dog-idle')!;
try {
  const idle = await createDogIdlePlayer(image, {
    baseUrl: `${import.meta.env.BASE_URL}assets/dog/idle-v12/`,
  });
  image.dataset.ready = 'true';
  if (import.meta.hot) import.meta.hot.dispose(() => idle.destroy());
} catch (error) {
  // The already displayed base frame remains visible if another asset fails to load.
  const message = app.querySelector<HTMLParagraphElement>('.dog-idle-error')!;
  message.hidden = false;
  message.textContent = '犬のアニメーションを読み込めませんでした。';
  console.error(error);
}
