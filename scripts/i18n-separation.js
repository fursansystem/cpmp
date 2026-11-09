// Checks the one thing the whole effort is for: that a page shows ONE language.
//
// Run it in the page (dev tools console, or any browser automation):
//
//   const leaks = await import('/scripts/i18n-separation.js').then(m => m.checkSeparation());
//
// It walks the rendered text rather than the source, so it catches what the scanner cannot: strings
// that arrive from the server, labels resolved at runtime, and anything a component builds by hand.
//
// Text people typed is skipped, but only where a <UserText> says so. Until a site is wrapped, its
// content is reported — which is correct: an unmarked name is indistinguishable from a forgotten label.
const ARABIC = /[؀-ۿ]/;
const LATIN_WORD = /[A-Za-z]{3,}/;

function isUserContent(el) {
  // Only an explicit <UserText> counts. The `unicode-bidi: plaintext` on TableCell and Badge is
  // there for layout and says nothing about who wrote the text — treating it as a content marker
  // would make this check blind to every label that happens to sit in a table cell.
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.dataset?.userText !== undefined) return true;
  }
  return false;
}

/**
 * @returns {{ language: string, dir: string, leaks: {text: string, tag: string, path: string}[] }}
 */
export function checkSeparation() {
  const language = document.documentElement.lang;
  const wantArabic = language === "ar";
  const leaks = [];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (!text || text.length < 2) continue;

    const el = node.parentElement;
    if (!el || !el.offsetParent) continue; // not rendered
    if (isUserContent(el)) continue;
    if (el.closest("code, pre, [data-testid]")?.tagName === "CODE") continue;

    const hasArabic = ARABIC.test(text);
    const hasLatinWord = LATIN_WORD.test(text);
    const wrong = wantArabic ? hasLatinWord && !hasArabic : hasArabic;
    if (!wrong) continue;

    const path = [];
    for (let n = el; n && n !== document.body && path.length < 4; n = n.parentElement) {
      path.unshift(n.tagName.toLowerCase() + (n.dataset?.testid ? `[${n.dataset.testid}]` : ""));
    }
    leaks.push({ text: text.slice(0, 80), tag: el.tagName.toLowerCase(), path: path.join(" > ") });
  }

  return { language, dir: document.documentElement.dir, leaks };
}

/** A one-line verdict, for a quick look. */
export function separationSummary() {
  const { language, dir, leaks } = checkSeparation();
  return `${language} (${dir}): ${leaks.length} leak(s)` + (leaks.length ? ` — e.g. ${leaks.slice(0, 3).map((l) => JSON.stringify(l.text)).join(", ")}` : "");
}
