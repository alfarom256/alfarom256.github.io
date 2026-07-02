/*
 * post.js — "printing" reveal for a single post.
 *
 * The post terminal opens blank with a brief "Loading…", then prints the
 * article block-by-block (fast, so the reader isn't kept waiting). Progressive
 * enhancement: no `.js` class → everything is already visible; reduced-motion
 * reveals it all at once.
 */
(function () {
  "use strict";

  var term = document.getElementById("post-term");
  if (!term) return;
  var boot = document.getElementById("post-boot");
  var content = document.getElementById("post-content");
  if (!boot || !content) return;

  var contentEl = content.querySelector(".content");
  var header = content.querySelector("header");
  var endPrompt = content.querySelector(".cmd.end");

  // the "lines" that print in order: title header, each content block, prompt
  var lines = [];
  if (header) lines.push(header);
  if (contentEl) for (var c = 0; c < contentEl.children.length; c++) lines.push(contentEl.children[c]);
  if (endPrompt) lines.push(endPrompt);

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    boot.style.display = "none";
    content.classList.add("on");
    lines.forEach(function (el) { el.classList.add("pline", "shown"); });
    return;
  }

  lines.forEach(function (el) { el.classList.add("pline"); });

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function play() {
    boot.style.display = "block";
    var load = document.createElement("div");
    load.className = "boot-line";
    load.textContent = "Loading";
    boot.appendChild(load);
    for (var d = 0; d < 6; d++) { await sleep(115); load.textContent += "."; }
    await sleep(180);

    boot.style.display = "none";
    content.classList.add("on");
    for (var i = 0; i < lines.length; i++) {
      lines[i].classList.add("shown");
      await sleep(30);
    }
  }
  play();
})();
