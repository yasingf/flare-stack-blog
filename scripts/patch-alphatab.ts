/**
 * alphaTab BeamingHelper 空值保护补丁
 *
 * alphaTab v1.8.1 内部 BeamingHelper 类的 `beatOfHighestNote` / `beatOfLowestNote`
 * getter 直接访问 `this.highestNoteInHelper.beat`，当 beaming group 中
 * 只有休止符时这些属性为 null，导致运行时崩溃。
 *
 * 此脚本在 postinstall 时自动对源码进行安全补丁（添加可选链 + fallback）。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = resolve(
  import.meta.dirname ?? ".",
  "../node_modules/@coderline/alphatab/dist/alphaTab.core.mjs",
);

if (!existsSync(TARGET)) {
  console.log("[patch-alphatab] alphaTab not installed, skipping.");
  process.exit(0);
}

let code = readFileSync(TARGET, "utf-8");
let patched = false;

// beatOfLowestNote
if (code.includes("return this.lowestNoteInHelper.beat;")) {
  code = code.replace(
    /return this\.lowestNoteInHelper\.beat;/g,
    "return this.lowestNoteInHelper?.beat ?? this.beats[0];",
  );
  patched = true;
}

// beatOfHighestNote
if (code.includes("return this.highestNoteInHelper.beat;")) {
  code = code.replace(
    /return this\.highestNoteInHelper\.beat;/g,
    "return this.highestNoteInHelper?.beat ?? this.beats[0];",
  );
  patched = true;
}

if (patched) {
  writeFileSync(TARGET, code, "utf-8");
  console.log("[patch-alphatab] ✓ BeamingHelper null guard applied");
} else {
  console.log("[patch-alphatab] Already patched or pattern not found, skipping.");
}
