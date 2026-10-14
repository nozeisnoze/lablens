export async function makePaddleOCR() {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  const pending = new Map();
  let id = 0,
    closed = false,
    busy = false;
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    data.error
      ? request.reject(new Error(data.error))
      : request.resolve(data.result);
  };
  const terminate = () => {
    if (closed) return;
    closed = true;
    worker.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("PaddleOCR stopped"));
    }
    pending.clear();
  };
  worker.onerror = (event) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(event.message || "PaddleOCR worker failed"));
    }
    pending.clear();
    terminate();
  };
  function call(type, image, transfer = []) {
    if (closed) return Promise.reject(new Error("PaddleOCR stopped"));
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new Error(
            "PaddleOCR timed out; engine stopped rather than silently reverting to Tesseract.",
          ),
        );
        terminate();
      }, 120000);
      pending.set(requestId, { resolve, reject, timer });
      worker.postMessage({ id: requestId, type, image }, transfer);
    });
  }
  try {
    await call("initialize");
  } catch (error) {
    terminate();
    throw error;
  }
  return {
    async recognize(canvas) {
      if (busy) throw new Error("PaddleOCR inference already running");
      busy = true;
      try {
        const pixels = canvas
          .getContext("2d", { willReadFrequently: true })
          .getImageData(0, 0, canvas.width, canvas.height).data;
        return await call(
          "recognize",
          { data: pixels.buffer, width: canvas.width, height: canvas.height },
          [pixels.buffer],
        );
      } finally {
        busy = false;
      }
    },
    terminate: async () => terminate(),
    engine: "PaddleOCR PP-OCRv4 / ONNX WASM",
  };
}
