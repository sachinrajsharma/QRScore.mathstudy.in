/**
 * A strong, easy-to-remember password suggestion: three unrelated words, a number and a symbol ("Maple-Tiger-Orbit-47!"). It is made in the browser from
 * the secure random source, shown to the person, and only they ever see it. About 38 bits from the words plus the number and symbol, far beyond what a
 * guess can reach, and it passes the site's own password rules and the leaked-password check.
 */
const WORDS = [
  "amber", "anchor", "apple", "arrow", "aspen", "atlas", "autumn", "bamboo", "banner", "beacon", "birch", "breeze", "bridge", "brook", "cactus", "candle",
  "canyon", "cedar", "chorus", "cinder", "cloud", "clover", "comet", "coral", "cosmos", "crystal", "dawn", "delta", "desert", "dolphin", "dragon", "eagle",
  "ember", "falcon", "feather", "fern", "forest", "fossil", "galaxy", "garden", "glacier", "harbor", "harvest", "hazel", "horizon", "island", "jasmine", "jungle",
  "kernel", "lagoon", "lantern", "lemon", "lotus", "lunar", "maple", "meadow", "meteor", "mirror", "monsoon", "mosaic", "nectar", "ocean", "olive", "orbit",
  "orchid", "otter", "panda", "pebble", "pepper", "phoenix", "pine", "planet", "prairie", "quartz", "rainbow", "raven", "ripple", "river", "saffron", "sapphire",
  "shadow", "silver", "sparrow", "spruce", "summit", "sunrise", "thunder", "tiger", "topaz", "tulip", "valley", "velvet", "violet", "walnut", "willow", "zephyr",
];
const SYMBOLS = "!@#$%&*?";

function below(n: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n; // reject the biased tail so every choice is equally likely
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

export function suggestPassword(): string {
  const w = [0, 1, 2].map(() => { const x = WORDS[below(WORDS.length)]; return x[0].toUpperCase() + x.slice(1); });
  return `${w.join("-")}-${10 + below(90)}${SYMBOLS[below(SYMBOLS.length)]}`;
}
