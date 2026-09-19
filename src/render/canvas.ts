/**
 * Milestone 0 placeholder renderer: a blank, correctly scaled canvas.
 * The real board renderer (ART.md) replaces the draw call in milestone 3.
 */
export function mountCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const { clientWidth: w, clientHeight: h } = canvas;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, w, h);
  };

  const draw = (c: CanvasRenderingContext2D, w: number, h: number): void => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#12131a";
    c.fillRect(0, 0, w, h);
  };

  window.addEventListener("resize", resize);
  resize();
}
