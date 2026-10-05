import { describe, expect, it } from 'vitest';
import { focusableWithin, trapTarget } from './focus';

function build(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('focusableWithin', () => {
  it('lists tabbable elements in order and skips disabled, hidden, inert and tabindex=-1 ones', () => {
    const root = build(`
      <a href="#a" id="a">a</a><a id="no-href">x</a>
      <button id="b">b</button><button disabled>d</button>
      <input id="c"><input type="hidden"><input disabled>
      <button tabindex="-1">t</button><div tabindex="0" id="d">d</div>
      <button hidden>h</button><div inert><button>i</button></div>
      <select id="e"></select><textarea id="f"></textarea>`);
    expect(focusableWithin(root).map((el) => el.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    root.remove();
  });
});

describe('trapTarget', () => {
  it('wraps at both ends and leaves moves in the middle to the browser', () => {
    const root = build(
      '<button id="1">1</button><button id="2">2</button><button id="3">3</button>',
    );
    const [one, two, three] = focusableWithin(root);
    expect(trapTarget(root, three!, false)).toBe(one);
    expect(trapTarget(root, one!, true)).toBe(three);
    expect(trapTarget(root, two!, false)).toBeNull();
    expect(trapTarget(root, document.body, false)).toBe(one);
    expect(trapTarget(root, document.body, true)).toBe(three);
    root.remove();
  });

  it('keeps focus on the container when nothing inside can take it', () => {
    const root = build('<p>text</p>');
    expect(trapTarget(root, document.body, false)).toBe(root);
    root.remove();
  });
});
