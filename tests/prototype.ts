/** prototype/haikyu.html の CORE ブロックをそのまま読み込む（移植の等価性検証用） */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadPrototypeCore(): any {
  const html = readFileSync(fileURLToPath(new URL('../prototype/haikyu.html', import.meta.url)), 'utf8');
  const m = html.match(/\/\*CORE-START\*\/([\s\S]*?)\/\*CORE-END\*\//);
  if (!m) throw new Error('CORE block not found');
  return new Function(`${m[1]}\nreturn Core;`)();
}
