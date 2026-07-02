/*
 * boot.js — SpaceOS faux boot sequence for the home terminal.
 *
 * Prints an ASCII space-art SpaceOS splash + POST log for ~2s, then "runs"
 * `ls -la ./posts` and `cat about.txt`, revealing the post list and about
 * blurb. Progressive enhancement: without JS (no `.js` class) everything is
 * already visible; reduced-motion skips straight to the finished console.
 */
(function () {
  "use strict";

  var term = document.getElementById("home-term");
  if (!term) return;
  var boot = document.getElementById("boot");
  var cons = document.getElementById("console");
  if (!boot || !cons) return;

  var outs = cons.querySelectorAll(".out");
  var typedEls = cons.querySelectorAll(".typed");
  var endPrompt = cons.querySelector(".cmd.end");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // reduced motion → show the finished console, no animation
  if (reduce) {
    boot.style.display = "none";
    cons.classList.add("on");
    for (var a = 0; a < outs.length; a++) outs[a].classList.add("show");
    if (endPrompt) endPrompt.classList.add("show");
    return;
  }

  var ART = String.raw`
        .     *          _.-'''''-._            .    *
   *          .        .'   .    o    '.     *
        .            /    *     ()      \        .    *
   .        *       :   .    .      .    :   S P A C E   O S
        .           :    ()      *    .  :   ================
   *          .      \     .    .      /     phosphor kernel 1.0
        .    *        '.    *     .   .'      (c) WiredSystems
   .          *        '-._______.-'    *  .`;

  var LOG = [
    "",
    "SpaceOS BIOS v1.0    POST ............ OK",
    "CPU: WiredCore 6502 @ 4.77MHz ........ OK",
    "Base Mem: 640K   Ext: 64512K ......... OK",
    "Scanning subspace for anomalies ...... OK",
    "Calibrating phosphor emitters ........ OK",
    "Mounting /home/mike .................. OK",
    "Loading nebula shaders ............... OK",
    "Engaging display driver .............. OK",
    "Initializing wired-sh ..."
  ];

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function typeInto(el) {
    var txt = el.getAttribute("data-text") || "";
    el.textContent = "";
    for (var i = 0; i < txt.length; i++) { el.textContent += txt.charAt(i); await sleep(45); }
  }

  async function play() {
    boot.style.display = "block";

    // draw the SpaceOS splash line-by-line, like real terminal output
    var artLines = ART.replace(/^\n/, "").split("\n");
    for (var i = 0; i < artLines.length; i++) {
      var a = document.createElement("div");
      a.className = "boot-art";
      a.textContent = artLines[i];
      boot.appendChild(a);
      await sleep(85 + Math.random() * 45);
    }
    await sleep(520);

    for (var j = 0; j < LOG.length; j++) {
      var ln = document.createElement("div");
      ln.className = "boot-line";
      ln.textContent = LOG[j];
      boot.appendChild(ln);
      await sleep(150 + Math.random() * 95);
    }
    await sleep(650);

    // stash + clear the command text so we can type it out
    for (var j = 0; j < typedEls.length; j++) {
      typedEls[j].setAttribute("data-text", typedEls[j].textContent);
      typedEls[j].textContent = "";
    }
    boot.style.display = "none";
    cons.classList.add("on");

    await sleep(220);
    if (typedEls[0]) await typeInto(typedEls[0]);
    await sleep(260);
    if (outs[0]) outs[0].classList.add("show");
    await sleep(700);

    if (typedEls[1]) await typeInto(typedEls[1]);
    await sleep(260);
    if (outs[1]) outs[1].classList.add("show");
    await sleep(250);
    if (endPrompt) endPrompt.classList.add("show");
  }

  play();
})();
