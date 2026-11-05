"use client";

import { Component, type ReactNode } from "react";

/**
 * One failing card must not break the page: any render error inside shows `fallback` instead.
 */
export class CardBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // Local only: no tracking service (PLAN §2).
    console.error("[StockLens] card failed to render", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
