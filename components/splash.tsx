import { AnimatedWordmark } from "./animated-wordmark";

/**
 * ~2 s welcome animation on the first page load of a browser session. Server-rendered and
 * CSS-driven (see `.splash` in globals.css), so it shows before any JS loads and never blocks
 * input. The tiny inline script marks later loads as "seen" so the splash stays out of the way.
 */
const SEEN_SCRIPT = `try{var k="stocklens-splash";if(sessionStorage.getItem(k))document.documentElement.dataset.splash="seen";else sessionStorage.setItem(k,"1")}catch(e){}`;

export function Splash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SEEN_SCRIPT }} />
      <div className="splash" aria-hidden="true">
        <AnimatedWordmark className="w-[min(72vw,360px)]" priority />
      </div>
    </>
  );
}
