import { ScrollViewStyleReset } from 'expo-router/html';
import React from 'react';

const mobileOptimizations = `
  html, body {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: none;
  }
  *, *::before, *::after {
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    box-sizing: border-box;
  }
  input, textarea, select {
    touch-action: auto;
    cursor: text;
  }
  [data-focusable="false"], [aria-disabled="true"] {
    cursor: default;
  }
`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <title>Super Escola</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: mobileOptimizations }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
