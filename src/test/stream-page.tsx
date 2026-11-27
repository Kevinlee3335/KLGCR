import { PassThrough } from "node:stream";
import type { ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";

export function streamPage(content: ReactNode) {
  let html = "";
  const errors: unknown[] = [];
  const output = new PassThrough();
  output.setEncoding("utf8").on("data", chunk => { html += chunk; });
  const stream = renderToPipeableStream(<html><body>{content}</body></html>, {
    onShellReady: () => stream.pipe(output),
    onError: error => { errors.push(error); },
  });
  return { html: () => html, errors, close() { stream.abort(); output.destroy(); } };
}
