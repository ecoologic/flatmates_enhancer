# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Firefox WebExtension that enhances flatmates.com.au with annotation features — adding notes/tags to listings and user profiles. Data persists in browser local storage (`browser.storage.local`).

## Architecture

- **Manifest**: `manifest.json` (Manifest V2 for Firefox compatibility)
- **Content scripts**: Injected into flatmates.com.au pages to modify the DOM (add annotation UI)
- **Background script**: Manages storage and cross-tab state
- **Popup/options**: Extension popup for settings or overview

## Development

```bash
# Load temporarily in Firefox
about:debugging#/runtime/this-firefox → "Load Temporary Add-on" → select manifest.json

# Lint (if web-ext is installed)
npx web-ext lint

# Run with auto-reload
npx web-ext run
```

## Conventions

- Use `browser.*` APIs (Firefox native) rather than `chrome.*`
- Store annotations keyed by listing/profile URL or ID
- No build step unless a bundler becomes necessary — plain JS/HTML/CSS
