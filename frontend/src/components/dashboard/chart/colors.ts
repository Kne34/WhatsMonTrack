/** TradingView's own colors: candles and the drawing blue */
export const TV = { up: "#089981", down: "#F23645", blue: "#2962FF" };

/** #rrggbb with an alpha channel; other colors are returned as they are */
export const alpha = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}` : hex);
