import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

/** Locale-aware Link / usePathname / useRouter (does not touch the next-intl config). */
export const { Link, usePathname, useRouter } = createNavigation(routing);
