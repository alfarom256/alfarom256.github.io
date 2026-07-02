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

  // blocky BIOS splash: a procedurally-generated spiral galaxy (░▒▓█) + banner.
  // Deterministic (no randomness), so it renders identically every boot.
  var ART = (function () {
    var rows = 15, aspect = 2.0, incl = 1.25, cy = (rows - 1) / 2,
        Rv = (rows - 1) / 2, Rh = Rv * aspect * 1.1,
        cols = Math.ceil(Rh * 2) + 3, cx = cols / 2,
        arms = 2, tight = 3.3, coreR = 1.8, maxR = Rh, sigma = 0.4, out = [];
    for (var y = 0; y < rows; y++) {
      var line = "";
      for (var x = 0; x < cols; x++) {
        var dx = x - cx + 0.5, dy = (y - cy) * aspect * incl,
            r = Math.sqrt(dx * dx + dy * dy), theta = Math.atan2(dy, dx);
        var disc = Math.exp(-r / (maxR * 0.5)) * 0.26;
        var core = Math.exp(-(r * r) / (2 * coreR * coreR)) * 1.4;
        var armAngle = tight * Math.log(r + 0.5), best = 0;
        for (var a = 0; a < arms; a++) {
          var ph = theta - armAngle - a * Math.PI;
          ph = Math.atan2(Math.sin(ph), Math.cos(ph));
          var near = Math.exp(-(ph * ph) / (2 * sigma * sigma));
          if (near > best) best = near;
        }
        var arm = best * Math.pow(Math.max(0, 1 - r / maxR), 0.85);
        var b = (r > maxR) ? 0 : core + arm + disc;
        line += b > 0.7 ? "█" : b > 0.4 ? "▓" : b > 0.19 ? "▒" : b > 0.08 ? "░" : " ";
      }
      out.push(line.replace(/\s+$/, ""));
    }
    while (out.length && out[0] === "") out.shift();
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.concat([
      "",
      "        S P A C E   O S      v1.0",
      "        phosphor kernel · WiredSystems"
    ]);
  })();

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
    for (var i = 0; i < ART.length; i++) {
      var a = document.createElement("div");
      a.className = "boot-art";
      a.textContent = ART[i];
      boot.appendChild(a);
      await sleep(55 + Math.random() * 35);
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
