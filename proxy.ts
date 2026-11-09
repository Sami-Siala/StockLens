import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals and static files. Static files are matched by a
  // known extension, not by "any dot": tickers such as MC.PA, 7203.T and BRK.B have a dot too and
  // must still get their locale prefix.
  matcher: [
    "/((?!api|_next|_vercel|.*\\.(?:ico|png|jpe?g|webp|gif|svg|avif|txt|xml|json|webmanifest|map|css|js|woff2?)$).*)",
  ],
};
