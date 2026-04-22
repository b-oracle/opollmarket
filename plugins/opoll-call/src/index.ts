import { registerPlugin } from "@capacitor/core";
import type { OpollCallPlugin } from "./definitions";

const OpollCall = registerPlugin<OpollCallPlugin>("OpollCall");

export * from "./definitions";
export { OpollCall };
