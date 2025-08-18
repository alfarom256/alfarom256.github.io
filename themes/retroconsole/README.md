# retroconsole — A Hugo theme

Minimalist technical blog in retro console style with a pixel-art galaxy background and occasional meteors.
Text cards are semi-translucent so the background subtly shows through.

## Quick start

```bash
# From your Hugo site root:
git submodule add <this-theme-repo> themes/retroconsole
# or copy the `retroconsole` folder into themes/

# Use example config
cp themes/retroconsole/exampleSite/config.toml ./config.toml

# Create your first post
hugo new posts/hello-world.md

# Run
hugo server -D
```

### Config options (config.toml)

```toml
baseURL = "http://localhost:1313/"
languageCode = "en-us"
title = "~/blog"
theme = "retroconsole"

[params]
  prompt = "mike@retro:~$"
  subtitle = "Minimalist technical notes in a console aesthetic."
```

## Notes

- Stars are rendered once as fixed-size pixels and do **not** change on resize.
- Meteors spawn infrequently with a light-blue head and short bright yellow tail.
- All styles are in `static/css/styles.css`.
- The background canvas script is `static/js/spacefield.js`.
