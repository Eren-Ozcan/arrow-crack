import "./styles.css";
import { mountCanvas } from "./render/canvas";

const canvas = document.querySelector<HTMLCanvasElement>("#board");
if (!canvas) throw new Error("board canvas missing");

mountCanvas(canvas);
