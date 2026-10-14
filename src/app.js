import "./style.css";
import { Fusion } from "./fusion.js";
import { Session } from "./session.js";
import { Tracker } from "./tracker.js";
import { cropLabel } from "./ocr.js";
import { makeRecognitionEngine } from "./recognition.js";
const $ = (id) => document.getElementById(id),
  fusion = new Fusion(),
  session = new Session(),
  tracker = new Tracker();
const video = $("video"),
  overlay = $("overlay"),
  frame = document.createElement("canvas"),
  ctx = frame.getContext("2d", { willReadFrequently: true });
let stream,
  ocr,
  raf,
  busy = false,
  lastOCR = 0,
  lastTrack = 0,
  generation = 0,
  cameraEpoch = 0,
  mode = "idle",
  dirty = false,
  roi,
  drag,
  absent = 0,
  failures = 0,
  uncertain = true,
  stopped = false;
const status = (s) => ($("status").textContent = s);
function resetEvidence() {
  generation++;
  fusion.reset();
  dirty = false;
  lastOCR = 0;
  $("evidence").replaceChildren();
  $("lines").value = "";
  $("sampleId").value = "";
  $("message").textContent = "";
  $("duplicate").hidden = true;
  $("confirm").disabled = true;
  uncertain = true;
}
function guide() {
  return {
    x: frame.width * 0.32,
    y: frame.height * 0.27,
    w: frame.width * 0.36,
    h: frame.height * 0.46,
  };
}
function draw() {
  overlay.width = frame.width;
  overlay.height = frame.height;
  const c = overlay.getContext("2d");
  if (!roi) return;
  c.strokeStyle = mode === "lost" ? "#ffda82" : "#8ee4c8";
  c.lineWidth = Math.max(3, frame.width / 250);
  c.strokeRect(roi.x, roi.y, roi.w, roi.h);
}
function renderEvidence() {
  const lines = fusion.results();
  $("evidence").replaceChildren();
  uncertain = lines.some((l) => l.uncertain) || !lines.length;
  for (const l of lines) {
    const row = document.createElement("div");
    row.className = "line";
    for (const ch of l.characters) {
      const span = document.createElement("span");
      span.textContent = ch.text || "·";
      span.className = ch.uncertain || l.clipped ? "uncertain" : "";
      row.append(span);
    }
    const meta = document.createElement("span");
    meta.className = "metrics";
    meta.textContent = `${l.observations} observations · ${Math.round(l.agreement * 100)}% character agreement${l.clipped ? " · touches crop edge" : l.uncertain ? " · check this line" : ""}`;
    row.append(meta);
    $("evidence").append(row);
  }
  if (!dirty) $("lines").value = lines.map((l) => l.text).join("\n");
  $("confirm").disabled = !$("lines").value.trim();
}
async function loop(now) {
  if (stopped) return;
  raf = requestAnimationFrame(loop);
  if (video.readyState < 2 || now - lastTrack < 180) return;
  if (frame.width !== video.videoWidth || frame.height !== video.videoHeight) {
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    resetEvidence();
    tracker.reset();
    roi = guide();
    mode = "acquire";
  }
  lastTrack = now;
  ctx.drawImage(video, 0, 0, frame.width, frame.height);
  if (mode === "acquire") {
    roi = roi || guide();
    if (tracker.lock(ctx, roi)) {
      mode = "scanning";
      status("Reading label locally. Rotate slowly; review all lines.");
    } else status("Put the label inside the rectangle, or drag to resize it.");
  }
  const tracked = tracker.update(ctx);
  if (mode === "waiting") {
    // Old target must leave before a new sample can contribute evidence.
    absent = tracked && tracked.confidence < 0.4 ? absent + 1 : 0;
    if (absent >= 4) {
      tracker.reset();
      roi = guide();
      mode = "acquire";
      absent = 0;
      status("Next sample: put its label in the guide.");
    }
    draw();
    return;
  }
  if (mode !== "scanning") {
    draw();
    return;
  }
  if (!tracked || tracked.confidence < 0.65) {
    failures++;
    if (failures >= 3) {
      mode = "lost";
      generation++;
      status(
        "Tracking lost. Reposition the label and reset tracking; evidence is paused.",
      );
    }
    draw();
    return;
  }
  failures = 0;
  roi = tracked.roi;
  draw();
  if (!ocr || busy || now - lastOCR < 900) return;
  lastOCR = now;
  busy = true;
  const token = generation;
  // Capture at videoWidth/videoHeight; do not OCR the CSS-sized preview.
  const crop = cropLabel(
    frame,
    roi,
    fusion.frames % 2 ? "contrast" : "original",
  );
  try {
    const result = await ocr.recognize(crop);
    if (token === generation && mode === "scanning") {
      fusion.ingest(result.lines, {
        time: now,
        quality: Math.min(1, tracked.contrast / 24),
        tracking: tracked.confidence,
      });
      renderEvidence();
    }
  } catch (e) {
    if (token === generation)
      status(`OCR failed: ${e.message}. Reset tracking or restart camera.`);
  } finally {
    busy = false;
  }
}
async function stop() {
  cameraEpoch++;
  stopped = true;
  generation++;
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  const oldOCR = ocr;
  ocr = null;
  if (oldOCR) await oldOCR.terminate();
  busy = false;
  mode = "idle";
  $("start").disabled = false;
  $("stop").hidden = true;
  $("reacquire").hidden = true;
  status("Camera stopped. Session records remain in memory.");
}
$("start").onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("Camera needs HTTPS and Safari camera permission.");
    return;
  }
  $("start").disabled = true;
  $("stop").hidden = false;
  stopped = false;
  const epoch = ++cameraEpoch;
  resetEvidence();
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    if (epoch !== cameraEpoch || stopped) {
      newStream.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = newStream;
    video.srcObject = stream;
    await video.play();
    if (epoch !== cameraEpoch || stopped) return;
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    roi = guide();
    tracker.reset();
    mode = "acquire";
    $("stop").hidden = false;
    $("reacquire").hidden = false;
    status(`Loading local OCR · sensor ${frame.width} × ${frame.height}`);
    const newOCR = await makeRecognitionEngine();
    if (epoch !== cameraEpoch || stopped) {
      await newOCR.terminate();
      return;
    }
    ocr = newOCR;
    raf = requestAnimationFrame(loop);
  } catch (e) {
    if (epoch !== cameraEpoch) return;
    await stop();
    status(
      `Cannot start: ${e.message}. Check camera permission and local OCR assets.`,
    );
  }
};
$("stop").onclick = stop;
$("reacquire").onclick = () => {
  resetEvidence();
  tracker.reset();
  mode = "acquire";
  failures = 0;
  status(
    "Evidence cleared. Put the same or next label in the selected rectangle.",
  );
};
function point(e) {
  const r = overlay.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(frame.width, ((e.clientX - r.left) * frame.width) / r.width),
    ),
    y: Math.max(
      0,
      Math.min(frame.height, ((e.clientY - r.top) * frame.height) / r.height),
    ),
  };
}
overlay.onpointerdown = (e) => {
  if (!stream) return;
  drag = point(e);
  overlay.setPointerCapture(e.pointerId);
  generation++;
  mode = "selecting";
};
overlay.onpointermove = (e) => {
  if (!drag) return;
  const p = point(e);
  roi = {
    x: Math.min(drag.x, p.x),
    y: Math.min(drag.y, p.y),
    w: Math.abs(p.x - drag.x),
    h: Math.abs(p.y - drag.y),
  };
  draw();
};
overlay.onpointerup = () => {
  if (!drag) return;
  drag = null;
  if (roi.w < 30 || roi.h < 30) roi = guide();
  resetEvidence();
  tracker.reset();
  mode = "acquire";
};
overlay.onpointercancel = () => {
  drag = null;
  roi = guide();
  resetEvidence();
  tracker.reset();
  mode = "acquire";
};
for (const id of ["lines", "sampleId"])
  $(id).addEventListener("input", () => {
    dirty = true;
    $("confirm").disabled = !$("lines").value.trim();
    $("duplicate").hidden = true;
  });
for (const id of ["box", "position"])
  $(id).addEventListener("input", () => {
    $("duplicate").hidden = true;
  });
function confirm(allowDuplicate = false) {
  try {
    const result = session.add(
      {
        sampleId: $("sampleId").value,
        box: $("box").value,
        position: $("position").value,
        lines: $("lines")
          .value.split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        uncertainty: uncertain,
      },
      { allowDuplicate },
    );
    if (result.duplicate) {
      $("message").textContent =
        "Same sample ID, box and position already recorded. Correct the location, or explicitly add this duplicate.";
      $("duplicate").hidden = false;
      return;
    }
    const row = document.createElement("tr");
    for (const value of [
      result.record.sampleId,
      `${result.record.box} / ${result.record.position}`,
      result.record.lines.join("\n"),
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      row.append(td);
    }
    $("records").append(row);
    $("count").textContent = session.records.length;
    resetEvidence();
    $("box").value = "";
    $("position").value = "";
    mode = stream ? "waiting" : "idle";
    absent = 0;
    status(
      "Saved. Move this sample out of view before bringing in the next label.",
    );
  } catch (e) {
    $("message").textContent = e.message;
  }
}
$("confirm").onclick = () => confirm();
$("duplicate").onclick = () => confirm(true);
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + session.csv()], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "lablens-session.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(session.csv());
    $("message").textContent = "CSV copied.";
  } catch {
    $("csvFallback").hidden = false;
    $("csvFallback").value = session.csv();
    $("csvFallback").select();
    $("message").textContent = "Select and copy the CSV below.";
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) stop();
});
window.addEventListener("beforeunload", (e) => {
  if (session.records.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
