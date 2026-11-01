---
name: tamagui-theme-generator
description: Generate custom Tamagui themes, color palettes, and preview URLs. Use when creating or refining a color scheme, authoring light/dark palettes with brand accents, or previewing generated themes in the browser.
metadata:
  version: 3.0.0
---

# Tamagui Theme Generator Skill

Tamagui themes generate from palettes with light and dark scales. To generate a custom theme for Tamagui:

1. Create a theme configuration with "base" and "accent" palettes:
```json
{
  "name": "Emerald Cyber",
  "schemes": { "light": true, "dark": true },
  "palettes": {
    "base": {
      "name": "base",
      "anchors": [
        {
          "index": 0,
          "hue": { "sync": true, "light": 160, "dark": 160 },
          "sat": { "sync": true, "light": 0.08, "dark": 0.12 },
          "lum": { "light": 0.99, "dark": 0.02 },
          "alpha": { "light": 1, "dark": 1 }
        },
        {
          "index": 8,
          "hue": { "syncLeft": true, "sync": true, "light": 160, "dark": 160 },
          "sat": { "syncLeft": true, "sync": true, "light": 0.08, "dark": 0.12 },
          "lum": { "light": 0.5, "dark": 0.5 },
          "alpha": { "light": 1, "dark": 1 }
        },
        {
          "index": 9,
          "hue": { "sync": true, "light": 160, "dark": 160 },
          "sat": { "sync": true, "light": 0.08, "dark": 0.12 },
          "lum": { "light": 0.15, "dark": 0.925 },
          "alpha": { "light": 1, "dark": 1 }
        },
        {
          "index": 10,
          "hue": { "syncLeft": true, "sync": true, "light": 160, "dark": 160 },
          "sat": { "syncLeft": true, "sync": true, "light": 0.08, "dark": 0.12 },
          "lum": { "light": 0.01, "dark": 0.99 },
          "alpha": { "light": 1, "dark": 1 }
        }
      ]
    },
    "accent": {
      "name": "accent",
      "anchors": [
        {
          "index": 0,
          "hue": { "sync": true, "light": 155, "dark": 155 },
          "sat": { "sync": true, "light": 0.9, "dark": 0.95 },
          "lum": { "light": 0.4, "dark": 0.35 },
          "alpha": { "light": 1, "dark": 1 }
        },
        {
          "index": 8,
          "hue": { "syncLeft": true, "sync": true, "light": 155, "dark": 155 },
          "sat": { "syncLeft": true, "sync": true, "light": 0.9, "dark": 0.95 },
          "lum": { "light": 0.65, "dark": 0.6 },
          "alpha": { "light": 1, "dark": 1 }
        },
        {
          "index": 9,
          "hue": { "sync": true, "light": 155, "dark": 155 },
          "sat": { "sync": true, "light": 0.9, "dark": 0.95 },
          "lum": { "light": 0.95, "dark": 0.9 },
          "alpha": { "light": 1, "dark": 1 }
        },
        {
          "index": 10,
          "hue": { "syncLeft": true, "sync": true, "light": 155, "dark": 155 },
          "sat": { "syncLeft": true, "sync": true, "light": 0.9, "dark": 0.95 },
          "lum": { "light": 0.95, "dark": 0.95 },
          "alpha": { "light": 1, "dark": 1 }
        }
      ]
    }
  }
}
```

2. Generate a preview URL for the user to view in the browser:
Serialize the JSON, base64-encode it, and construct:
https://tamagui.dev/theme#theme=<base64-json>

3. Or run the Tamagui CLI to open the browser automatically:
npx tamagui preview-theme ./theme.json
