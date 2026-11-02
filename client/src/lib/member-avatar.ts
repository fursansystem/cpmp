// Shared avatar presentation for team members, so the card and the details
// dialog always render the same initials and colour for a given member.

// Static class strings so Tailwind keeps them at build time.
const AVATAR_COLORS = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/25",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/25",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/25",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/25",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-500/25",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-indigo-500/25",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-500/25",
];

// Names often carry a bracketed prefix such as "(ARCH) ammarhome", so strip
// punctuation (ASCII and Arabic) before building the initials.
const PUNCTUATION = /[!-\/:-@\[-`{-~،؛؟٪-٭۔ -⁯]/g;

export function getInitials(name: string) {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(PUNCTUATION, ""))
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
