import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnimatedWordmark } from "@/components/animated-wordmark";

describe("AnimatedWordmark", () => {
  const html = renderToStaticMarkup(<AnimatedWordmark />);

  it("renders the three bars in order, plus a light and a dark base", () => {
    const bars = [...html.matchAll(/loader\/bar-(\d)\.png/g)].map((m) => m[1]);
    expect(bars).toEqual(["1", "2", "3"]);
    expect(html).toContain("/brand/loader/base.webp");
    expect(html).toContain("/brand/loader/base-light.webp");
  });

  it("staggers the bars so they rise 1, 2, 3", () => {
    const delays = [...html.matchAll(/animation-delay:([\d.]+)s/g)].map((m) =>
      Number(m[1]),
    );
    expect(delays).toEqual([0, 0.16, 0.32]);
  });

  it("is decorative unless given a label", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(
      renderToStaticMarkup(<AnimatedWordmark label="Loading" />),
    ).toContain('aria-label="Loading"');
  });

  it("ships every image it references", () => {
    for (const f of [
      "base.webp",
      "base-light.webp",
      "bar-1.png",
      "bar-2.png",
      "bar-3.png",
    ]) {
      expect(existsSync(`public/brand/loader/${f}`)).toBe(true);
    }
  });
});
